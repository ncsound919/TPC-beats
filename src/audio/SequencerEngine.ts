import { Sequence } from '../types';
import { engine } from './AudioEngine';
import { programEngine } from './ProgramEngine';

export class SequencerEngine {
  private currentSequence: Sequence | null = null;
  private isPlaying = false;
  private currentTick = 0;
  private timerID: number | null = null;
  private lookahead = 25.0; // ms
  private scheduleAheadTime = 0.1; // s
  private nextNoteTime = 0.0;

  public onPadTrigger: ((padId: number, velocity: number, time: number) => void) | null = null;

  public getBpm(): number {
    return this.currentSequence?.bpm || 120;
  }

  public loadSequence(seq: Sequence) {
    this.currentSequence = seq;
  }

  public play() {
    if (!this.currentSequence || this.isPlaying) return;

    this.isPlaying = true;
    this.currentTick = 0;
    this.nextNoteTime = engine.ctx.currentTime + 0.05;
    this.scheduler();
  }

  public stop() {
    this.isPlaying = false;
    if (this.timerID !== null) {
      window.clearTimeout(this.timerID);
      this.timerID = null;
    }
  }

  private nextNote() {
    if (!this.currentSequence) return;

    const secondsPerBeat = 60.0 / this.currentSequence.bpm;
    const secondsPerTick = secondsPerBeat / (this.currentSequence.ppqn / 4);

    this.nextNoteTime += secondsPerTick;
    this.currentTick++;

    const totalTicks = this.currentSequence.lengthBars * 4 * this.currentSequence.ppqn;
    if (this.currentTick >= totalTicks) {
      this.currentTick = 0;
    }
  }

  private swing = 0.5;

  public setSwing(value: number) {
    this.swing = value;
  }

  private scheduleNote(tickNumber: number, time: number) {
    if (!this.currentSequence) return;

    const events = this.currentSequence.events.filter(e => e.timestampPPQN === tickNumber);
    if (events.length === 0) return;

    // Swing logic:
    // tickNumber % (ppqn / 2) determines position within an 8th note.
    // 0 is downbeat, ppqn/4 is the upbeat (off-beat 16th).
    const ppqn = this.currentSequence.ppqn;
    const ticksPer16th = ppqn / 4;
    const ticksPer8th = ppqn / 2;
    const posIn8th = tickNumber % ticksPer8th;

    events.forEach(event => {
      const pad = programEngine.getPad(event.padId);
      // Fallback to global swing (which is typically 0.5-0.75, or mapped from 0-100 to 0.5-1.0)
      const padSwing = pad?.swing !== undefined ? (pad.swing / 100) : this.swing;

      let adjustedTime = time;
      
      // Only swing the off-beat 16th note
      if (Math.abs(posIn8th - ticksPer16th) < 1) { // roughly on the off-beat
        const secondsPerBeat = 60.0 / this.currentSequence.bpm;
        const sixteenthDuration = secondsPerBeat / 4;
        
        // padSwing is 0.5 (50%) to 0.95 (95%)
        const normalizedSwing = Math.max(0.5, Math.min(0.95, padSwing));
        const swingShift = (normalizedSwing - 0.5) * 2.0; // 0.0 to 0.90
        adjustedTime += sixteenthDuration * swingShift;
      }

      // Audio itself is scheduled here, directly on the audio clock.
      programEngine.triggerPadAtTime(event.padId, event.velocity, adjustedTime);

      // UI/visual callback can stay approximate; it is not used for sound timing.
      if (this.onPadTrigger) {
        this.onPadTrigger(event.padId, event.velocity, adjustedTime);
      }
    });
  }

  private scheduler() {
    while (this.nextNoteTime < engine.ctx.currentTime + this.scheduleAheadTime) {
      this.scheduleNote(this.currentTick, this.nextNoteTime);
      this.nextNote();
    }

    if (this.isPlaying) {
      this.timerID = window.setTimeout(() => this.scheduler(), this.lookahead);
    }
  }
}

export const sequencer = new SequencerEngine();