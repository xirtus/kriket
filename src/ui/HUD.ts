import { Match } from '../gameplay/Match';

const OUTCOME_SYMBOL: Record<string, string> = {
  bowled: 'W',
  four: '4',
  six: '6',
  dot: '•',
  runs: '•', // overwritten per-ball with the actual run count in renderOverStrip
  'missed-stumps': '•',
};

export interface BallInfoState {
  phase: 'runup' | 'swing' | 'flight' | 'resolved';
  deliveryType?: string;
  speedKmh?: number;
}

export class HUD {
  private readonly root: HTMLDivElement;
  private readonly scoreBar: HTMLDivElement;
  private readonly runsEl: HTMLSpanElement;
  private readonly oversEl: HTMLSpanElement;
  private readonly rrEl: HTMLSpanElement;
  private readonly overStrip: HTMLDivElement;
  private readonly ballInfoEl: HTMLDivElement;
  private readonly commentaryEl: HTMLDivElement;
  private readonly helpEl: HTMLDivElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.style.cssText = `
      position: fixed; inset: 0; pointer-events: none;
      font-family: 'Segoe UI', Arial, sans-serif; color: #fff;
      text-shadow: 0 1px 4px rgba(0,0,0,0.8);
    `;

    this.scoreBar = document.createElement('div');
    this.scoreBar.style.cssText = `
      position: absolute; top: 14px; left: 14px; display: flex; align-items: stretch;
      border-radius: 6px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.5);
      font-variant-numeric: tabular-nums;
    `;
    const cell = (bg: string): HTMLDivElement => {
      const d = document.createElement('div');
      d.style.cssText = `background:${bg}; padding: 8px 14px; display:flex; align-items:center; gap:4px;`;
      return d;
    };
    const runsCell = cell('#123322');
    this.runsEl = document.createElement('span');
    this.runsEl.style.cssText = 'font-size: 24px; font-weight: 800; letter-spacing: 0.5px;';
    runsCell.appendChild(this.runsEl);

    const oversCell = cell('rgba(10,20,15,0.85)');
    this.oversEl = document.createElement('span');
    this.oversEl.style.cssText = 'font-size: 15px; font-weight: 600; opacity: 0.9;';
    oversCell.appendChild(this.oversEl);

    const rrCell = cell('rgba(10,20,15,0.65)');
    this.rrEl = document.createElement('span');
    this.rrEl.style.cssText = 'font-size: 13px; font-weight: 500; opacity: 0.85;';
    rrCell.appendChild(this.rrEl);

    this.scoreBar.append(runsCell, oversCell, rrCell);

    this.overStrip = document.createElement('div');
    this.overStrip.style.cssText = `
      position: absolute; top: 62px; left: 14px; display: flex; gap: 5px;
    `;

    this.ballInfoEl = document.createElement('div');
    this.ballInfoEl.style.cssText = `
      position: absolute; top: 14px; right: 14px; text-align: right;
      background: rgba(10,20,15,0.72); border: 1px solid rgba(255,255,255,0.15);
      border-radius: 8px; padding: 8px 16px; min-width: 140px;
      transition: opacity 0.25s;
    `;

    this.commentaryEl = document.createElement('div');
    this.commentaryEl.style.cssText = `
      position: absolute; bottom: 90px; left: 50%; transform: translateX(-50%);
      font-size: 28px; font-weight: 800; letter-spacing: 1px;
      transition: opacity 0.3s;
    `;

    this.helpEl = document.createElement('div');
    this.helpEl.style.cssText = `
      position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
      background: rgba(10,20,15,0.72); border: 1px solid rgba(255,255,255,0.15);
      border-radius: 8px; padding: 8px 16px; font-size: 13px; text-align: center;
    `;
    this.helpEl.textContent =
      'SPACE: attacking  |  SHIFT+SPACE: loft  |  Z: defensive  |  X: cut/pull  |  ←/→: aim direction';

    this.root.append(this.scoreBar, this.overStrip, this.ballInfoEl, this.commentaryEl, this.helpEl);
    document.body.appendChild(this.root);
  }

  updateScore(match: Match): void {
    this.runsEl.textContent = `${match.runs}/${match.wickets}`;
    this.oversEl.textContent = `${match.oversText} ov`;
    const oversFloat = match.legalBalls / 6;
    const rr = oversFloat > 0 ? match.runs / oversFloat : 0;
    this.rrEl.textContent = `RR ${rr.toFixed(2)}`;
    this.renderOverStrip(match);
  }

  private renderOverStrip(match: Match): void {
    const ballsThisOver = match.legalBalls % 6 || (match.legalBalls > 0 ? 6 : 0);
    const recent = match.history.slice(-ballsThisOver || -6);
    this.overStrip.innerHTML = '';
    for (const ball of recent) {
      const pill = document.createElement('div');
      const isWicket = ball.outcome === 'bowled';
      const isBoundary = ball.outcome === 'four' || ball.outcome === 'six';
      const label = isWicket ? 'W' : ball.outcome === 'runs' ? String(ball.runs) : ball.outcome === 'dot' ? '•' : ball.outcome === 'missed-stumps' ? '•' : (OUTCOME_SYMBOL[ball.outcome] ?? '•');
      pill.textContent = label;
      const bg = isWicket ? '#c0293e' : isBoundary ? '#2b7fd6' : 'rgba(255,255,255,0.12)';
      pill.style.cssText = `
        width: 24px; height: 24px; border-radius: 50%; background: ${bg};
        display: flex; align-items: center; justify-content: center;
        font-size: 12px; font-weight: 700; border: 1px solid rgba(255,255,255,0.25);
      `;
      this.overStrip.appendChild(pill);
    }
  }

  updateBallInfo(state: BallInfoState): void {
    if (state.phase === 'runup' || state.phase === 'swing') {
      this.ballInfoEl.style.opacity = '0';
      return;
    }
    this.ballInfoEl.style.opacity = '1';
    const speed = state.speedKmh && state.speedKmh > 5 ? `${state.speedKmh.toFixed(0)} km/h` : '';
    this.ballInfoEl.innerHTML = `
      <div style="font-size:11px; opacity:0.75; text-transform:uppercase; letter-spacing:1px;">${state.deliveryType ?? ''}</div>
      <div style="font-size:22px; font-weight:800;">${speed}</div>
    `;
  }

  showCommentary(text: string, colorHex = '#ffffff'): void {
    this.commentaryEl.textContent = text;
    this.commentaryEl.style.color = colorHex;
    this.commentaryEl.style.opacity = '1';
    window.setTimeout(() => {
      this.commentaryEl.style.opacity = '0';
    }, 1800);
  }
}
