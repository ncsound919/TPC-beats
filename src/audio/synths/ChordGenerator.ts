import { JunoEngine } from './JunoEngine';
import { DX7Engine } from './DX7Engine';

export interface ChordDefinition {
  name: string;
  notes: number[];      // Rhythm/chord notes (MIDI numbers)
  bassNotes: number[];  // Bass notes (MIDI numbers)
  leadNotes: number[];  // Lead notes (MIDI numbers)
}

export type ScaleType = 'major' | 'minor' | 'harmonic_minor' | 'dorian' | 'phrygian' | 'lydian' | 'mixolydian';

export interface ProgressionParams {
  rootNote: string;      // "C", "C#", "D", ...
  scale: ScaleType;
  progressionType: 'jazz' | 'pop' | 'neosoul' | 'dark' | 'house' | 'epic' | 'custom';
  rhythmStyle: 'straight' | 'syncopated' | 'plucked' | 'strummed' | 'laidback';
  chordExtension: 'triad' | '5th' | '7th' | '9th' | '11th' | 'add9' | 'diminished' | 'sus4' | 'random';
  octaveOffset: number;  // Default 0
  humanizeVelocity: boolean;
  strumDelayMs: number;  // Delay between notes for strummed style (e.g., 0 - 150)
  gateLengthPct: number; // Duration as % of beat (e.g., 10 - 100)
  
  // Accompanying arrangements
  bassStyle: 'root' | 'octaves' | 'syncopated' | 'walking' | 'off';
  leadStyle: 'chord-tones' | 'arpeggio-up' | 'arpeggio-down' | 'motif' | 'off';
  
  // Synth outputs (swappable)
  bassSynth: 'juno' | 'dx7';
  rhythmSynth: 'juno' | 'dx7';
  leadSynth: 'juno' | 'dx7';
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const SCALE_INTERVALS: Record<ScaleType, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10]
};

// Progression degree lists for each type (Roman numerals mapping to index 0-6 in scale degrees)
export const DEGREE_PROGRESSIONS: Record<string, number[]> = {
  jazz: [1, 4, 0, 4],     // ii - V - I - V (0-indexed degrees: 1, 4, 0, 4)
  pop: [0, 4, 5, 3],      // I - V - vi - IV (0-indexed: 0, 4, 5, 3)
  neosoul: [1, 4, 2, 5],  // ii - V - iii - vi
  dark: [0, 5, 2, 6],     // i - VI - III - VII
  house: [0, 3, 4, 3],    // i - iv - v - iv
  epic: [0, 5, 3, 4],     // i - VI - iv - v
  custom: [0, 1, 2, 3, 4, 5, 6, 0] // Scale degrees ascending
};

export class ChordGenerator {
  public static getMidiRoot(name: string, octave = 4): number {
    const idx = NOTE_NAMES.indexOf(name);
    return 12 * (octave + 1) + (idx >= 0 ? idx : 0);
  }

  // Generates 16 chords to assign to the 16 MPC pads!
  public static generateProgression(params: ProgressionParams): ChordDefinition[] {
    const rootMidi = this.getMidiRoot(params.rootNote, 3 + params.octaveOffset);
    const scaleDegrees = SCALE_INTERVALS[params.scale];
    const degrees = DEGREE_PROGRESSIONS[params.progressionType] || [0, 1, 2, 3];
    
    const chords: ChordDefinition[] = [];

    // Loop to fill up all 16 pads
    for (let padIdx = 0; padIdx < 16; padIdx++) {
      const deg = degrees[padIdx % degrees.length];
      const rootMidiForChord = rootMidi + this.getScaleMidiOffset(deg, scaleDegrees);
      
      const chordNotes = this.buildChordNotes(rootMidiForChord, deg, scaleDegrees, params.chordExtension);
      const bassNotes = this.buildBassNotes(rootMidiForChord, params.bassStyle);
      const leadNotes = this.buildLeadNotes(chordNotes, rootMidiForChord, padIdx, params.leadStyle);
      
      const chordName = this.getChordName(params.rootNote, params.scale, deg, params.chordExtension);

      chords.push({
        name: chordName,
        notes: chordNotes,
        bassNotes,
        leadNotes
      });
    }

    return chords;
  }

  private static getScaleMidiOffset(degree: number, scaleDegrees: number[]): number {
    const octaves = Math.floor(degree / scaleDegrees.length);
    const index = ((degree % scaleDegrees.length) + scaleDegrees.length) % scaleDegrees.length;
    return octaves * 12 + scaleDegrees[index];
  }

