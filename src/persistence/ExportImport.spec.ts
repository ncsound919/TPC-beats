// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportProject, importProject } from './ExportImport';

if (typeof URL.createObjectURL === 'undefined') {
  (URL as Record<string, unknown>).createObjectURL = () => '';
  (URL as Record<string, unknown>).revokeObjectURL = () => {};
}

const mockFile = (content: string, name = 'test.json') =>
  new File([content], name, { type: 'application/json' });

const validProject = {
  program: {
    samples: [{
      id: 's1', name: 'test', rawBuffer: null,
      sampleRate: 44100, bitDepth: 16,
      slices: [{ id: 'sl1', start: 0, end: 1, attack: 0.01, decay: 0.3, pitch: 0, gain: 1 }],
    }],
  },
  sequence: {
    id: 'seq1', name: 'Pattern 1', bpm: 92, ppqn: 96, lengthBars: 4, events: [],
  },
};

describe('ExportImport', () => {
  describe('exportProject', () => {
    let createObjectURL: ReturnType<typeof vi.fn>;
    let revokeObjectURL: ReturnType<typeof vi.fn>;
    let clickFn: ReturnType<typeof vi.fn>;
    let anchor: HTMLAnchorElement;

    beforeEach(() => {
      createObjectURL = vi.fn(() => 'blob:mock-url');
      revokeObjectURL = vi.fn();
      clickFn = vi.fn();
      anchor = { href: '', download: '', click: clickFn } as unknown as HTMLAnchorElement;
      vi.spyOn(URL, 'createObjectURL').mockImplementation(createObjectURL);
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectURL);
      vi.spyOn(document, 'createElement').mockReturnValue(anchor);
    });

    it('calls URL.createObjectURL and document.createElement', () => {
      exportProject(validProject);
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
      expect(document.createElement).toHaveBeenCalledWith('a');
    });

    it('creates a download link with filename project.json', () => {
      exportProject(validProject);
      expect(anchor.download).toBe('project.json');
      expect(anchor.href).toBe('blob:mock-url');
    });

    it('clicks the anchor and revokes the URL', () => {
      exportProject(validProject);
      expect(clickFn).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('serializes project as JSON with 2-space indentation', () => {
      const blob = new Blob([JSON.stringify(validProject, null, 2)], { type: 'application/json' });
      exportProject(validProject);
      const capturedBlob = createObjectURL.mock.calls[0][0] as Blob;
      expect(capturedBlob.type).toBe('application/json');
    });
  });

  describe('importProject', () => {
    it('imports valid JSON file and returns parsed data', async () => {
      const file = mockFile(JSON.stringify(validProject));
      const result = await importProject(file);
      expect(result).toHaveProperty('program');
      expect(result).toHaveProperty('sequence');
    });

    it('throws with "Invalid project file" prefix for data that fails validation', async () => {
      const file = mockFile(JSON.stringify({ foo: 'bar' }));
      await expect(importProject(file)).rejects.toThrow(/^Invalid project file/);
    });

    it('throws SyntaxError for malformed JSON', async () => {
      const file = mockFile('not valid json');
      await expect(importProject(file)).rejects.toThrow(SyntaxError);
    });

    it('returns typed data matching the Project structure', async () => {
      const file = mockFile(JSON.stringify(validProject));
      const result = await importProject(file) as Record<string, unknown>;
      expect(result.program).toBeTypeOf('object');
      expect(result.sequence).toBeTypeOf('object');
      const seq = result.sequence as Record<string, unknown>;
      expect(seq.bpm).toBe(92);
      expect(Array.isArray(seq.events)).toBe(true);
    });

    it('throws with field-level validation issue details', async () => {
      const badProject = { program: {}, sequence: { bpm: 999, events: [] } };
      const file = mockFile(JSON.stringify(badProject));
      await expect(importProject(file)).rejects.toThrow(/Invalid project file/);
    });
  });
});
