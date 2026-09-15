import * as THREE from 'three';
import { BAT_LENGTH, BAT_WIDTH } from '../core/Constants';

const SKIN = 0xc9986b;
const KIT_WHITE = 0xffffff;

const READY_POSE = -0.25;
const SHOT_ARCS: Record<'defensive' | 'attacking' | 'loft', [number, number]> = {
  defensive: [-0.1, 0.35],
  attacking: [-0.55, 1.7],
  loft: [-0.6, 2.15],
};
/** Fraction of progress at which bat-on-ball contact roughly happens, per shot. */
const CONTACT_T: Record<'defensive' | 'attacking' | 'loft', number> = {
  defensive: 0.42,
  attacking: 0.48,
  loft: 0.52,
};

/** Smoothstep-interpolated piecewise curve through explicit [time, value] keyframes. */
function kf(progress: number, points: ReadonlyArray<readonly [number, number]>): number {
  const p = THREE.MathUtils.clamp(progress, points[0][0], points[points.length - 1][0]);
  for (let i = 0; i < points.length - 1; i++) {
    const [t0, v0] = points[i];
    const [t1, v1] = points[i + 1];
    if (p <= t1) {
      const local = t1 > t0 ? (p - t0) / (t1 - t0) : 1;
      const eased = local * local * (3 - 2 * local);
      return THREE.MathUtils.lerp(v0, v1, eased);
    }
  }
  return points[points.length - 1][1];
}

export class Batsman {
  readonly root = new THREE.Group();
  readonly hipRoot = new THREE.Group();
  readonly chestPivot = new THREE.Group();
  readonly shoulderPivot = new THREE.Group();
  readonly bat: THREE.Mesh;
  readonly batTipWorld = new THREE.Vector3();
  private readonly armTopShoulder = new THREE.Group();
  private readonly armTopElbow = new THREE.Group();
  private readonly armBottomShoulder = new THREE.Group();
  private readonly armBottomElbow = new THREE.Group();
  private readonly legPivotL = new THREE.Group();
  private readonly legPivotR = new THREE.Group();