  private static buildChordNotes(root: number, degree: number, scaleDegrees: number[], ext: ProgressionParams['chordExtension']): number[] {
    const fifthOffset = this.getScaleMidiOffset(degree + 4, scaleDegrees) - this.getScaleMidiOffset(degree, scaleDegrees);
    
    const useExt = ext === 'random' 
      ? (['triad', '5th', '7th', '9th', '11th', 'add9', 'sus4'][Math.floor(Math.random() * 7)] as any) 
      : ext;

    if (useExt === '5th') {
      // Power chords: Root, Perfect 5th, Octave
      return [root, root + fifthOffset, root + 12].sort((a, b) => a - b);
    }

    if (useExt === 'sus4') {
      // Suspended 4th chords: Root, Perfect 4th, Perfect 5th
      const fourthOffset = this.getScaleMidiOffset(degree + 3, scaleDegrees) - this.getScaleMidiOffset(degree, scaleDegrees);
      return [root, root + fourthOffset, root + fifthOffset].sort((a, b) => a - b);
    }

    const notes: number[] = [root]; // Root note in octave 3
    
    // Degrees: 0 = I, 1 = II, 2 = III, etc.
    // Build chord from thirds (root, 3rd, 5th, 7th, 9th, 11th)
    const thirdOffset = this.getScaleMidiOffset(degree + 2, scaleDegrees) - this.getScaleMidiOffset(degree, scaleDegrees);
    const seventhOffset = this.getScaleMidiOffset(degree + 6, scaleDegrees) - this.getScaleMidiOffset(degree, scaleDegrees);
    const ninthOffset = this.getScaleMidiOffset(degree + 8, scaleDegrees) - this.getScaleMidiOffset(degree, scaleDegrees);
    const eleventhOffset = this.getScaleMidiOffset(degree + 10, scaleDegrees) - this.getScaleMidiOffset(degree, scaleDegrees);

    const mThird = root + thirdOffset;
    const mFifth = root + fifthOffset;
    notes.push(mThird);
    notes.push(mFifth);

    if (useExt === '7th' || useExt === '9th' || useExt === '11th') {
      notes.push(root + seventhOffset);
    }
    if (useExt === '9th' || useExt === '11th') {
      notes.push(root + ninthOffset);
    }
    if (useExt === '11th') {
      notes.push(root + eleventhOffset);
    }
    if (useExt === 'add9') {
      notes.push(root + ninthOffset); // omit seventh
    }
    if (useExt === 'diminished') {
      // Diminished chord override: minor third, flat fifth, double flat seventh
      return [root, root + 3, root + 6, root + 9];
    }
    if (useExt === 'triad') {
      // Standard 3-note triad, maybe duplicate root high for fullness
      notes.push(root + 12);
    }

    // Sort to keep voicing organized
    return Array.from(new Set(notes)).sort((a, b) => a - b);
  }

  private static buildBassNotes(chordRoot: number, style: ProgressionParams['bassStyle']): number[] {
    const bassRoot = chordRoot - 24; // 2 octaves lower
    if (style === 'off') return [];
    if (style === 'root') {
      return [bassRoot];
    }
    if (style === 'octaves') {
      return [bassRoot, bassRoot + 12];
    }
    if (style === 'syncopated') {
      return [bassRoot, bassRoot + 7, bassRoot + 12]; // Root, 5th, octave
    }
    if (style === 'walking') {
      return [bassRoot, bassRoot + 4, bassRoot + 7, bassRoot + 11]; // step progression
    }
    return [bassRoot];
  }

  private static buildLeadNotes(chordNotes: number[], chordRoot: number, stepIdx: number, style: ProgressionParams['leadStyle']): number[] {
    if (style === 'off') return [];
    const leadOctave = chordRoot + 24; // 2 octaves higher

    if (style === 'chord-tones') {
      // Return high voicing of the chord tones
      return chordNotes.map(n => n + 24);
    }

    if (style === 'arpeggio-up') {
      // Generate ascending arpeggio notes
      return [leadOctave, leadOctave + 4, leadOctave + 7, leadOctave + 11];
    }

    if (style === 'arpeggio-down') {
      return [leadOctave + 12, leadOctave + 7, leadOctave + 4, leadOctave];
    }

    if (style === 'motif') {
      // A simple 3-note melodic motif that moves with the progression
      const melodyOffsets = [0, 2, 4, 7, 9, 11, 12];
      const note1 = leadOctave + melodyOffsets[stepIdx % melodyOffsets.length];
      const note2 = leadOctave + melodyOffsets[(stepIdx + 2) % melodyOffsets.length];
      const note3 = leadOctave + melodyOffsets[(stepIdx + 4) % melodyOffsets.length];
      return [note1, note2, note3];
    }

    return [];
  }

