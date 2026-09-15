import * as THREE from 'three';
import { Ball } from '../entities/Ball';
import { Bowler } from '../entities/Bowler';
import { Batsman } from '../entities/Batsman';
import { InputManager } from '../input/InputManager';
import type { ShotPower } from '../input/InputManager';
import { stepBall } from '../physics/Integrator';
import { planRelease } from '../physics/Release';
import { resolveBatContact } from '../physics/BatContact';
import type { BatSwing, ContactResult } from '../physics/BatContact';
import type { PitchProperties } from '../physics/PitchSurface';
import { stumpsBoundingBox } from '../world/Stumps';
import { BOWLER_STUMPS_Z, STRIKER_STUMPS_Z } from '../world/Pitch';
import type { DeliveryType } from '../physics/BallState';
import type { BallOutcome } from './Match';
import { BOUNDARY_RADIUS } from '../core/Constants';

const RUNUP_LENGTH = 15;
const RUNUP_DURATION = 1.55;
const DELIVERY_SWING_DURATION = 0.28;
const BATSMAN_CONTACT_Z = STRIKER_STUMPS_Z - 1.2;

// Height model for contact quality: real batters adjust their swing plane to wherever the ball
// actually arrives and mainly get punished for misjudging line/timing, not height. So there's a
// wide "comfortable" band (shin-to-chest-ish) with zero height penalty, tapering penalty bands on
// either side, and only genuine extremes (a true yorker skidding in near the base of the stumps,
// or a bouncer arriving above head height) meaningfully hurt contact quality.
const COMFORT_HEIGHT_LOW = 0.25; // m, below this a full/yorker-length ball starts punishing digs
const COMFORT_HEIGHT_HIGH = 1.35; // m, above this a short ball starts punishing rushed shots
const HITTABLE_HEIGHT_LOW = 0.05; // m, true yorker at the base of the stumps - essentially unplayable
const HITTABLE_HEIGHT_HIGH = 2.0; // m, ball climbing past head height - essentially unplayable
const HEIGHT_OFFSET_SCALE = 0.35; // m-equivalent offset contributed by a full-strength height extreme
const OUTFIELD_PITCH: PitchProperties = {
  restitution: 0.42,
  friction: 0.75,
  seamCatchiness: 0.05,
  hardness: 0.6,
  label: 'Outfield Grass',
};

type Phase = 'runup' | 'swing' | 'flight' | 'resolved';

export interface DeliveryPlan {
  type: DeliveryType;
  speedKmh: number;
  lengthFromBatsmanStumps: number; // meters up the pitch from striker's stumps
  lineOffset: number; // meters, +off / -leg
  spinRpm: number;
}

export interface DeliveryResult {
  outcome: BallOutcome;
  runs: number;
  speedKmh: number;
  deliveryType: DeliveryType;
  contact: string;
  bounceLateralDeviation: number;
}

const stumpsBoxStriker = stumpsBoundingBox(STRIKER_STUMPS_Z);

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

// 0 within the comfortable band, ramping to 1 at the hittable extreme, on either side.
function heightPenalty(height: number): number {
  if (height < COMFORT_HEIGHT_LOW) {
    return clamp01((COMFORT_HEIGHT_LOW - height) / (COMFORT_HEIGHT_LOW - HITTABLE_HEIGHT_LOW));
  }
  if (height > COMFORT_HEIGHT_HIGH) {
    return clamp01((height - COMFORT_HEIGHT_HIGH) / (HITTABLE_HEIGHT_HIGH - COMFORT_HEIGHT_HIGH));
  }
  return 0;
}

export function randomDeliveryPlan(): DeliveryPlan {
  const isPace = Math.random() < 0.6;
  const paceTypes: DeliveryType[] = ['seam-up', 'outswing', 'inswing'];
  const spinTypes: DeliveryType[] = ['legspin', 'offspin', 'topspin', 'googly'];
  const type = isPace
    ? paceTypes[Math.floor(Math.random() * paceTypes.length)]
    : spinTypes[Math.floor(Math.random() * spinTypes.length)];

  const speedKmh = isPace ? 128 + Math.random() * 18 : 78 + Math.random() * 16;
  const lengthFromBatsmanStumps = 3 + Math.random() * 8; // full (3) .. short (11)
  const lineOffset = (Math.random() - 0.5) * 0.9;
  const spinRpm = isPace ? 150 + Math.random() * 100 : 1400 + Math.random() * 900;

  return { type, speedKmh, lengthFromBatsmanStumps, lineOffset, spinRpm };
}

