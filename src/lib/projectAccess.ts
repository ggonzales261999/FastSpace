import { Profile, Project } from '../types';

export function canSeeProject(profile: Profile | null | undefined, project: Project) {
  if (!profile) return false;
  if (profile.role === 'admin') return true;
  return !!profile.department_id && project.department_id === profile.department_id;
}

export function filterVisibleProjects(profile: Profile | null | undefined, projects: Project[]) {
  if (!profile) return [];
  if (profile.role === 'admin') return projects;
  return projects.filter(project => canSeeProject(profile, project));
}
