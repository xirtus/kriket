import { Quaternion, Vector3 } from 'three';
import { GRAVITY, BALL_MASS, BALL_RADIUS } from '../core/Constants';
import { BallState } from './BallState';
import { computeAeroForces } from './Aerodynamics';
import { resolvePitchBounce } from './PitchSurface';
import type { PitchProperties, BounceEvent } from './PitchSurface';

const GROUND_Y = BALL_RADIUS;
const _spinQuat = new Quaternion();
const _spinAxis = new Vector3();

export interface StepResult {
  bounce: BounceEvent | null;
}

export function stepBall(state: BallState, dt: number, pitch: PitchProperties, rng?: () => number): StepResult {
  if (state.isDead) return { bounce: null };

  const aero = computeAeroForces(state);
  const accel = aero.total.divideScalar(BALL_MASS);
  accel.y -= GRAVITY;

  state.velocity.addScaledVector(accel, dt);
  state.position.addScaledVector(state.velocity, dt);

  // Integrate visual spin orientation
  const omegaMag = state.angularVelocity.length();
  if (omegaMag > 1e-4) {
    _spinAxis.copy(state.angularVelocity).normalize();
    _spinQuat.setFromAxisAngle(_spinAxis, omegaMag * dt);
    state.orientation.premultiply(_spinQuat);
  }

  let bounce: BounceEvent | null = null;
  if (state.position.y <= GROUND_Y && state.velocity.y < 0) {
    bounce = resolvePitchBounce(state, pitch, rng);
  }

  return { bounce };
}