  private static getChordName(rootKey: string, scale: ScaleType, degree: number, ext: string): string {
    const scaleDegrees = SCALE_INTERVALS[scale];
    const rootIdx = NOTE_NAMES.indexOf(rootKey);
    const chordDegreeIdx = ((degree % scaleDegrees.length) + scaleDegrees.length) % scaleDegrees.length;
    const semitonesFromRoot = scaleDegrees[chordDegreeIdx];
    const chordRootName = NOTE_NAMES[(rootIdx + semitonesFromRoot) % 12];

    let extSuffix = '';
    switch (ext) {
      case '5th': return `${chordRootName}5`;
      case 'sus4': return `${chordRootName}sus4`;
      case '7th': extSuffix = '7'; break;
      case '9th': extSuffix = '9'; break;
      case '11th': extSuffix = '11'; break;
      case 'add9': extSuffix = 'add9'; break;
      case 'diminished': return `${chordRootName}dim`;
    }

    // Determine if major or minor chord quality
    // Triad thirds determine quality: 3 or 4 semitones
    const thirdDegreeIdx = (chordDegreeIdx + 2) % scaleDegrees.length;
    const fifthDegreeIdx = (chordDegreeIdx + 4) % scaleDegrees.length;
    
    let thirdInterval = scaleDegrees[thirdDegreeIdx] - semitonesFromRoot;
    if (thirdInterval < 0) thirdInterval += 12;
    let fifthInterval = scaleDegrees[fifthDegreeIdx] - semitonesFromRoot;
    if (fifthInterval < 0) fifthInterval += 12;

    if (thirdInterval === 3) {
      // minor
      if (fifthInterval === 6) {
        return `${chordRootName}dim${extSuffix}`;
      }
      return `${chordRootName}m${extSuffix}`;
    } else {
      // major
      if (fifthInterval === 8) {
        return `${chordRootName}aug${extSuffix}`;
      }
      return `${chordRootName}${extSuffix || 'maj'}`;
    }
  }

  // Plays a chord using swappable synths!
  public static playChord(
    chord: ChordDefinition, 
    params: ProgressionParams, 
    juno: JunoEngine | null, 
    dx7: DX7Engine | null
  ) {
    if (!juno && !dx7) return;

    const velocityBase = params.humanizeVelocity ? (85 + Math.random() * 25) : 100;

    // Helper to route and play note on selected synth
    const playNote = (midiNote: number, velocity: number, targetSynth: 'juno' | 'dx7') => {
      if (targetSynth === 'juno' && juno) {
        juno.noteOn(midiNote, velocity);
      } else if (targetSynth === 'dx7' && dx7) {
        dx7.noteOn(midiNote, velocity);
      }
    };

    // 1. Play Bass Part
    chord.bassNotes.forEach(note => {
      playNote(note, Math.round(velocityBase * 0.9), params.bassSynth);
    });

    // 2. Play Rhythm Chord Part (with optional strum delay / timing vibe)
    chord.notes.forEach((note, i) => {
      const strumTime = params.rhythmStyle === 'strummed' ? i * params.strumDelayMs : 0;
      const delayedPlay = () => {
        playNote(note, Math.round(velocityBase * 0.75), params.rhythmSynth);
      };
      
      if (strumTime > 0) {
        setTimeout(delayedPlay, strumTime);
      } else {
        delayedPlay();
      }
    });

    // 3. Play Lead Part (with slight rhythm delay or arpeggiation delay)
    chord.leadNotes.forEach((note, i) => {
      const leadDelay = params.leadStyle.startsWith('arpeggio') ? i * 180 : i * 90;
      const delayedPlay = () => {
        playNote(note, Math.round(velocityBase * 0.8), params.leadSynth);
      };

      if (leadDelay > 0) {
        setTimeout(delayedPlay, leadDelay);
      } else {
        delayedPlay();
      }
    });
  }

  // Stops all notes on both engines
  public static stopChord(
    chord: ChordDefinition,
    params: ProgressionParams,
    juno: JunoEngine | null,
    dx7: DX7Engine | null
  ) {
    const stopNote = (midiNote: number, targetSynth: 'juno' | 'dx7') => {
      if (targetSynth === 'juno' && juno) {
        juno.noteOff(midiNote);
      } else if (targetSynth === 'dx7' && dx7) {
        dx7.noteOff(midiNote);
      }
    };

    chord.bassNotes.forEach(note => stopNote(note, params.bassSynth));
    chord.notes.forEach(note => stopNote(note, params.rhythmSynth));
    chord.leadNotes.forEach(note => stopNote(note, params.leadSynth));
  }
}
