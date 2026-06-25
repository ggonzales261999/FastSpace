import { useMemo, useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutGrid, List, BarChart2, Plus, Search, Upload, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Task, Project, ViewMode, Profile } from '../types';
import ListView from '../components/tasks/ListView';
import BoardView from '../components/tasks/BoardView';
import GanttView from '../components/tasks/GanttView';
import TaskDetailModal from '../components/tasks/TaskDetailModal';
import AddTaskModal from '../components/tasks/AddTaskModal';
import TaskImportModal from '../components/tasks/TaskImportModal';
import { useAuth } from '../context/AuthContext';
import { queryKeys } from '../lib/queryClient';

interface Props {
  projects: Project[];
  filterProjectId?: string;
  onProjectIdChange?: (id?: string) => void;
}

export default function TasksPage({ projects, filterProjectId, onProjectIdChange }: Props) {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewMode>('list');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [search, setSearch] = useState('');

  // Only admins and managers have global create permissions
  const canCreate = profile?.role === 'admin' || profile?.role === 'manager';
  const visibleProjectIds = useMemo(() => projects.map(project => project.id), [projects]);

  const tasksQuery = useQuery({
    queryKey: queryKeys.tasks,
    queryFn: async () => {
      const { data } = await supabase
        .from('tasks')
        .select('*')
        .eq('is_deleted', false)
        .eq('is_active', true)
        .order('position')
        .order('created_at');
      return (data ?? []) as Task[];
    },
  });

  const projectAccessQuery = useQuery({
    queryKey: [...queryKeys.projectMembers(filterProjectId ?? 'all-visible'), user?.id ?? 'anon', visibleProjectIds.join(',')],
    enabled: !!user && visibleProjectIds.length > 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
    queryFn: async () => {
     
      const { data: memberData, error: memberError } = await supabase
        .from('project_members')
        .select('project_id, user_id')
        .in('project_id', visibleProjectIds);

      if (memberError) {
        console.error('❌ Error fetching member data:', memberError);
        throw memberError;
      }

      // Get all unique user IDs from members
      const memberUserIds = [...new Set(memberData?.map(row => row.user_id) || [])];
      
      // Fetch profiles for all member users
      let profilesMap: Record<string, Profile> = {};
      if (memberUserIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name, department_id, role')
          .in('id', memberUserIds);

        if (profilesError) {
          console.error('❌ Error fetching profiles:', profilesError);
        } else {
          profilesMap = (profilesData || []).reduce((acc, p) => {
            acc[p.id] = p as Profile;
            return acc;
          }, {} as Record<string, Profile>);
        }
      }

      // Also fetch creator profiles
      const creatorIds = [...new Set(projects.map(p => p.created_by))];
      const { data: creatorProfiles } = creatorIds.length > 0
        ? await supabase.from('profiles').select('id, full_name, department_id, role').in('id', creatorIds)
        : { data: [] };

      const creatorProfileMap: Record<string, Profile> = {};
      (creatorProfiles ?? []).forEach(p => { creatorProfileMap[p.id] = p as Profile; });

      const memberProjectIds = new Set<string>();
      const assigneeOptionsByProjectId: Record<string, Profile[]> = {};

      for (const project of projects) {
        const options: Profile[] = [];
        const seen = new Set<string>();

        // Add creator as an assignee option
        const creatorProfile = creatorProfileMap[project.created_by];
        if (creatorProfile && !seen.has(creatorProfile.id)) {
          options.push(creatorProfile);
          seen.add(creatorProfile.id);
        }

        // Get member rows for this project
        const projectMemberRows = memberData?.filter(row => row.project_id === project.id) || [];
        
        // Check if current user is a member
        const isMember = projectMemberRows.some(row => row.user_id === user?.id);
        
        if (isMember) {
          memberProjectIds.add(project.id);
        }

        // Add member profiles to assignee options
        for (const row of projectMemberRows) {
          const profileItem = profilesMap[row.user_id];
          if (profileItem && !seen.has(profileItem.id)) {
            options.push(profileItem);
            seen.add(profileItem.id);
          }
        }

        assigneeOptionsByProjectId[project.id] = options;
      }

      return { memberProjectIds, assigneeOptionsByProjectId };
    },
  });

  // Check if user can manage assignees for a project
  const canManageAssigneeForProject = (projectId: string) => {
    if (canCreate) return true;
    return projectAccessQuery.data?.memberProjectIds.has(projectId) || false;
  };

  // Check if user can edit tasks for a project
  const canEditTaskForProject = (projectId: string) => {
    if (canCreate) return true;
    return projectAccessQuery.data?.memberProjectIds.has(projectId) || false;
  };

  const filteredTasks = useMemo(() => (tasksQuery.data ?? []).filter(t => {
    const matchesVisibleProjects = projects.some(project => project.id === t.project_id);
    const matchesProject = filterProjectId ? t.project_id === filterProjectId : true;
    const matchesSearch = search.trim()
      ? t.title.toLowerCase().includes(search.toLowerCase())
      : true;
    return matchesVisibleProjects && matchesProject && matchesSearch;
  }), [tasksQuery.data, filterProjectId, search, projects]);

  function handleTaskUpdate() {
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
    if (selectedTask) {
      supabase.from('tasks').select('*').eq('id', selectedTask.id).maybeSingle().then(({ data }) => {
        if (data) setSelectedTask(data as Task);
      });
    }
  }

  function escapeCsvValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function handleExportCSV() {
    if (filteredTasks.length === 0) return;

    const headerSet = new Set<string>();
    filteredTasks.forEach(t => Object.keys(t).forEach(k => headerSet.add(k)));
    const headers = Array.from(headerSet);

    const rows = [
      headers.join(','),
      ...filteredTasks.map(t =>
        headers.map(h => escapeCsvValue((t as unknown as Record<string, unknown>)[h])).join(',')
      ),
    ];

    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const projectSlug = activeProject ? `-${activeProject.name.replace(/\s+/g, '_')}` : '';
    const dateStr = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `tasks-export${projectSlug}-${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const activeProject = filterProjectId ? projects.find(p => p.id === filterProjectId) : null;

  const isMember = filterProjectId
    ? projectAccessQuery.data?.memberProjectIds.has(filterProjectId) ?? false
    : false;
  
  const canEdit = canCreate || isMember;
  const assigneeOptionsByProjectId = projectAccessQuery.data?.assigneeOptionsByProjectId ?? {};

  console.log('🔐 Permission state:', {
    userId: user?.id,
    userRole: profile?.role,
    filterProjectId,
    canCreate,
    isMember,
    canEdit,
    memberProjectIds: projectAccessQuery.data ? Array.from(projectAccessQuery.data.memberProjectIds) : [],
    projectAccessData: projectAccessQuery.data,
    isLoading: projectAccessQuery.isLoading,
    isFetching: projectAccessQuery.isFetching,
    isError: projectAccessQuery.isError,
    error: projectAccessQuery.error,
  });

  useEffect(() => {
    if (filterProjectId && user) {
      console.log('🔄 Filter project changed, refetching project access...');
      projectAccessQuery.refetch();
    }
  }, [filterProjectId, user]);

  const viewButtons: { id: ViewMode; label: string; icon: typeof List }[] = [
    { id: 'list',  label: 'List',  icon: List },
    { id: 'board', label: 'Board', icon: LayoutGrid },
    { id: 'gantt', label: 'Gantt', icon: BarChart2 },
  ];

  return (
    <div className="flex flex-1 overflow-hidden" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="px-6 py-4 border-b border-gray-200/70 bg-white/80 backdrop-blur-sm flex-shrink-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-3">
            <button
              onClick={() => onProjectIdChange?.(undefined)}
              className="hover:text-blue-600 transition-colors font-medium"
            >
              Tasks
            </button>
            {activeProject && (
              <>
                <span>/</span>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: activeProject.color }} />
                  <span className="text-gray-700 font-semibold">{activeProject.name}</span>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* View toggles */}
            <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5">
              {viewButtons.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setView(id)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    view === id
                      ? 'bg-white shadow-sm text-gray-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="flex items-center gap-2 px-3.5 py-2 bg-gray-100 rounded-xl text-gray-400 hover:bg-gray-200/70 transition-colors border border-transparent focus-within:border-blue-300 focus-within:bg-white">
              <Search className="w-3.5 h-3.5 flex-shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search tasks..."
                className="bg-transparent text-xs focus:outline-none w-36 text-gray-700 placeholder-gray-400"
              />
            </div>

            {/* Project filter */}
            {!filterProjectId && projects.length > 0 && (
              <select
                onChange={e => onProjectIdChange?.(e.target.value || undefined)}
                className="px-3 py-2 bg-gray-100 text-xs text-gray-600 rounded-xl border-none focus:outline-none focus:ring-2 focus:ring-blue-400/40 hover:bg-gray-200/70 transition-colors cursor-pointer"
              >
                <option value="">All Projects</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}

            {/* Actions */}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={handleExportCSV}
                disabled={filteredTasks.length === 0}
                className="flex items-center gap-2 px-3.5 py-2 border border-gray-200 hover:border-gray-300 bg-white text-gray-600 rounded-xl text-xs font-semibold transition-all hover:shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>

              {canEdit && (
                <>
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="flex items-center gap-2 px-3.5 py-2 border border-gray-200 hover:border-gray-300 bg-white text-gray-600 rounded-xl text-xs font-semibold transition-all hover:shadow-sm"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Import CSV
                  </button>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-all shadow-sm shadow-blue-500/25 hover:shadow-blue-500/40"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Task
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tasksQuery.isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl h-32 animate-pulse shadow-sm" />
              ))}
            </div>
          ) : view === 'list' ? (
            <ListView
              projects={filterProjectId ? projects.filter(p => p.id === filterProjectId) : projects}
              tasks={filteredTasks}
              onRefresh={() => {
                tasksQuery.refetch();
                projectAccessQuery.refetch();
              }}
              onSelectTask={setSelectedTask}
              selectedTaskId={selectedTask?.id}
              filterProjectId={filterProjectId}
              canEditTaskForProject={canEditTaskForProject}
              assigneeOptionsByProjectId={assigneeOptionsByProjectId}
              canManageAssigneeForProject={canManageAssigneeForProject}
            />
          ) : view === 'board' ? (
            <BoardView
              projects={filterProjectId ? projects.filter(p => p.id === filterProjectId) : projects}
              tasks={filteredTasks}
              onRefresh={() => {
                tasksQuery.refetch();
                projectAccessQuery.refetch();
              }}
              onSelectTask={setSelectedTask}
              filterProjectId={filterProjectId}
              canEdit={canEdit}
              canEditTaskForProject={canEditTaskForProject}
            />
          ) : (
            <GanttView
              projects={filterProjectId ? projects.filter(p => p.id === filterProjectId) : projects}
              tasks={filteredTasks}
              filterProjectId={filterProjectId}
            />
          )}
        </div>
      </div>

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleTaskUpdate}
          canEdit={canEditTaskForProject(selectedTask.project_id)}
          canManageAssignee={canManageAssigneeForProject(selectedTask.project_id)}
          assigneeOptions={assigneeOptionsByProjectId[selectedTask.project_id] ?? []}
        />
      )}

      {showAddModal && (
        <AddTaskModal
          projects={filterProjectId ? projects.filter(p => p.id === filterProjectId) : projects}
          defaultProjectId={filterProjectId}
          assigneeOptionsByProjectId={assigneeOptionsByProjectId}
          canManageAssigneeForProject={canManageAssigneeForProject}
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            tasksQuery.refetch();
            projectAccessQuery.refetch();
          }}
        />
      )}

      {showImportModal && (
        <TaskImportModal
          projects={filterProjectId ? projects.filter(p => p.id === filterProjectId) : projects}
          defaultProjectId={filterProjectId}
          onClose={() => setShowImportModal(false)}
          onImported={() => {
            tasksQuery.refetch();
            projectAccessQuery.refetch();
          }}
        />
      )}
    </div>
  );
}
