import * as THREE from 'three';
import { PITCH_LENGTH, PITCH_WIDTH, POPPING_CREASE_FROM_STUMPS, RETURN_CREASE_HALF_WIDTH } from '../core/Constants';

export const BOWLER_STUMPS_Z = -PITCH_LENGTH / 2;
export const STRIKER_STUMPS_Z = PITCH_LENGTH / 2;

export interface PitchVisualParams {
  baseColor: number;
  wornPatchIntensity: number; // 0..1, worn bowlers'-footmarks look
}

export function buildPitch(params: PitchVisualParams = { baseColor: 0xcdb079, wornPatchIntensity: 0.3 }): THREE.Group {
  const group = new THREE.Group();
  group.name = 'pitch';

  const stripLength = PITCH_LENGTH + 6; // extends past both stumps for run-up/follow-through area
  const stripGeo = new THREE.PlaneGeometry(PITCH_WIDTH, stripLength, 8, 32);
  const stripMat = new THREE.MeshStandardMaterial({ color: params.baseColor, roughness: 0.85, metalness: 0 });
  const strip = new THREE.Mesh(stripGeo, stripMat);
  strip.rotation.x = -Math.PI / 2;
  strip.position.y = 0.002;
  strip.receiveShadow = true;
  group.add(strip);

  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lineWidth = 0.06;

  function addLine(x: number, z: number, length: number, horizontal: boolean): void {
    const geo = horizontal ? new THREE.PlaneGeometry(length, lineWidth) : new THREE.PlaneGeometry(lineWidth, length);
    const mesh = new THREE.Mesh(geo, lineMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.004, z);
    group.add(mesh);
  }

  for (const stumpsZ of [BOWLER_STUMPS_Z, STRIKER_STUMPS_Z]) {
    const dir = stumpsZ < 0 ? 1 : -1; // popping crease sits in front of the stumps, toward the pitch center
    const poppingZ = stumpsZ + dir * POPPING_CREASE_FROM_STUMPS;
    addLine(0, poppingZ, RETURN_CREASE_HALF_WIDTH * 2, true);
    addLine(0, stumpsZ, 0.6, true); // bowling crease marker through the stumps
    addLine(-RETURN_CREASE_HALF_WIDTH, (poppingZ + stumpsZ) / 2 - dir * 0.4, 1.5, false);
    addLine(RETURN_CREASE_HALF_WIDTH, (poppingZ + stumpsZ) / 2 - dir * 0.4, 1.5, false);
  }

  return group;
}
