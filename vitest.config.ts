import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
    globals: true,
    setupFiles: './tests/setup.ts',
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: [
        'src/**/*.spec.ts', 'src/**/*.spec.tsx', 'src/**/*.d.ts', 'src/main.tsx',
        'src/ui/**',
        'src/App.tsx',
        'src/audio/AudioEngine.ts',
        'src/audio/synths/JunoEngine.ts',
        'src/audio/synths/Rompler808Engine.ts',
        'src/components/MPC/WaveformDisplay.tsx',
        'src/components/MPC/DrumLibrary.tsx',
        'src/components/Mixer/**',
        'src/components/Synth/JunoSynth.tsx',
        'src/components/Synth/DX7Synth.tsx',
        'src/components/Synth/ModMatrix.tsx',
        'src/components/Synth/ProgressionGenerator.tsx',
        'src/components/Rompler/**',
        'src/hooks/useAutosave.ts',
        'src/hooks/useSampleLoader.ts',
      ],
    },
  },
});
