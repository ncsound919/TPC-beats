import { describe, it, expect } from 'vitest';
import {
  NOTE_NAMES,
  SCALE_INTERVALS,
  DEGREE_PROGRESSIONS,
  ChordGenerator,
} from './ChordGenerator';
import type { ProgressionParams } from './ChordGenerator';

const defaultParams: ProgressionParams = {
  rootNote: 'C',
  scale: 'major',
  progressionType: 'pop',
  rhythmStyle: 'straight',
  chordExtension: 'triad',
  octaveOffset: 0,
  humanizeVelocity: false,
  strumDelayMs: 0,
  gateLengthPct: 80,
  bassStyle: 'root',
  leadStyle: 'off',
  bassSynth: 'juno',
  rhythmSynth: 'juno',
  leadSynth: 'juno',
};

// ---------------------------------------------------------------------------
// NOTE_NAMES
// ---------------------------------------------------------------------------
describe('NOTE_NAMES', () => {
  it('has exactly 12 entries', () => {
    expect(NOTE_NAMES).toHaveLength(12);
  });

  it('starts with C and ends with B', () => {
    expect(NOTE_NAMES[0]).toBe('C');
    expect(NOTE_NAMES[NOTE_NAMES.length - 1]).toBe('B');
  });

  it('contains all 7 naturals and 5 sharps', () => {
    const naturals = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    for (const n of naturals) {
      expect(NOTE_NAMES).toContain(n);
    }
    const sharps = ['C#', 'D#', 'F#', 'G#', 'A#'];
    for (const s of sharps) {
      expect(NOTE_NAMES).toContain(s);
    }
  });
});

// ---------------------------------------------------------------------------
// SCALE_INTERVALS
// ---------------------------------------------------------------------------
describe('SCALE_INTERVALS', () => {
  it('major has [0, 2, 4, 5, 7, 9, 11]', () => {
    expect(SCALE_INTERVALS.major).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });

  it('minor has [0, 2, 3, 5, 7, 8, 10]', () => {
    expect(SCALE_INTERVALS.minor).toEqual([0, 2, 3, 5, 7, 8, 10]);
  });

  it('harmonic_minor has [0, 2, 3, 5, 7, 8, 11] (raised 7th)', () => {
    expect(SCALE_INTERVALS.harmonic_minor).toEqual([0, 2, 3, 5, 7, 8, 11]);
  });

  it('dorian has [0, 2, 3, 5, 7, 9, 10]', () => {
    expect(SCALE_INTERVALS.dorian).toEqual([0, 2, 3, 5, 7, 9, 10]);
  });

  it('phrygian has [0, 1, 3, 5, 7, 8, 10]', () => {
    expect(SCALE_INTERVALS.phrygian).toEqual([0, 1, 3, 5, 7, 8, 10]);
  });

  it('lydian has [0, 2, 4, 6, 7, 9, 11]', () => {
    expect(SCALE_INTERVALS.lydian).toEqual([0, 2, 4, 6, 7, 9, 11]);
  });

  it('mixolydian has [0, 2, 4, 5, 7, 9, 10]', () => {
    expect(SCALE_INTERVALS.mixolydian).toEqual([0, 2, 4, 5, 7, 9, 10]);
  });

  it('all 7 scale types are defined', () => {
    const types: (keyof typeof SCALE_INTERVALS)[] = [
      'major',
      'minor',
      'harmonic_minor',
      'dorian',
      'phrygian',
      'lydian',
      'mixolydian',
    ];
    for (const t of types) {
      expect(SCALE_INTERVALS[t]).toBeDefined();
    }
  });

  it('every scale has exactly 7 intervals', () => {
    const values = Object.values(SCALE_INTERVALS);
    for (const intervals of values) {
      expect(intervals).toHaveLength(7);
    }
  });
});

