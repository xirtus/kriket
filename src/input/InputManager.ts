export type ShotPower = 'defensive' | 'attacking' | 'loft' | 'cut';

export class InputManager {
  aimAngleDeg = 0; // -60..60, negative = leg side, positive = off side (relative to straight)
  private swingRequested = false;
  private swingPower: ShotPower = 'attacking';
  private swingTimestamp = 0;

  constructor() {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'ArrowLeft') this.aimAngleDeg = Math.max(-60, this.aimAngleDeg - 10);
    if (e.code === 'ArrowRight') this.aimAngleDeg = Math.min(60, this.aimAngleDeg + 10);
    if (e.code === 'Space') {
      this.swingRequested = true;
      this.swingPower = e.shiftKey ? 'loft' : 'attacking';
      this.swingTimestamp = performance.now() / 1000;
    }
    if (e.code === 'KeyZ') {
      this.swingRequested = true;
      this.swingPower = 'defensive';
      this.swingTimestamp = performance.now() / 1000;
    }
    if (e.code === 'KeyX') {
      // Horizontal-bat shot: cut (off side) / pull (leg side), direction driven by aimAngleDeg.
      this.swingRequested = true;
      this.swingPower = 'cut';
      this.swingTimestamp = performance.now() / 1000;
    }
  }

  consumeSwing(): { power: ShotPower; timestamp: number } | null {
    if (!this.swingRequested) return null;
    this.swingRequested = false;
    return { power: this.swingPower, timestamp: this.swingTimestamp };
  }
}
