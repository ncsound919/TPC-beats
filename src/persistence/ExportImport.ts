import { Project } from './ProjectSchema';

export const exportProject = (project: Project) => {
  const data = JSON.stringify(project);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

export const importProject = (file: File): Promise<Project> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const project = JSON.parse(e.target?.result as string);
        resolve(project);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsText(file);
  });
};
