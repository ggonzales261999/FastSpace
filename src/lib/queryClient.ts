import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const queryKeys = {
  projects: ['projects'] as const,
  projectsMeta: ['projects-meta'] as const,
  tasks: ['tasks'] as const,
  departments: ['departments'] as const,
  profiles: (scope = 'all') => ['profiles', scope] as const,
  projectMembers: (projectId: string) => ['project-members', projectId] as const,
  taskDetail: (taskId: string) => ['task-detail', taskId] as const,
  dashboard: ['dashboard'] as const,
  reports: ['reports'] as const,
};
