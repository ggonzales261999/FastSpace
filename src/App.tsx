import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FontSizeProvider } from './context/FontSizeContext';
import AuthPage from './pages/AuthPage';
import Sidebar from './components/layout/Sidebar';
import Dashboard from './pages/Dashboard';
import ProjectsPage from './pages/ProjectsPage';
import TasksPage from './pages/TasksPage';
import SettingsPage from './pages/SettingsPage';
import DepartmentsPage from './pages/DepartmentsPage';
import UserManagementPage from './pages/UserManagementPage';
import ProjectModal from './components/modals/ProjectModal';
import { supabase } from './lib/supabase';
import { Department, Profile, Project } from './types';
import { queryKeys } from './lib/queryClient';
import { filterVisibleProjects } from './lib/projectAccess';

function AppShell() {
  const { user, profile, loading } = useAuth();
  const [activePage, setActivePage] = useState('dashboard');
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>();
  const [showProjectModal, setShowProjectModal] = useState(false);

  const projectsQuery = useQuery({
    queryKey: [...queryKeys.projects, user?.id ?? 'anon', profile?.department_id ?? 'none', profile?.role ?? 'unknown'],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: projects }, { data: currentProfile }, { data: memberProjects }] = await Promise.all([
        supabase
          .from('projects')
          .select('*')
          .eq('is_deleted', false)
          .eq('status', true)
          .order('created_at'),
        supabase
          .from('profiles')
          .select('*')
          .eq('id', user!.id)
          .maybeSingle(),
        supabase
          .from('project_members')
          .select('project_id')
          .eq('user_id', user!.id),
      ]);

      const visibleByDept = filterVisibleProjects(currentProfile as Profile | null, (projects ?? []) as Project[]);
      const memberProjectIds = new Set((memberProjects ?? []).map(m => m.project_id));

      // Combine: projects visible by department + projects user is a member of
      const allVisibleProjects = [...visibleByDept];
      for (const project of (projects ?? []) as Project[]) {
        if (memberProjectIds.has(project.id) && !allVisibleProjects.some(p => p.id === project.id)) {
          allVisibleProjects.push(project);
        }
      }

      return allVisibleProjects;
    },
  });

  const departmentsQuery = useQuery({
    queryKey: queryKeys.departments,
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('departments')
        .select('*')
        .eq('is_deleted', false)
        .eq('status', true)
        .order('name');
      return (data ?? []) as Department[];
    },
  });

  function navigate(page: string, projectId?: string) {
    setActivePage(page);
    if (page === 'tasks' && projectId) {
      setActiveProjectId(projectId);
    } else if (page !== 'tasks') {
      setActiveProjectId(undefined);
    }
  }

  useEffect(() => {
    if (activeProjectId && !(projectsQuery.data ?? []).some(project => project.id === activeProjectId)) {
      setActiveProjectId(undefined);
    }
  }, [activeProjectId, projectsQuery.data]);

  useEffect(() => {
    if (activePage === 'user-management' && profile?.role !== 'admin') {
      setActivePage('dashboard');
    }
    if (activePage === 'departments' && profile?.role === 'user') {
      setActivePage('dashboard');
    }
  }, [activePage, profile?.role]);

  if (loading || (user && (projectsQuery.isLoading || departmentsQuery.isLoading))) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex gap-1.5">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-2.5 h-2.5 bg-blue-400 rounded-full animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (!user) return <AuthPage />;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar
        activePage={activePage}
        onNavigate={navigate}
        projects={projectsQuery.data ?? []}
        departments={departmentsQuery.data ?? []}
        activeProjectId={activeProjectId}
        onAddProject={() => setShowProjectModal(true)}
        onRefreshProjects={() => projectsQuery.refetch()}
      />

      <div className="flex-1 flex overflow-hidden">
        {activePage === 'dashboard' && <Dashboard onNavigate={navigate} />}
        {activePage === 'projects' && (
          <ProjectsPage
            onNavigate={navigate}
            onRefreshProjects={() => projectsQuery.refetch()}
          />
        )}
        {activePage === 'tasks' && (
          <TasksPage
            projects={projectsQuery.data ?? []}
            filterProjectId={activeProjectId}
            onProjectIdChange={id => setActiveProjectId(id)}
          />
        )}
        {activePage === 'departments' && <DepartmentsPage />}
        {activePage === 'user-management' && <UserManagementPage />}
        {activePage === 'settings' && <SettingsPage />}
      </div>

      {showProjectModal && (
        <ProjectModal
          onClose={() => setShowProjectModal(false)}
          onCreated={() => projectsQuery.refetch()}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <FontSizeProvider>
        <AppShell />
      </FontSizeProvider>
    </AuthProvider>
  );
}
