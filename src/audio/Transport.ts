import { BaseAudioContext } from '../types';

export class Transport {
  private ctx: BaseAudioContext;
  private bpm: number = 92;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
  }

  public setBPM(bpm: number): void {
    this.bpm = bpm;
  }

  public getBPM(): number {
    return this.bpm;
  }
}
