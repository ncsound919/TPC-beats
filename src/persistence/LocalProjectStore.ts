import { Project } from './ProjectSchema';

const STORAGE_KEY = 'hybrid_agent_autosave_v1';

export const saveProject = (project: Project) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
};

export const loadProject = (): Project | null => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : null;
};