export class Delivery {
  phase: Phase = 'runup';
  private t = 0;
  private readonly plan: DeliveryPlan;
  private bounceLateralDeviation = 0;
  private contactResolved = false;
  result: DeliveryResult | null = null;

  constructor(
    private readonly ball: Ball,
    private readonly bowler: Bowler,
    private readonly batsman: Batsman,
    private readonly input: InputManager,
    private readonly pitch: PitchProperties,
    plan?: DeliveryPlan,
  ) {
    this.plan = plan ?? randomDeliveryPlan();
    this.bowler.setPosition(new THREE.Vector3(0, 0, BOWLER_STUMPS_Z - RUNUP_LENGTH));
    this.batsman.setPosition(new THREE.Vector3(0, 0, BATSMAN_CONTACT_Z));
    this.batsman.setReadyStance();
    this.ball.state.reset();
    this.ball.state.isDead = true; // not yet released
  }

  update(dt: number, elapsed: number): void {
    this.t += dt;

    if (this.phase === 'runup') {
      this.updateRunup();
    } else if (this.phase === 'swing') {
      this.updateSwing();
    } else if (this.phase === 'flight') {
      this.updateFlight(dt);
    }

    void elapsed;
  }

  private updateRunup(): void {
    const progress = Math.min(1, this.t / RUNUP_DURATION);
    const eased = progress * progress; // accelerating run-up
    const z = THREE.MathUtils.lerp(BOWLER_STUMPS_Z - RUNUP_LENGTH, BOWLER_STUMPS_Z + 1.3, eased);
    this.bowler.setPosition(new THREE.Vector3(0, 0, z));
    this.bowler.updateRunup(progress);

    if (progress >= 1) {
      this.phase = 'swing';
      this.t = 0;
    }
  }

  private updateSwing(): void {
    const progress = Math.min(1, this.t / DELIVERY_SWING_DURATION);
    this.bowler.playDeliverySwing(progress);

    if (progress >= 1) {
      this.releaseBall();
      this.phase = 'flight';
      this.t = 0;
    }
  }

  private releaseBall(): void {
    const bowlerPos = this.bowler.root.position;
    const releasePoint = new THREE.Vector3(bowlerPos.x + 0.25, 2.25, bowlerPos.z);
    const targetPoint = new THREE.Vector3(this.plan.lineOffset, 0, STRIKER_STUMPS_Z - this.plan.lengthFromBatsmanStumps);

    this.ball.state = planRelease({
      type: this.plan.type,
      speedKmh: this.plan.speedKmh,
      releasePoint,
      targetPoint,
      spinRpm: this.plan.spinRpm,
    });
    this.ball.state.isDead = false;
  }

  private updateFlight(dt: number): void {
    const surface = this.contactResolved ? OUTFIELD_PITCH : this.pitch;
    const step = stepBall(this.ball.state, dt, surface);
    if (step.bounce) {
      this.bounceLateralDeviation = step.bounce.lateralDeviation;
    }
    this.ball.syncVisual();

    const pos = this.ball.state.position;

    if (!this.contactResolved && pos.z >= BATSMAN_CONTACT_Z - 1.5 && pos.z <= STRIKER_STUMPS_Z + 0.5) {
      const swing = this.input.consumeSwing();
      if (swing) {
        this.attemptContact(swing);
      }
    }

    if (!this.contactResolved && this.checkStumpsHit()) {
      this.finish('bowled', 0, 'bowled');
      return;
    }

    if (this.contactResolved) {
      this.updateInPlay();
      return;
    }

    if (pos.z > STRIKER_STUMPS_Z + 2.5) {
      this.finish('dot', 0, 'left/no shot');
    }
  }

