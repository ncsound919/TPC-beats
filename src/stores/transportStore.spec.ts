import { describe, it, expect, beforeEach } from 'vitest';
import { useTransportStore } from './transportStore';

describe('transportStore', () => {
  beforeEach(() => {
    useTransportStore.getState().reset();
  });

  it('has correct default state', () => {
    const state = useTransportStore.getState();
    expect(state.bpm).toBe(92);
    expect(state.swing).toBe(54);
    expect(state.isPlaying).toBe(false);
    expect(state.isRecording).toBe(false);
    expect(state.isRecordArmed).toBe(false);
    expect(state.currentTick).toBe(0);
    expect(state.playhead).toBe(0);
    expect(state.metronomeOn).toBe(false);
  });

  it('togglePlay flips isPlaying', () => {
    useTransportStore.getState().togglePlay();
    expect(useTransportStore.getState().isPlaying).toBe(true);
    useTransportStore.getState().togglePlay();
    expect(useTransportStore.getState().isPlaying).toBe(false);
  });

  it('setPlaying sets playing state', () => {
    useTransportStore.getState().setPlaying(true);
    expect(useTransportStore.getState().isPlaying).toBe(true);
    useTransportStore.getState().setPlaying(false);
    expect(useTransportStore.getState().isPlaying).toBe(false);
  });

  it('toggleRecord flips isRecording', () => {
    useTransportStore.getState().toggleRecord();
    expect(useTransportStore.getState().isRecording).toBe(true);
    useTransportStore.getState().toggleRecord();
    expect(useTransportStore.getState().isRecording).toBe(false);
  });

  it('setRecording sets recording state', () => {
    useTransportStore.getState().setRecording(true);
    expect(useTransportStore.getState().isRecording).toBe(true);
    useTransportStore.getState().setRecording(false);
    expect(useTransportStore.getState().isRecording).toBe(false);
  });

  it('toggleRecordArm flips isRecordArmed', () => {
    useTransportStore.getState().toggleRecordArm();
    expect(useTransportStore.getState().isRecordArmed).toBe(true);
    useTransportStore.getState().toggleRecordArm();
    expect(useTransportStore.getState().isRecordArmed).toBe(false);
  });

  it('setRecordArmed sets record armed state', () => {
    useTransportStore.getState().setRecordArmed(true);
    expect(useTransportStore.getState().isRecordArmed).toBe(true);
    useTransportStore.getState().setRecordArmed(false);
    expect(useTransportStore.getState().isRecordArmed).toBe(false);
  });

  it('updateBpm clamps to 20-300', () => {
    useTransportStore.getState().updateBpm(10);
    expect(useTransportStore.getState().bpm).toBe(20);
    useTransportStore.getState().updateBpm(500);
    expect(useTransportStore.getState().bpm).toBe(300);
    useTransportStore.getState().updateBpm(128);
    expect(useTransportStore.getState().bpm).toBe(128);
  });

  it('updateSwing clamps to 0-100', () => {
    useTransportStore.getState().updateSwing(-5);
    expect(useTransportStore.getState().swing).toBe(0);
    useTransportStore.getState().updateSwing(200);
    expect(useTransportStore.getState().swing).toBe(100);
    useTransportStore.getState().updateSwing(60);
    expect(useTransportStore.getState().swing).toBe(60);
  });

  it('setCurrentTick updates tick', () => {
    useTransportStore.getState().setCurrentTick(42);
    expect(useTransportStore.getState().currentTick).toBe(42);
  });

  it('setPlayhead updates playhead', () => {
    useTransportStore.getState().setPlayhead(3.5);
    expect(useTransportStore.getState().playhead).toBe(3.5);
  });

  it('toggleMetronome flips metronomeOn', () => {
    useTransportStore.getState().toggleMetronome();
    expect(useTransportStore.getState().metronomeOn).toBe(true);
    useTransportStore.getState().toggleMetronome();
    expect(useTransportStore.getState().metronomeOn).toBe(false);
  });

  it('reset returns to defaults', () => {
    useTransportStore.getState().setPlaying(true);
    useTransportStore.getState().updateBpm(200);
    useTransportStore.getState().setCurrentTick(99);
    useTransportStore.getState().reset();
    const state = useTransportStore.getState();
    expect(state.bpm).toBe(92);
    expect(state.swing).toBe(54);
    expect(state.isPlaying).toBe(false);
    expect(state.isRecording).toBe(false);
    expect(state.isRecordArmed).toBe(false);
    expect(state.currentTick).toBe(0);
    expect(state.playhead).toBe(0);
    expect(state.metronomeOn).toBe(false);
  });
});
