import { ProjectFileSchema, validateProjectFile } from './ProjectSchema';

export const exportProject = (project: unknown) => {
  const data = JSON.stringify(project, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'project.json';
  a.click();
  URL.revokeObjectURL(url);
};

export const importProject = async (file: File): Promise<unknown> => {
  const text = await file.text();
  const data = JSON.parse(text);
  const result = validateProjectFile(data);
  if (!result.success) {
    const issues = result.issues.map(i => `${i.path?.join('.') ?? 'root'}: ${i.message}`).join('; ');
    throw new Error(`Invalid project file: ${issues}`);
  }
  return result.output;
};
