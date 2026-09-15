export type BallOutcome = 'dot' | 'runs' | 'four' | 'six' | 'bowled' | 'missed-stumps';

export interface BallRecord {
  outcome: BallOutcome;
  runs: number;
  speedKmh: number;
  deliveryType: string;
  contact: string;
}

export class Match {
  runs = 0;
  wickets = 0;
  legalBalls = 0;
  history: BallRecord[] = [];

  get oversText(): string {
    const overs = Math.floor(this.legalBalls / 6);
    const balls = this.legalBalls % 6;
    return `${overs}.${balls}`;
  }

  recordBall(record: BallRecord): void {
    this.legalBalls += 1;
    this.runs += record.runs;
    if (record.outcome === 'bowled') this.wickets += 1;
    this.history.push(record);
  }
}