  private attemptContact(swingInput: { power: ShotPower; timestamp: number }): void {
    const v = this.ball.state.velocity;
    const p = this.ball.state.position;
    const timeToIdeal = v.z > 0.1 ? (BATSMAN_CONTACT_Z - p.z) / v.z : 0;
    const predicted = p.clone().addScaledVector(v, timeToIdeal);
    const timingError = -timeToIdeal;

    // Line (x) is the real skill test; height only penalizes genuine extremes (see constants above).
    const lineOffset = Math.abs(predicted.x);
    const heightOffsetEquivalent = heightPenalty(predicted.y) * HEIGHT_OFFSET_SCALE;
    const sweetSpotOffset = Math.hypot(lineOffset, heightOffsetEquivalent);

    const aimRad = THREE.MathUtils.degToRad(this.input.aimAngleDeg);
    let baseDir = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), aimRad);
    let batSpeed = 20;
    if (swingInput.power === 'defensive') batSpeed = 4;
    if (swingInput.power === 'loft') {
      batSpeed = 24;
      baseDir = baseDir.lerp(new THREE.Vector3(0, 1, 0), 0.45).normalize();
    }
    if (swingInput.power === 'cut') {
      // Horizontal, cross-bat swing: bat speed between defensive and full drive, face aimed square
      // off the wicket rather than down the ground. Sign follows the aim angle so it reads as a
      // cut (aim off-side) or a pull (aim leg-side) depending on where the player has aimed.
      batSpeed = 18;
      const squareSign = aimRad === 0 ? 1 : Math.sign(aimRad);
      const squareDir = new THREE.Vector3(squareSign, 0, 0);
      baseDir = baseDir.lerp(squareDir, 0.65).normalize();
    }

    const batSwing: BatSwing = {
      velocity: baseDir.clone().multiplyScalar(batSpeed),
      faceNormal: baseDir,
      sweetSpotOffset,
      timingError,
    };

    const result = resolveBatContact(this.ball.state, batSwing);
    this.contactResolved = true;
    this.lastContactResult = result;
    this.shotPower = swingInput.power;
    this.shotAnimT = 0;
  }

  private lastContactResult: ContactResult | null = null;
  private inPlayTimer = 0;
  private touchedGround = false;
  private shotPower: ShotPower = 'attacking';
  private shotAnimT = 0;
  private static readonly SHOT_ANIM_DURATION = 0.4;

  private updateInPlay(): void {
    this.shotAnimT += 1 / 120;
    // Batsman.playShot doesn't know about 'cut' yet (animation is owned by another agent); reuse
    // 'attacking' for the animation call until a dedicated horizontal-bat animation kind exists.
    const animKind = this.shotPower === 'cut' ? 'attacking' : this.shotPower;
    this.batsman.playShot(animKind, this.shotAnimT / Delivery.SHOT_ANIM_DURATION);

    if (this.lastContactResult?.outcome === 'missed') {
      if (this.checkStumpsHit()) {
        this.finish('bowled', 0, 'bowled (missed swing)');
      } else if (this.ball.state.position.z > STRIKER_STUMPS_Z + 2.5) {
        this.finish('missed-stumps', 0, 'missed');
      }
      return;
    }

    this.inPlayTimer += 1 / 60;
    const pos = this.ball.state.position;
    const dist = Math.hypot(pos.x, pos.z);

    if (pos.y <= 0.05 && this.ball.state.velocity.y < 0.3) this.touchedGround = true;

    if (dist > BOUNDARY_RADIUS) {
      const outcome: BallOutcome = this.touchedGround ? 'four' : 'six';
      this.finish(outcome, outcome === 'four' ? 4 : 6, this.lastContactResult?.outcome ?? 'middled');
      return;
    }

    const speed = this.ball.state.velocity.length();
    if (this.touchedGround && speed < 1.2) {
      const runs = Math.max(0, Math.min(3, Math.floor(dist / 18)));
      this.finish(runs > 0 ? 'runs' : 'dot', runs, this.lastContactResult?.outcome ?? 'middled');
    }
  }

  private checkStumpsHit(): boolean {
    return stumpsBoxStriker.containsPoint(this.ball.state.position);
  }

  /** True once the batsman has made contact and the ball is live in the outfield (for camera cuts). */
  isBallInPlay(): boolean {
    return this.contactResolved && this.lastContactResult?.outcome !== 'missed';
  }

  get deliveryType(): DeliveryType {
    return this.plan.type;
  }

  private finish(outcome: BallOutcome, runs: number, contact: string): void {
    if (this.phase === 'resolved') return;
    this.phase = 'resolved';
    this.ball.state.isDead = true;
    this.result = {
      outcome,
      runs,
      speedKmh: this.plan.speedKmh,
      deliveryType: this.plan.type,
      contact,
      bounceLateralDeviation: this.bounceLateralDeviation,
    };
  }
}
