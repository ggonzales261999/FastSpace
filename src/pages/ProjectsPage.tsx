import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, FolderOpen, Trash2, ChevronRight, Users, Building2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Project, Department } from '../types';
import ProjectModal from '../components/modals/ProjectModal';
import ProjectMembersModal from '../components/modals/ProjectMembersModal';
import { useAuth } from '../context/AuthContext';
import { queryKeys } from '../lib/queryClient';
import { filterVisibleProjects } from '../lib/projectAccess';

interface ProjectWithMeta extends Project {
  memberCount: number;
  department?: Department | null;
}

export default function ProjectsPage({ onNavigate, onRefreshProjects }: {
  onNavigate: (page: string, id?: string) => void;
  onRefreshProjects: () => void;
}) {
  const { profile, user } = useAuth();
  const [filterDeptId, setFilterDeptId] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [managingProject, setManagingProject] = useState<Project | null>(null);

  const canCreate = profile?.role === 'admin' || profile?.role === 'manager';

  function canManageProject(p: Project) {
    return profile?.role === 'admin' || profile?.role === 'manager' || p.created_by === user?.id;
  }

  const queryClient = useQueryClient();

  const departmentsQuery = useQuery({
    queryKey: queryKeys.departments,
    queryFn: async () => {
      const { data } = await supabase.from('departments').select('*').order('name');
      return (data ?? []) as Department[];
    },
  });

  const projectsQuery = useQuery({
    queryKey: [...queryKeys.projectsMeta, profile?.id ?? 'anon', profile?.department_id ?? 'none', profile?.role ?? 'unknown'],
    enabled: !!profile,
    queryFn: async () => {
      const [{ data: projs }, { data: mems }] = await Promise.all([
        supabase.from('projects').select('*').eq('is_deleted', false).eq('status', true).order('created_at', { ascending: false }),
        supabase.from('project_members').select('project_id'),
      ]);

      const memCountMap: Record<string, number> = {};
      (mems ?? []).forEach(m => {
        memCountMap[m.project_id] = (memCountMap[m.project_id] ?? 0) + 1;
      });

      return {
        projects: filterVisibleProjects(profile, (projs ?? []) as Project[]),
        memberCountMap: memCountMap,
      };
    },
  });

  const departments = departmentsQuery.data ?? [];
  const departmentMap = useMemo(() => {
    const map: Record<string, Department> = {};
    departments.forEach(dept => { map[dept.id] = dept; });
    return map;
  }, [departments]);

  const projects = useMemo<ProjectWithMeta[]>(() => {
    const result = projectsQuery.data?.projects ?? [];
    const memberCountMap = projectsQuery.data?.memberCountMap ?? {};
    return result.map(project => ({
      ...project,
      memberCount: memberCountMap[project.id] ?? 0,
      department: project.department_id ? departmentMap[project.department_id] ?? null : null,
    }));
  }, [projectsQuery.data, departmentMap]);

  const deleteProjectMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('projects')
        .update({ is_deleted: true, status: false, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.projectsMeta }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks }),
        queryClient.invalidateQueries({ queryKey: queryKeys.departments }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
      ]);
      onRefreshProjects();
    },
  });

  const displayed = filterDeptId
    ? projects.filter(p => p.department_id === filterDeptId)
    : projects;

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
            <p className="text-sm text-gray-500 mt-0.5">{displayed.length} project{displayed.length !== 1 ? 's' : ''}</p>
          </div>
          {canCreate && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-all shadow-sm shadow-blue-500/25"
            >
              <Plus className="w-4 h-4" />
              New Project
            </button>
          )}
        </div>

        {/* Department filter */}
        {departments.length > 0 && (
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            <button
              onClick={() => setFilterDeptId('')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                filterDeptId === ''
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              All
            </button>
            {departments.map(d => (
              <button
                key={d.id}
                onClick={() => setFilterDeptId(filterDeptId === d.id ? '' : d.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                  filterDeptId === d.id
                    ? 'text-white border-transparent'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
                style={filterDeptId === d.id ? { backgroundColor: d.color, borderColor: d.color } : {}}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: filterDeptId === d.id ? '#fff' : d.color }} />
                {d.name}
              </button>
            ))}
          </div>
        )}

        {(projectsQuery.isLoading || departmentsQuery.isLoading) ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl h-44 animate-pulse shadow-sm" />
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-20">
            <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-500 mb-1">
              {filterDeptId ? 'No projects in this department' : 'No projects yet'}
            </h3>
            {canCreate && !filterDeptId && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                Create your first project
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayed.map(p => (
              <div
                key={p.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all overflow-hidden group flex flex-col"
              >
                <div className="h-1.5 flex-shrink-0" style={{ backgroundColor: p.color }} />
                <div className="p-5 flex flex-col flex-1">
                  {/* Title */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: p.color + '22' }}
                      >
                        <FolderOpen className="w-4 h-4" style={{ color: p.color }} />
                      </div>
                      <h3 className="font-semibold text-gray-900 text-sm truncate">{p.name}</h3>
                    </div>
                    {canManageProject(p) && (
                      <button
                        onClick={() => {
                          if (confirm('Delete this project? All its tasks will also be removed.')) {
                            deleteProjectMutation.mutate(p.id);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all flex-shrink-0"
                        title="Delete project"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Department badge */}
                  {p.department && (
                    <div className="flex items-center gap-1.5 mb-2">
                      <Building2 className="w-3 h-3 flex-shrink-0" style={{ color: p.department.color }} />
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: p.department.color + '18', color: p.department.color }}
                      >
                        {p.department.name}
                      </span>
                    </div>
                  )}

                  {p.description && (
                    <p className="text-xs text-gray-500 mb-3 line-clamp-2">{p.description}</p>
                  )}

                  <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-4 mt-auto">
                    <Users className="w-3.5 h-3.5" />
                    <span>{p.memberCount + 1} member{p.memberCount + 1 !== 1 ? 's' : ''}</span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => onNavigate('tasks', p.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                    >
                      View Tasks
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    {canManageProject(p) && (
                      <button
                        onClick={() => setManagingProject(p)}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl border border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors"
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
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.projectsMeta });
            onRefreshProjects();
          }}
        />
      )}

      {managingProject && (
        <ProjectMembersModal
          project={managingProject}
          onClose={() => {
            setManagingProject(null);
            queryClient.invalidateQueries({ queryKey: queryKeys.projectsMeta });
            onRefreshProjects();
          }}
        />
      )}
    </div>
  );
}