// ---------------------------------------------------------------------------
// DEGREE_PROGRESSIONS
// ---------------------------------------------------------------------------
describe('DEGREE_PROGRESSIONS', () => {
  it('jazz has [1, 4, 0, 4] (ii-V-I-V)', () => {
    expect(DEGREE_PROGRESSIONS.jazz).toEqual([1, 4, 0, 4]);
  });

  it('pop has [0, 4, 5, 3] (I-V-vi-IV)', () => {
    expect(DEGREE_PROGRESSIONS.pop).toEqual([0, 4, 5, 3]);
  });

  it('neosoul has [1, 4, 2, 5]', () => {
    expect(DEGREE_PROGRESSIONS.neosoul).toEqual([1, 4, 2, 5]);
  });

  it('dark progression exists', () => {
    expect(DEGREE_PROGRESSIONS.dark).toBeDefined();
    expect(Array.isArray(DEGREE_PROGRESSIONS.dark)).toBe(true);
  });

  it('house progression exists', () => {
    expect(DEGREE_PROGRESSIONS.house).toBeDefined();
    expect(Array.isArray(DEGREE_PROGRESSIONS.house)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getMidiRoot
// ---------------------------------------------------------------------------
describe('getMidiRoot', () => {
  it('C octave 4 = 60 (middle C)', () => {
    expect(ChordGenerator.getMidiRoot('C', 4)).toBe(60);
  });

  it('C# octave 4 = 61', () => {
    expect(ChordGenerator.getMidiRoot('C#', 4)).toBe(61);
  });

  it('D octave 4 = 62', () => {
    expect(ChordGenerator.getMidiRoot('D', 4)).toBe(62);
  });

  it('E octave 4 = 64', () => {
    expect(ChordGenerator.getMidiRoot('E', 4)).toBe(64);
  });

  it('F octave 4 = 65', () => {
    expect(ChordGenerator.getMidiRoot('F', 4)).toBe(65);
  });

  it('G octave 4 = 67', () => {
    expect(ChordGenerator.getMidiRoot('G', 4)).toBe(67);
  });

  it('A octave 4 = 69 (A440)', () => {
    expect(ChordGenerator.getMidiRoot('A', 4)).toBe(69);
  });

  it('B octave 4 = 71', () => {
    expect(ChordGenerator.getMidiRoot('B', 4)).toBe(71);
  });

  it('C octave 5 = 72 (shift by 12)', () => {
    expect(ChordGenerator.getMidiRoot('C', 5)).toBe(72);
    expect(ChordGenerator.getMidiRoot('C', 5) - ChordGenerator.getMidiRoot('C', 4)).toBe(12);
  });

  it('C octave 3 = 48', () => {
    expect(ChordGenerator.getMidiRoot('C', 3)).toBe(48);
  });
});

// ---------------------------------------------------------------------------
// generateProgression
// ---------------------------------------------------------------------------
describe('generateProgression', () => {
  it('returns an array of 16 ChordDefinition objects (one per pad)', () => {
    const result = ChordGenerator.generateProgression(defaultParams);
    expect(result).toHaveLength(16);
  });

  it('each chord has name (string), notes (number[]), bassNotes (number[]), leadNotes (number[])', () => {
    const result = ChordGenerator.generateProgression(defaultParams);
    for (const chord of result) {
      expect(chord).toHaveProperty('name');
      expect(typeof chord.name).toBe('string');
      expect(chord.name.length).toBeGreaterThan(0);

      expect(chord).toHaveProperty('notes');
      expect(Array.isArray(chord.notes)).toBe(true);

      expect(chord).toHaveProperty('bassNotes');
      expect(Array.isArray(chord.bassNotes)).toBe(true);

      expect(chord).toHaveProperty('leadNotes');
      expect(Array.isArray(chord.leadNotes)).toBe(true);
    }
  });

  it('all notes are valid MIDI values (0-127)', () => {
    const result = ChordGenerator.generateProgression(defaultParams);
    for (const chord of result) {
      for (const n of [...chord.notes, ...chord.bassNotes, ...chord.leadNotes]) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(127);
      }
    }
  });

  it('different progression types produce different note arrays (pop vs jazz)', () => {
    const pop = ChordGenerator.generateProgression(defaultParams);
    const jazz = ChordGenerator.generateProgression({
      ...defaultParams,
      progressionType: 'jazz',
    });
    const popAll = pop.flatMap((c) => c.notes);
    const jazzAll = jazz.flatMap((c) => c.notes);
    expect(popAll).not.toEqual(jazzAll);
  });

  it('root note D transposes all notes up by 2 semitones vs C', () => {
    const cResult = ChordGenerator.generateProgression(defaultParams);
    const dResult = ChordGenerator.generateProgression({
      ...defaultParams,
      rootNote: 'D',
    });
    for (let i = 0; i < cResult.length; i++) {
      expect(dResult[i].notes).toEqual(cResult[i].notes.map((n) => n + 2));
      expect(dResult[i].bassNotes).toEqual(cResult[i].bassNotes.map((n) => n + 2));
    }
  });

  it('scale change to minor produces different notes than major', () => {
    const major = ChordGenerator.generateProgression(defaultParams);
    const minor = ChordGenerator.generateProgression({
      ...defaultParams,
      scale: 'minor',
    });
    const majorAll = major.flatMap((c) => c.notes);
    const minorAll = minor.flatMap((c) => c.notes);
    expect(majorAll).not.toEqual(minorAll);
  });

  it('triad extension produces 4 notes per chord (root, 3rd, 5th, octave)', () => {
    const result = ChordGenerator.generateProgression(defaultParams);
    for (const chord of result) {
      expect(chord.notes.length).toBe(4);
    }
  });

  it('7th extension produces 4 notes per chord (root, 3rd, 5th, 7th)', () => {
    const result = ChordGenerator.generateProgression({
      ...defaultParams,
      chordExtension: '7th',
    });
    for (const chord of result) {
      expect(chord.notes.length).toBe(4);
    }
  });

  it('9th extension produces 5 notes per chord', () => {
    const result = ChordGenerator.generateProgression({
      ...defaultParams,
      chordExtension: '9th',
    });
    for (const chord of result) {
      expect(chord.notes.length).toBe(5);
    }
  });

  it('deterministic: same params twice produces identical results', () => {
    const a = ChordGenerator.generateProgression(defaultParams);
    const b = ChordGenerator.generateProgression(defaultParams);
    expect(a).toEqual(b);
  });

  it('bassStyle root produces non-empty bassNotes', () => {
    const result = ChordGenerator.generateProgression(defaultParams);
    for (const chord of result) {
      expect(chord.bassNotes.length).toBeGreaterThan(0);
    }
  });

  it('bassStyle off produces empty bassNotes', () => {
    const result = ChordGenerator.generateProgression({
      ...defaultParams,
      bassStyle: 'off',
    });
    for (const chord of result) {
      expect(chord.bassNotes).toEqual([]);
    }
  });

  it('leadStyle off produces empty leadNotes', () => {
    const result = ChordGenerator.generateProgression(defaultParams);
    for (const chord of result) {
      expect(chord.leadNotes).toEqual([]);
    }
  });

  it('octaveOffset 1 shifts all notes up by 12 semitones', () => {
    const base = ChordGenerator.generateProgression(defaultParams);
    const shifted = ChordGenerator.generateProgression({
      ...defaultParams,
      octaveOffset: 1,
    });
    for (let i = 0; i < base.length; i++) {
      expect(shifted[i].notes).toEqual(base[i].notes.map((n) => n + 12));
      expect(shifted[i].bassNotes).toEqual(base[i].bassNotes.map((n) => n + 12));
    }
  });

  it('number of chords matches 16 pads, cycling through progression degrees', () => {
    const result = ChordGenerator.generateProgression(defaultParams);
    expect(result).toHaveLength(16);
    // pop = [0, 4, 5, 3], so every 4 chords the pattern repeats
    for (let i = 0; i < 4; i++) {
      expect(result[i].name).toBe(result[i + 4].name);
      expect(result[i].notes).toEqual(result[i + 4].notes);
    }
  });

  it('5th extension produces 3 notes (power chord)', () => {
    const result = ChordGenerator.generateProgression({
      ...defaultParams,
      chordExtension: '5th',
    });
    for (const chord of result) {
      expect(chord.notes.length).toBe(3);
    }
  });

  it('sus4 extension produces 3 notes', () => {
    const result = ChordGenerator.generateProgression({
      ...defaultParams,
      chordExtension: 'sus4',
    });
    for (const chord of result) {
      expect(chord.notes.length).toBe(3);
    }
  });

  it('diminished extension produces 4 notes (root, m3, d5, d7)', () => {
    const result = ChordGenerator.generateProgression({
      ...defaultParams,
      chordExtension: 'diminished',
    });
    for (const chord of result) {
      expect(chord.notes.length).toBe(4);
    }
  });

  it('add9 extension produces 4 notes (root, 3rd, 5th, 9th)', () => {
    const result = ChordGenerator.generateProgression({
      ...defaultParams,
      chordExtension: 'add9',
    });
    for (const chord of result) {
      expect(chord.notes.length).toBe(4);
    }
  });

  it('bassStyle octaves produces 2 bass notes', () => {
    const result = ChordGenerator.generateProgression({
      ...defaultParams,
      bassStyle: 'octaves',
    });
    for (const chord of result) {
      expect(chord.bassNotes.length).toBe(2);
    }
  });

  it('bassStyle walking produces 4 bass notes', () => {
    const result = ChordGenerator.generateProgression({
      ...defaultParams,
      bassStyle: 'walking',
    });
    for (const chord of result) {
      expect(chord.bassNotes.length).toBe(4);
    }
  });

  it('bassStyle syncopated produces 3 bass notes', () => {
    const result = ChordGenerator.generateProgression({
      ...defaultParams,
      bassStyle: 'syncopated',
    });
    for (const chord of result) {
      expect(chord.bassNotes.length).toBe(3);
    }
  });

  it('leadStyle chord-tones produces lead notes shifted up 2 octaves', () => {
    const result = ChordGenerator.generateProgression({
      ...defaultParams,
      leadStyle: 'chord-tones',
    });
    for (const chord of result) {
      expect(chord.leadNotes.length).toBeGreaterThan(0);
      expect(chord.leadNotes.length).toBe(chord.notes.length);
    }
  });

  it('leadStyle arpeggio-up produces 4 lead notes', () => {
    const result = ChordGenerator.generateProgression({
      ...defaultParams,
      leadStyle: 'arpeggio-up',
    });
    for (const chord of result) {
      expect(chord.leadNotes.length).toBe(4);
    }
  });

  it('leadStyle arpeggio-down produces 4 lead notes in descending order', () => {
    const result = ChordGenerator.generateProgression({
      ...defaultParams,
      leadStyle: 'arpeggio-down',
    });
    for (const chord of result) {
      expect(chord.leadNotes.length).toBe(4);
      for (let i = 1; i < chord.leadNotes.length; i++) {
        expect(chord.leadNotes[i - 1]).toBeGreaterThan(chord.leadNotes[i]);
      }
    }
  });

  it('leadStyle motif produces 3 lead notes', () => {
    const result = ChordGenerator.generateProgression({
      ...defaultParams,
      leadStyle: 'motif',
    });
    for (const chord of result) {
      expect(chord.leadNotes.length).toBe(3);
    }
  });

  it('epic progression is defined and produces 16 chords', () => {
    const result = ChordGenerator.generateProgression({
      ...defaultParams,
      progressionType: 'epic',
    });
    expect(result).toHaveLength(16);
    const epicDegrees = DEGREE_PROGRESSIONS.epic;
    expect(epicDegrees).toEqual([0, 5, 3, 4]);
  });

  it('neosoul progression produces different chords than pop', () => {
    const pop = ChordGenerator.generateProgression(defaultParams);
    const neosoul = ChordGenerator.generateProgression({
      ...defaultParams,
      progressionType: 'neosoul',
    });
    const popNotes = pop.flatMap((c) => c.notes);
    const neosoulNotes = neosoul.flatMap((c) => c.notes);
    expect(popNotes).not.toEqual(neosoulNotes);
  });
});
