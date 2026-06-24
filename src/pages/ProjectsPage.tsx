import { useEffect, useState } from 'react';
import { Plus, FolderOpen, Trash2, ChevronRight, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Project } from '../types';
import ProjectModal from '../components/modals/ProjectModal';
import ProjectMembersModal from '../components/modals/ProjectMembersModal';
import { useAuth } from '../context/AuthContext';

interface ProjectWithMembers extends Project {
  memberCount: number;
}

export default function ProjectsPage({ onNavigate, onRefreshProjects }: {
  onNavigate: (page: string, id?: string) => void;
  onRefreshProjects: () => void;
}) {
  const { profile, user } = useAuth();
  const [projects, setProjects] = useState<ProjectWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [managingProject, setManagingProject] = useState<Project | null>(null);

  async function load() {
    const [{ data: projs }, { data: mems }] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('project_members').select('project_id'),
    ]);

    const memCountMap: Record<string, number> = {};
    (mems ?? []).forEach((m: { project_id: string }) => {
      memCountMap[m.project_id] = (memCountMap[m.project_id] ?? 0) + 1;
    });

    setProjects(
      (projs ?? []).map(p => ({ ...p, memberCount: memCountMap[p.id] ?? 0 }))
    );
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function deleteProject(id: string) {
    if (!confirm('Delete this project and all its tasks?')) return;
    await supabase.from('projects').delete().eq('id', id);
    load();
    onRefreshProjects();
  }

  const canCreate = profile?.role === 'admin' || profile?.role === 'manager';

  function canManageProject(p: Project) {
    return profile?.role === 'admin' || profile?.role === 'manager' || p.created_by === user?.id;
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
            <p className="text-sm text-gray-500 mt-0.5">{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
          </div>
          {canCreate && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Project
            </button>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl h-44 animate-pulse" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20">
            <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-500 mb-1">No projects yet</h3>
            {canCreate && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
              >
                Create your first project
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(p => (
              <div
                key={p.id}
                className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden group flex flex-col"
              >
                {/* Color stripe */}
                <div className="h-1.5 flex-shrink-0" style={{ backgroundColor: p.color }} />

                <div className="p-5 flex flex-col flex-1">
                  {/* Title row */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: p.color + '22' }}
                      >
                        <FolderOpen className="w-4 h-4" style={{ color: p.color }} />
                      </div>
                      <h3 className="font-semibold text-gray-900 text-sm truncate">{p.name}</h3>
                    </div>
                    {canManageProject(p) && (
                      <button
                        onClick={() => deleteProject(p.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 transition-all flex-shrink-0"
                        title="Delete project"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Description */}
                  {p.description && (
                    <p className="text-xs text-gray-500 mb-3 line-clamp-2">{p.description}</p>
                  )}

                  {/* Member count */}
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-4 mt-auto">
                    <Users className="w-3.5 h-3.5" />
                    <span>{p.memberCount + 1} member{p.memberCount + 1 !== 1 ? 's' : ''}</span>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => onNavigate('tasks', p.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                    >
                      View Tasks
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    {canManageProject(p) && (
                      <button
                        onClick={() => setManagingProject(p)}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors"
                        title="Manage members"
                      >
                        <Users className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <ProjectModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { load(); onRefreshProjects(); }}
        />
      )}

      {managingProject && (
        <ProjectMembersModal
          project={managingProject}
          onClose={() => { setManagingProject(null); load(); }}
        />
      )}
    </div>
  );
}
