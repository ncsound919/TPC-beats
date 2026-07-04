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