  constructor() {
    this.root.name = 'batsman';

    const kitMat = new THREE.MeshStandardMaterial({ color: KIT_WHITE, roughness: 0.75 });
    const skinMat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.7 });
    const batMat = new THREE.MeshStandardMaterial({ color: 0xd9b877, roughness: 0.4 });

    this.hipRoot.position.y = 0.9;
    this.root.add(this.hipRoot);
    this.hipRoot.add(this.chestPivot);

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.5, 4, 8), kitMat);
    torso.position.y = 0.33;
    torso.castShadow = true;
    this.chestPivot.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), skinMat);
    head.position.y = 0.75;
    head.castShadow = true;
    this.chestPivot.add(head);

    this.shoulderPivot.position.set(0, 0.58, 0.15);
    this.chestPivot.add(this.shoulderPivot);

    this.bat = new THREE.Mesh(new THREE.BoxGeometry(BAT_WIDTH, BAT_LENGTH, 0.03), batMat);
    this.bat.position.y = -BAT_LENGTH / 2 + 0.1;
    this.bat.castShadow = true;
    this.shoulderPivot.add(this.bat);

    // Both hands grip the handle near the top of the bat: a "top" arm (control
    // hand, left shoulder) and a "bottom" arm (power hand, right shoulder), each
    // shoulder -> elbow so they read as gripping rather than hanging loose.
    const gripY = -BAT_LENGTH / 2 + 0.1 + BAT_LENGTH / 2 - 0.08; // near handle top
    this.armTopShoulder.position.set(-0.15, 0.05, -0.02);
    this.shoulderPivot.add(this.armTopShoulder);
    const upperArmTop = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.22, 4, 8), skinMat);
    this.armTopShoulder.add(upperArmTop);
    this.armTopElbow.position.set(0.02, -0.15, 0.06);
    this.armTopShoulder.add(this.armTopElbow);
    const forearmTop = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.2, 4, 8), skinMat);
    this.armTopElbow.add(forearmTop);
    const handTop = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), skinMat);
    this.armTopElbow.add(handTop);
    this.orientArmToward(upperArmTop, forearmTop, handTop, this.armTopShoulder, this.armTopElbow, new THREE.Vector3(0.13, gripY - 0.02, 0.02));

    this.armBottomShoulder.position.set(0.15, 0.05, -0.02);
    this.shoulderPivot.add(this.armBottomShoulder);
    const upperArmBottom = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.22, 4, 8), skinMat);
    this.armBottomShoulder.add(upperArmBottom);
    this.armBottomElbow.position.set(-0.02, -0.15, 0.06);
    this.armBottomShoulder.add(this.armBottomElbow);
    const forearmBottom = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.2, 4, 8), skinMat);
    this.armBottomElbow.add(forearmBottom);
    const handBottom = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), skinMat);
    this.armBottomElbow.add(handBottom);
    this.orientArmToward(upperArmBottom, forearmBottom, handBottom, this.armBottomShoulder, this.armBottomElbow, new THREE.Vector3(-0.1, gripY - 0.14, 0.02));

    this.legPivotL.position.set(-0.11, 0, 0);
    this.legPivotR.position.set(0.11, 0, 0);
    this.hipRoot.add(this.legPivotL, this.legPivotR);
    const legGeo = new THREE.CapsuleGeometry(0.09, 0.62, 4, 8);
    const legL = new THREE.Mesh(legGeo, kitMat);
    legL.position.y = -0.4;
    legL.castShadow = true;
    this.legPivotL.add(legL);
    const legR = new THREE.Mesh(legGeo, kitMat);
    legR.position.y = -0.4;
    legR.castShadow = true;
    this.legPivotR.add(legR);

    this.setReadyStance();
  }

  /** Points an upper-arm/forearm pair from a shoulder pivot toward a local target so hands read as gripping the handle. */
  private orientArmToward(
    upper: THREE.Mesh,
    forearm: THREE.Mesh,
    hand: THREE.Mesh,
    shoulder: THREE.Group,
    elbow: THREE.Group,
    gripLocal: THREE.Vector3,
  ): void {
    upper.castShadow = true;
    forearm.castShadow = true;
    hand.castShadow = true;
    upper.position.y = -0.11;
    const toGrip = gripLocal.clone().sub(shoulder.position).sub(elbow.position);
    forearm.position.y = -toGrip.length() * 0.5;
    hand.position.y = -toGrip.length() - 0.03;
    const dir = toGrip.clone().normalize();
    elbow.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  }

  setPosition(p: THREE.Vector3): void {
    this.root.position.copy(p);
  }

  /** World-space position of the bat's striking sweet spot, for contact detection. */
  getSweetSpotWorld(target: THREE.Vector3): THREE.Vector3 {
    target.set(0, -BAT_LENGTH * 0.35, 0);
    this.bat.localToWorld(target);
    return target;
  }

  setReadyStance(): void {
    this.shoulderPivot.rotation.x = READY_POSE;
    this.chestPivot.rotation.set(0.05, -0.15, 0);
    this.hipRoot.rotation.y = -0.1;
    this.hipRoot.position.set(0, 0.9, 0);
    this.legPivotL.rotation.x = 0.05;
    this.legPivotR.rotation.x = -0.05;
    this.armTopShoulder.rotation.x = 0;
    this.armBottomShoulder.rotation.x = 0;
  }

  /** progress: 0..1 across the shot's backlift-to-follow-through arc. */
  playShot(kind: 'defensive' | 'attacking' | 'loft', progress: number): void {
    const p = Math.min(1, progress);
    const [from, to] = SHOT_ARCS[kind];
    const contactT = CONTACT_T[kind];
    const contactVal = THREE.MathUtils.lerp(from, to, 0.72);

    // Backlift (slow), fast downswing through contact, decelerating follow-through —
    // instead of one constant-speed lerp across the whole stroke.
    this.shoulderPivot.rotation.x = kf(p, [
      [0, READY_POSE],
      [0.18, from],
      [contactT, contactVal],
      [1, to],
    ]);

    // Shoulders rotate open through the shot (more for attacking/loft), hips
    // follow with less rotation and a small step of the front foot toward the line.
    const openAmount = kind === 'defensive' ? 0.25 : kind === 'attacking' ? 0.55 : 0.65;
    this.chestPivot.rotation.y = kf(p, [
      [0, -0.15],
      [0.18, -0.28],
      [contactT, openAmount * 0.6],
      [1, openAmount],
    ]);
    this.chestPivot.rotation.x = kf(p, [
      [0, 0.05],
      [0.18, -0.05],
      [contactT, 0.08],
      [1, kind === 'loft' ? -0.2 : 0.1],
    ]);
    this.hipRoot.rotation.y = kf(p, [
      [0, -0.1],
      [0.2, -0.15],
      [contactT, openAmount * 0.3],
      [1, openAmount * 0.45],
    ]);

    // Weight/root shifts toward the ball's line through contact, then eases back
    // toward guard — approximate footwork without full leg IK.
    const lean = kind === 'defensive' ? 0.06 : 0.1;
    this.hipRoot.position.z = kf(p, [
      [0, 0],
      [contactT, lean],
      [1, lean * 0.3],
    ]);
    this.hipRoot.position.y = 0.9 + kf(p, [
      [0, 0],
      [0.18, -0.03],
      [contactT, 0.02],
      [1, kind === 'loft' ? 0.05 : 0],
    ]);
    this.legPivotL.rotation.x = kf(p, [
      [0, 0.05],
      [0.2, 0.15],
      [contactT, -0.2],
      [1, -0.1],
    ]);
    this.legPivotR.rotation.x = kf(p, [
      [0, -0.05],
      [0.2, -0.12],
      [contactT, 0.1],
      [1, 0.15],
    ]);

    // Elbows straighten out through the hitting zone, then relax slightly on
    // the follow-through — reads as an actual swing rather than a rigid stick.
    const elbowBend = kf(p, [
      [0, 0.5],
      [0.2, 0.65],
      [contactT, 0.15],
      [1, 0.3],
    ]);
    this.armTopShoulder.rotation.x = kf(p, [
      [0, 0],
      [0.2, -0.15],
      [1, 0.1],
    ]);
    this.armBottomShoulder.rotation.x = this.armTopShoulder.rotation.x;
    this.armTopElbow.rotation.z = -elbowBend * 0.3;
    this.armBottomElbow.rotation.z = elbowBend * 0.3;
  }
}
