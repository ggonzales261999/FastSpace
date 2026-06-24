import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import AuthPage from './pages/AuthPage';
import Sidebar from './components/layout/Sidebar';
import Dashboard from './pages/Dashboard';
import ProjectsPage from './pages/ProjectsPage';
import TasksPage from './pages/TasksPage';
import SettingsPage from './pages/SettingsPage';
import ProjectModal from './components/modals/ProjectModal';
import { supabase } from './lib/supabase';
import { Project } from './types';

function AppShell() {
  const { user, loading } = useAuth();
  const [activePage, setActivePage] = useState('dashboard');
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showProjectModal, setShowProjectModal] = useState(false);

  async function loadProjects() {
    const { data } = await supabase.from('projects').select('*').order('created_at');
    setProjects(data ?? []);
  }

  useEffect(() => {
    if (user) loadProjects();
  }, [user]);

  function navigate(page: string, projectId?: string) {
    setActivePage(page);
    if (page === 'tasks' && projectId) {
      setActiveProjectId(projectId);
    } else if (page !== 'tasks') {
      setActiveProjectId(undefined);
    }
  }

  if (loading) {
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
        projects={projects}
        activeProjectId={activeProjectId}
        onAddProject={() => setShowProjectModal(true)}
        onRefreshProjects={loadProjects}
      />

      <div className="flex-1 flex overflow-hidden">
        {activePage === 'dashboard' && <Dashboard onNavigate={navigate} />}
        {activePage === 'projects' && (
          <ProjectsPage
            onNavigate={navigate}
            onRefreshProjects={loadProjects}
          />
        )}
        {activePage === 'tasks' && (
          <TasksPage
            projects={projects}
            filterProjectId={activeProjectId}
            onProjectIdChange={id => setActiveProjectId(id)}
          />
        )}
        {activePage === 'settings' && <SettingsPage />}
      </div>

      {showProjectModal && (
        <ProjectModal
          onClose={() => setShowProjectModal(false)}
          onCreated={loadProjects}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
