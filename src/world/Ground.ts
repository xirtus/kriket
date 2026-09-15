import * as THREE from 'three';
import { BOUNDARY_RADIUS } from '../core/Constants';

export function buildGround(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'ground';

  const outfieldGeo = new THREE.CircleGeometry(BOUNDARY_RADIUS + 12, 96);
  const outfieldMat = new THREE.MeshStandardMaterial({ color: 0x2f8a3e, roughness: 0.95, metalness: 0 });
  const outfield = new THREE.Mesh(outfieldGeo, outfieldMat);
  outfield.rotation.x = -Math.PI / 2;
  outfield.receiveShadow = true;
  group.add(outfield);

  // Mowing rings for a broadcast-realistic outfield look
  for (let i = 1; i <= 5; i++) {
    const r = (BOUNDARY_RADIUS + 10) * (i / 5);
    const ringGeo = new THREE.RingGeometry(r - 1.2, r, 96);
    const shade = i % 2 === 0 ? 0x2c8339 : 0x319144;
    const ringMat = new THREE.MeshStandardMaterial({ color: shade, roughness: 0.95 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.001;
    ring.receiveShadow = true;
    group.add(ring);
  }

  const ropeGeo = new THREE.TorusGeometry(BOUNDARY_RADIUS, 0.06, 8, 128);
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  const rope = new THREE.Mesh(ropeGeo, ropeMat);
  rope.rotation.x = Math.PI / 2;
  rope.position.y = 0.06;
  group.add(rope);

  return group;
}
