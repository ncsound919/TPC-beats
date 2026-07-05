import * as v from 'valibot';
import { MasterMixerSettings, Program, Sequence, JunoParams, ExtendedRomplerParams } from '../types';

export interface Project {
  id: string;
  name: string;
  version: string;
  createdAt: number;
  updatedAt: number;
  sequence: Sequence;
  program: Program;
  junoParams: JunoParams;
  rompler808Params: ExtendedRomplerParams;
  mixer: MasterMixerSettings;
  savedAt: number;
}

const SequenceEventSchema = v.object({
  timestampPPQN: v.pipe(v.number(), v.minValue(0)),
  padId: v.pipe(v.number(), v.minValue(0), v.maxValue(127)),
  velocity: v.pipe(v.number(), v.minValue(0), v.maxValue(127)),
  durationPPQN: v.optional(v.number()),
  id: v.optional(v.string()),
});

const SequenceSchema = v.object({
  id: v.string(),
  name: v.string(),
  bpm: v.pipe(v.number(), v.minValue(20), v.maxValue(300)),
  ppqn: v.pipe(v.number(), v.minValue(16), v.maxValue(960)),
  lengthBars: v.pipe(v.number(), v.minValue(1), v.maxValue(64)),
  events: v.array(SequenceEventSchema),
});

const SliceSchema = v.object({
  id: v.string(),
  start: v.number(),
  end: v.number(),
  attack: v.number(),
  decay: v.number(),
  pitch: v.number(),
  gain: v.number(),
  padAssignment: v.optional(v.nullable(v.number())),
});

const SampleSchema = v.object({
  id: v.string(),
  name: v.string(),
  rawBuffer: v.null(),
  sampleRate: v.pipe(v.number(), v.minValue(8000), v.maxValue(192000)),
  bitDepth: v.pipe(v.number(), v.minValue(8), v.maxValue(32)),
  slices: v.array(SliceSchema),
});

const ProgramSchema = v.object({
  samples: v.array(SampleSchema),
  pads: v.optional(v.array(v.any())),
});

export const ProjectFileSchema = v.object({
  program: ProgramSchema,
  sequence: SequenceSchema,
  junoParams: v.optional(v.any()),
  rompler808Params: v.optional(v.any()),
  mixer: v.optional(v.any()),
});

export function validateProjectFile(data: unknown) {
  return v.safeParse(ProjectFileSchema, data);
}
