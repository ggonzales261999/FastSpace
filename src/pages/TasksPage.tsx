import { useEffect, useState } from 'react';
import { LayoutGrid, List, BarChart2, Plus, Search, Upload, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Task, Project, ViewMode } from '../types';
import ListView from '../components/tasks/ListView';
import BoardView from '../components/tasks/BoardView';
import GanttView from '../components/tasks/GanttView';
import TaskDetailPanel from '../components/tasks/TaskDetailPanel';
import AddTaskModal from '../components/tasks/AddTaskModal';
import TaskImportModal from '../components/tasks/TaskImportModal';
import { useAuth } from '../context/AuthContext';

interface Props {
  projects: Project[];
  filterProjectId?: string;
  onProjectIdChange?: (id?: string) => void;
}

export default function TasksPage({ projects, filterProjectId, onProjectIdChange }: Props) {
  const { profile, user } = useAuth();
  const [view, setView] = useState<ViewMode>('list');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [search, setSearch] = useState('');
  const [projectMemberIds, setProjectMemberIds] = useState<Set<string>>(new Set());

  const canCreate = profile?.role === 'admin' || profile?.role === 'manager';

  async function loadTasks() {
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .order('position')
      .order('created_at');
    setTasks(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    async function loadMembers() {
      if (!filterProjectId || !user) return;
      const { data } = await supabase
        .from('project_members')
        .select('user_id')
        .eq('project_id', filterProjectId);
      const memberIds = new Set((data || []).map(m => m.user_id));
      const project = projects.find(p => p.id === filterProjectId);
      if (project?.created_by) memberIds.add(project.created_by);
      setProjectMemberIds(memberIds);
    }
    loadMembers();
  }, [filterProjectId, user, projects]);

  useEffect(() => { loadTasks(); }, []);

  const filteredTasks = tasks.filter(t => {
    const matchesProject = filterProjectId ? t.project_id === filterProjectId : true;
    const matchesSearch = search.trim()
      ? t.title.toLowerCase().includes(search.toLowerCase())
      : true;
    return matchesProject && matchesSearch;
  });

  function handleTaskUpdate() {
    loadTasks();
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

    // Collect every key present across the exported tasks, so the export
    // stays correct even as fields are added/removed from the schema.
    const headerSet = new Set<string>();
    filteredTasks.forEach(t => Object.keys(t).forEach(k => headerSet.add(k)));
    const headers = Array.from(headerSet);

    const rows = [
      headers.join(','),
      ...filteredTasks.map(t =>
        headers.map(h => escapeCsvValue((t as Record<string, unknown>)[h])).join(',')
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
  const canAddTasks = canCreate || (filterProjectId && projectMemberIds.has(user?.id || ''));

  const viewButtons: { id: ViewMode; label: string; icon: typeof List }[] = [
    { id: 'list', label: 'List', icon: List },
    { id: 'board', label: 'Board', icon: LayoutGrid },
    // { id: 'gantt', label: 'Gantt', icon: BarChart2 },
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

              {(canAddTasks || canCreate) && (
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
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl h-32 animate-pulse shadow-sm" />
              ))}
            </div>
          ) : view === 'list' ? (
            <ListView
              projects={filterProjectId ? projects.filter(p => p.id === filterProjectId) : projects}
              tasks={filteredTasks}
              onRefresh={loadTasks}
              onSelectTask={setSelectedTask}
              selectedTaskId={selectedTask?.id}
              filterProjectId={filterProjectId}
              canAddTasks={canAddTasks || canCreate}
            />
          ) : view === 'board' ? (
            <BoardView
              projects={filterProjectId ? projects.filter(p => p.id === filterProjectId) : projects}
              tasks={filteredTasks}
              onRefresh={loadTasks}
              onSelectTask={setSelectedTask}
              filterProjectId={filterProjectId}
              canEdit={canAddTasks || canCreate}
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
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleTaskUpdate}
        />
      )}

      {showAddModal && (
        <AddTaskModal
          projects={filterProjectId ? projects.filter(p => p.id === filterProjectId) : projects}
          defaultProjectId={filterProjectId}
          onClose={() => setShowAddModal(false)}
          onCreated={loadTasks}
        />
      )}

      {showImportModal && (
        <TaskImportModal
          projects={filterProjectId ? projects.filter(p => p.id === filterProjectId) : projects}
          defaultProjectId={filterProjectId}
          onClose={() => setShowImportModal(false)}
          onImported={loadTasks}
        />
      )}
    </div>
  );
}