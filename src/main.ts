import * as THREE from 'three';
import { Engine } from './render/Engine';
import { CameraRig } from './render/CameraRig';
import { buildGround } from './world/Ground';
import { buildPitch, BOWLER_STUMPS_Z, STRIKER_STUMPS_Z } from './world/Pitch';
import { buildStumps } from './world/Stumps';
import { Ball } from './entities/Ball';
import { Bowler } from './entities/Bowler';
import { Batsman } from './entities/Batsman';
import { InputManager } from './input/InputManager';
import { HUD } from './ui/HUD';
import { Match } from './gameplay/Match';
import { Delivery } from './gameplay/Delivery';
import { PITCH_PRESETS } from './physics/PitchSurface';
import { MS_TO_KMH } from './core/Constants';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = '';
const canvas = document.createElement('canvas');
canvas.style.cssText = 'position:fixed; inset:0; width:100vw; height:100vh; display:block;';
document.body.appendChild(canvas);

async function main(): Promise<void> {
  const engine = await Engine.create(canvas);
  const cameraRig = new CameraRig(engine.camera);

  const hemi = new THREE.HemisphereLight(0xbfe0ff, 0x2f5d34, 0.65);
  engine.scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d6, 2.2);
  sun.position.set(-30, 45, -20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.camera.far = 150;
  engine.scene.add(sun);
  engine.renderer.shadowMap.enabled = true;

  engine.scene.add(buildGround());
  engine.scene.add(buildPitch());

  const bowlerEndStumps = buildStumps();
  bowlerEndStumps.position.set(0, 0, BOWLER_STUMPS_Z);
  engine.scene.add(bowlerEndStumps);

  const strikerEndStumps = buildStumps();
  strikerEndStumps.position.set(0, 0, STRIKER_STUMPS_Z);
  engine.scene.add(strikerEndStumps);

  const ball = new Ball();
  engine.scene.add(ball.mesh);

  const bowler = new Bowler();
  engine.scene.add(bowler.root);

  const batsman = new Batsman();
  batsman.root.rotation.y = Math.PI; // face the bowler
  engine.scene.add(batsman.root);

  const input = new InputManager();
  const hud = new HUD();
  const match = new Match();
  const pitch = PITCH_PRESETS.green_seamer;

  let delivery = new Delivery(ball, bowler, batsman, input, pitch);
  let pauseTimer = 0;
  let resultHandled = false;

  (window as any).__kriket = {
    match,
    ball,
    input,
    getDelivery: () => delivery,
    fastForward: (seconds: number) => {
      const steps = Math.round(seconds * 120);
      for (let i = 0; i < steps; i++) engine.stepOnce(1 / 120);
      engine.renderFrame();
    },
  };

  engine.onUpdate((dt, elapsed) => {
    hud.updateScore(match);

    if (pauseTimer > 0) {
      pauseTimer -= dt;
      return;
    }

    delivery.update(dt, elapsed);
    cameraRig.update(ball.state.position, delivery.isBallInPlay(), dt);

    const speedKmh = ball.state.velocity.length() * MS_TO_KMH;
    hud.updateBallInfo({ phase: delivery.phase, deliveryType: delivery.deliveryType, speedKmh });

    if (delivery.result && !resultHandled) {
      resultHandled = true;
      const r = delivery.result;
      match.recordBall({ outcome: r.outcome, runs: r.runs, speedKmh: r.speedKmh, deliveryType: r.deliveryType, contact: r.contact });
      const labelMap: Record<string, string> = {
        bowled: 'BOWLED!',
        four: 'FOUR!',
        six: 'SIX!',
        dot: 'Dot ball',
        runs: `${r.runs} run${r.runs === 1 ? '' : 's'}`,
        'missed-stumps': 'Beaten!',
      };
      const colorMap: Record<string, string> = {
        bowled: '#ff4b4b',
        four: '#4bafff',
        six: '#ffd24b',
        dot: '#cccccc',
        runs: '#a6ff4b',
        'missed-stumps': '#ff9d4b',
      };
      hud.showCommentary(labelMap[r.outcome] ?? r.outcome, colorMap[r.outcome] ?? '#fff');

      pauseTimer = 2.2;
      window.setTimeout(() => {
        cameraRig.resetToBowlerEnd();
        delivery = new Delivery(ball, bowler, batsman, input, pitch);
        resultHandled = false;
      }, 2100);
    }
  });

  engine.start();
}

main().catch((err) => {
  console.error('[main] failed to start engine', err);
  document.body.innerHTML = `<pre style="color:#fff;background:#900;padding:20px;font-size:16px;">${String(err?.stack ?? err)}</pre>`;
});
