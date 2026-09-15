import * as THREE from 'three';

const SKIN = 0xc9986b;
const KIT_LIGHT = 0xf5f5f0;

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

/**
 * Procedural rig: pelvis (hipRoot) -> chest (independent yaw/lean for X-factor
 * separation) -> torso/head/two shoulder-elbow arm chains, plus two hip-knee leg
 * chains. Owns its own pose functions (updateRunup/playDeliverySwing) so callers
 * just feed a 0..1 progress value instead of poking rotations directly.
 */
export class Bowler {
  readonly root = new THREE.Group();
  readonly hipRoot = new THREE.Group();
  readonly chestPivot = new THREE.Group();
  /** Bowling-arm shoulder pivot (kept public/named as before — other code may reference it). */
  readonly shoulderPivot = new THREE.Group();
  private readonly shoulderPivotFront = new THREE.Group();
  private readonly elbowPivot = new THREE.Group();
  private readonly elbowPivotFront = new THREE.Group();
  private readonly legPivotL = new THREE.Group();
  private readonly legPivotR = new THREE.Group();
  private readonly kneePivotL = new THREE.Group();
  private readonly kneePivotR = new THREE.Group();
  private readonly torso: THREE.Mesh;

  constructor() {
    this.root.name = 'bowler';

    const kitMat = new THREE.MeshStandardMaterial({ color: KIT_LIGHT, roughness: 0.8 });
    const skinMat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.7 });

    this.hipRoot.position.y = 0.9;
    this.root.add(this.hipRoot);
    this.hipRoot.add(this.chestPivot);

    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.55, 4, 8), kitMat);
    this.torso.position.y = 0.35;
    this.torso.castShadow = true;
    this.chestPivot.add(this.torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), skinMat);
    head.position.y = 0.78;
    head.castShadow = true;
    this.chestPivot.add(head);

    // Bowling arm (shoulder -> elbow -> forearm), right side.
    this.shoulderPivot.position.set(0.21, 0.62, 0);
    this.chestPivot.add(this.shoulderPivot);
    const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.26, 4, 8), skinMat);
    upperArm.position.y = -0.15;
    upperArm.castShadow = true;
    this.shoulderPivot.add(upperArm);
    this.elbowPivot.position.y = -0.3;
    this.shoulderPivot.add(this.elbowPivot);
    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.28, 4, 8), skinMat);
    forearm.position.y = -0.16;
    forearm.castShadow = true;
    this.elbowPivot.add(forearm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), skinMat);
    hand.position.y = -0.32;
    hand.castShadow = true;
    this.elbowPivot.add(hand);

    // Non-bowling (front/balance) arm, left side — mirrors the chain above.
    this.shoulderPivotFront.position.set(-0.21, 0.62, 0);
    this.chestPivot.add(this.shoulderPivotFront);
    const upperArmF = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.26, 4, 8), skinMat);
    upperArmF.position.y = -0.15;
    upperArmF.castShadow = true;
    this.shoulderPivotFront.add(upperArmF);
    this.elbowPivotFront.position.y = -0.3;
    this.shoulderPivotFront.add(this.elbowPivotFront);
    const forearmF = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.28, 4, 8), skinMat);
    forearmF.position.y = -0.16;
    forearmF.castShadow = true;
    this.elbowPivotFront.add(forearmF);
    const handF = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), skinMat);
    handF.position.y = -0.32;
    handF.castShadow = true;
    this.elbowPivotFront.add(handF);

    // Legs (hip -> knee -> shin), attached at the pelvis so hip yaw carries them.
    this.legPivotL.position.set(-0.1, 0, 0);
    this.legPivotR.position.set(0.1, 0, 0);
    this.hipRoot.add(this.legPivotL, this.legPivotR);

    const thighGeo = new THREE.CapsuleGeometry(0.085, 0.32, 4, 8);
    const shinGeo = new THREE.CapsuleGeometry(0.07, 0.32, 4, 8);
    const thighL = new THREE.Mesh(thighGeo, kitMat);
    thighL.position.y = -0.17;
    thighL.castShadow = true;
    this.legPivotL.add(thighL);
    this.kneePivotL.position.y = -0.34;
    this.legPivotL.add(this.kneePivotL);
    const shinL = new THREE.Mesh(shinGeo, kitMat);
    shinL.position.y = -0.17;
    shinL.castShadow = true;
    this.kneePivotL.add(shinL);

    const thighR = new THREE.Mesh(thighGeo, kitMat);
    thighR.position.y = -0.17;
    thighR.castShadow = true;
    this.legPivotR.add(thighR);
    this.kneePivotR.position.y = -0.34;
    this.legPivotR.add(this.kneePivotR);
    const shinR = new THREE.Mesh(shinGeo, kitMat);
    shinR.position.y = -0.17;
    shinR.castShadow = true;
    this.kneePivotR.add(shinR);
  }

  setPosition(p: THREE.Vector3): void {
    this.root.position.copy(p);
  }

  /** progress: 0..1 across the whole run-up approach. */
  updateRunup(progress: number): void {
    const stride = Math.sin(progress * Math.PI * 9);
    const swingR = Math.max(0, -stride); // right leg in forward swing phase
    const swingL = Math.max(0, stride); // left leg in forward swing phase

    this.legPivotR.rotation.x = -stride * 0.55;
    this.legPivotL.rotation.x = stride * 0.55;
    this.kneePivotR.rotation.x = 0.25 + swingR * 1.0;
    this.kneePivotL.rotation.x = 0.25 + swingL * 1.0;

    // Arms swing contralateral to the same-side leg — natural running gait.
    this.shoulderPivot.rotation.x = stride * 0.5;
    this.shoulderPivotFront.rotation.x = -stride * 0.5;
    this.elbowPivot.rotation.x = 0.5 + Math.max(0, -stride) * 0.4;
    this.elbowPivotFront.rotation.x = 0.5 + Math.max(0, stride) * 0.4;

    this.hipRoot.position.y = 0.9 + Math.abs(stride) * 0.05;
    this.hipRoot.rotation.y = stride * 0.06;
    this.chestPivot.rotation.x = 0.15;
    this.chestPivot.rotation.y = -stride * 0.05;
  }

  /** progress: 0..1 across the bowling-arm delivery swing. */
  playDeliverySwing(progress: number): void {
    const p = Math.min(1, progress);

    // Bowling arm: slow gather/cock, then a fast whip through release, easing out
    // through the follow-through instead of one constant-speed sweep.
    this.shoulderPivot.rotation.x = kf(p, [
      [0, -1.1],
      [0.28, -2.25],
      [0.55, -1.0],
      [0.8, 2.35],
      [1, 2.85],
    ]);
    this.elbowPivot.rotation.x = kf(p, [
      [0, 0.5],
      [0.28, 0.75],
      [0.55, 0.35],
      [0.8, 0.05],
      [1, 0.2],
    ]);

    // Front (non-bowling) arm reaches up for balance, then pulls down hard into
    // the body right at release — the classic fast-bowling "pull-down" cue.
    this.shoulderPivotFront.rotation.x = kf(p, [
      [0, -0.3],
      [0.3, -1.6],
      [0.6, -1.85],
      [0.8, 0.5],
      [1, 0.75],
    ]);
    this.elbowPivotFront.rotation.x = kf(p, [
      [0, 0.4],
      [0.3, 0.15],
      [0.6, 0.1],
      [0.8, 0.6],
      [1, 0.8],
    ]);

    // Chest rotates further/faster than the hips (X-factor separation), then the
    // hips catch up through release — reads as a real coiled delivery stride.
    this.hipRoot.rotation.y = kf(p, [
      [0, -0.5],
      [0.3, -0.6],
      [0.6, -0.2],
      [0.85, 0.3],
      [1, 0.45],
    ]);
    this.chestPivot.rotation.y = kf(p, [
      [0, 0],
      [0.3, -0.2],
      [0.6, 0.15],
      [0.85, 0.95],
      [1, 1.15],
    ]);
    this.chestPivot.rotation.x = kf(p, [
      [0, 0.1],
      [0.3, 0.02],
      [0.6, -0.15],
      [0.85, -0.5],
      [1, -0.6],
    ]);

    // Front leg reaches out and plants firmly (braced), trailing leg drives and
    // then comes through in the follow-through.
    this.legPivotL.rotation.x = kf(p, [
      [0, -0.25],
      [0.25, -0.55],
      [0.5, -0.6],
      [1, -0.5],
    ]);
    this.kneePivotL.rotation.x = kf(p, [
      [0, 0.35],
      [0.5, 0.15],
      [1, 0.25],
    ]);
    this.legPivotR.rotation.x = kf(p, [
      [0, 0.3],
      [0.3, 0.5],
      [0.6, 0.15],
      [0.85, -0.4],
      [1, -0.55],
    ]);
    this.kneePivotR.rotation.x = kf(p, [
      [0, 0.5],
      [0.3, 0.8],
      [0.6, 1.0],
      [0.85, 0.5],
      [1, 0.3],
    ]);

    // Small vertical dip on the gather then drive/rise into release.
    this.hipRoot.position.y = 0.9 + kf(p, [
      [0, 0],
      [0.3, -0.06],
      [0.65, 0.02],
      [1, 0.06],
    ]);
  }
}
