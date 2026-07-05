import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface TransportState {
  isPlaying: boolean;
  isRecording: boolean;
  isRecordArmed: boolean;
  bpm: number;
  swing: number;
  currentTick: number;
  playhead: number;
  metronomeOn: boolean;

  togglePlay: () => void;
  setPlaying: (playing: boolean) => void;
  toggleRecord: () => void;
  setRecording: (recording: boolean) => void;
  toggleRecordArm: () => void;
  setRecordArmed: (armed: boolean) => void;
  updateBpm: (bpm: number) => void;
  updateSwing: (swing: number) => void;
  setCurrentTick: (tick: number) => void;
  setPlayhead: (playhead: number) => void;
  toggleMetronome: () => void;
  reset: () => void;
}

const initialState = {
  isPlaying: false,
  isRecording: false,
  isRecordArmed: false,
  bpm: 92,
  swing: 54,
  currentTick: 0,
  playhead: 0,
  metronomeOn: false,
};

export const useTransportStore = create<TransportState>()(
  devtools(
    persist(
      (set) => ({
        ...initialState,

        togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
        setPlaying: (playing) => set({ isPlaying: playing }),

        toggleRecord: () => set((state) => ({ isRecording: !state.isRecording })),
        setRecording: (recording) => set({ isRecording: recording }),

        toggleRecordArm: () => set((state) => ({ isRecordArmed: !state.isRecordArmed })),
        setRecordArmed: (armed) => set({ isRecordArmed: armed }),

        updateBpm: (bpm) => set({ bpm: Math.min(300, Math.max(20, bpm)) }),
        updateSwing: (swing) => set({ swing: Math.min(100, Math.max(0, swing)) }),

        setCurrentTick: (tick) => set({ currentTick: tick }),
        setPlayhead: (playhead) => set({ playhead }),

        toggleMetronome: () => set((state) => ({ metronomeOn: !state.metronomeOn })),

        reset: () => set(initialState),
      }),
      {
        name: 'tpc-transport-storage',
        partialize: (state) => ({
          bpm: state.bpm,
          swing: state.swing,
          metronomeOn: state.metronomeOn,
        }),
      }
    ),
    { name: 'transport-store' }
  )
);