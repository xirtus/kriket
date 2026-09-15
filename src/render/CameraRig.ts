import * as THREE from 'three';
import { BOWLER_STUMPS_Z, STRIKER_STUMPS_Z } from '../world/Pitch';

type Angle = 'bowler-end' | 'square';

/**
 * Broadcast-style multi-camera rig: a bowler's-end cam tracks the run-up/delivery/flight-to-bat,
 * then a hard cut to a square-of-the-wicket cam takes over once the ball is struck and live in
 * the outfield (a single cam awkwardly swiveling >90deg to chase a square-driven ball reads as
 * amateur; real broadcasts cut instead).
 */
export class CameraRig {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly bowlerEndPos = new THREE.Vector3(0, 7.5, BOWLER_STUMPS_Z - 22);
  private readonly squareBasePos = new THREE.Vector3(34, 9, 0);
  private readonly lookTarget = new THREE.Vector3(0, 1, 0);
  private angle: Angle = 'bowler-end';

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.camera.position.copy(this.bowlerEndPos);
    this.camera.lookAt(0, 1, STRIKER_STUMPS_Z);
  }

  get currentAngle(): Angle {
    return this.angle;
  }

  /** Call every frame; internally routes to the active angle and decides cuts. */
  update(ballPos: THREE.Vector3, ballInPlay: boolean, dt: number): void {
    if (ballInPlay && this.angle === 'bowler-end') {
      this.cutToSquare();
    }
    if (this.angle === 'bowler-end') {
      this.trackBowlerEnd(ballPos, dt);
    } else {
      this.trackSquare(ballPos, dt);
    }
  }

  private trackBowlerEnd(ballPos: THREE.Vector3, dt: number): void {
    const panLerp = 1 - Math.pow(0.001, dt);
    this.lookTarget.lerp(ballPos, panLerp * 3);
    this.camera.lookAt(this.lookTarget);
  }

  private trackSquare(ballPos: THREE.Vector3, dt: number): void {
    const dollyLerp = 1 - Math.pow(0.0005, dt);
    const targetPos = this.squareBasePos.clone();
    targetPos.z = THREE.MathUtils.clamp(ballPos.z, -30, 30) * 0.6;
    this.camera.position.lerp(targetPos, dollyLerp);
    this.lookTarget.lerp(ballPos, dollyLerp * 4);
    this.camera.lookAt(this.lookTarget);
  }

  private cutToSquare(): void {
    this.angle = 'square';
    this.camera.position.copy(this.squareBasePos);
  }

  setWideShot(): void {
    this.camera.position.set(6, 8, -4);
    this.camera.lookAt(0, 1, STRIKER_STUMPS_Z - 4);
  }

  /** Hard cut back to the bowler's end for the next delivery. */
  resetToBowlerEnd(): void {
    this.angle = 'bowler-end';
    this.camera.position.copy(this.bowlerEndPos);
    this.lookTarget.set(0, 1, 0);
    this.camera.lookAt(0, 1, STRIKER_STUMPS_Z);
  }
}
