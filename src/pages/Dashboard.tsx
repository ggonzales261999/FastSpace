import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckSquare, FolderOpen, TrendingUp, CheckCircle, PauseCircle, Circle, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Task, Project } from '../types';
import { queryKeys } from '../lib/queryClient';
import { filterVisibleProjects } from '../lib/projectAccess';

interface Stats {
  totalProjects: number;
  totalTasks: number;
  doneTasks: number;
  doingTasks: number;
  holdTasks: number;
  todoTasks: number;
}

export default function Dashboard({ onNavigate }: { onNavigate: (page: string, id?: string) => void }) {
  const { profile } = useAuth();
  const projectsQuery = useQuery({
    queryKey: [...queryKeys.dashboard, profile?.id ?? 'anon', profile?.department_id ?? 'none', profile?.role ?? 'unknown'],
    enabled: !!profile,
    queryFn: async () => {
      const { data } = await supabase
        .from('projects')
        .select('*')
        .eq('is_deleted', false)
        .eq('status', true);
      return filterVisibleProjects(profile, (data ?? []) as Project[]);
    },
  });

  const tasksQuery = useQuery({
    queryKey: [...queryKeys.dashboard, 'tasks', profile?.id ?? 'anon', profile?.department_id ?? 'none', profile?.role ?? 'unknown'],
    enabled: !!profile,
    queryFn: async () => {
      const [{ data: projects }, { data: tasks }] = await Promise.all([
        supabase
          .from('projects')
          .select('*')
          .eq('is_deleted', false)
          .eq('status', true),
        supabase
          .from('tasks')
          .select('*, project:projects(id,name,color)')
          .eq('is_deleted', false)
          .eq('is_active', true)
          .order('created_at', { ascending: false }),
      ]);
      const visibleProjects = filterVisibleProjects(profile, (projects ?? []) as Project[]);
      const visibleProjectIds = new Set(visibleProjects.map(project => project.id));
      return ((tasks ?? []) as (Task & { project?: Project })[]).filter(task => visibleProjectIds.has(task.project_id));
    },
  });

  const stats = useMemo<Stats>(() => {
    const allTasks = tasksQuery.data ?? [];
    return {
      totalProjects: projectsQuery.data?.length ?? 0,
      totalTasks: allTasks.length,
      doneTasks: allTasks.filter(t => t.status === 'done').length,
      doingTasks: allTasks.filter(t => t.status === 'doing').length,
      holdTasks: allTasks.filter(t => t.status === 'hold').length,
      todoTasks: allTasks.filter(t => t.status === 'todo').length,
    };
  }, [projectsQuery.data, tasksQuery.data]);

  const recentTasks = useMemo(() => (tasksQuery.data ?? []).slice(0, 8), [tasksQuery.data]);
  const loading = projectsQuery.isLoading || tasksQuery.isLoading;

  const donePercent = stats.totalTasks > 0 ? Math.round((stats.doneTasks / stats.totalTasks) * 100) : 0;

  const statCards = [
    {
      label: 'Projects', value: stats.totalProjects, icon: FolderOpen,
      iconBg: 'bg-blue-500/10', iconColor: 'text-blue-500',
      border: 'border-blue-100',
    },
    {
      label: 'Total Tasks', value: stats.totalTasks, icon: CheckSquare,
      iconBg: 'bg-slate-500/10', iconColor: 'text-slate-500',
      border: 'border-slate-100',
    },
    {
      label: 'In Progress', value: stats.doingTasks, icon: TrendingUp,
      iconBg: 'bg-amber-500/10', iconColor: 'text-amber-500',
      border: 'border-amber-100',
    },
    {
      label: 'Completed', value: stats.doneTasks, icon: CheckCircle,
      iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-500',
      border: 'border-emerald-100',
    },
    {
      label: 'On Hold', value: stats.holdTasks, icon: PauseCircle,
      iconBg: 'bg-rose-500/10', iconColor: 'text-rose-500',
      border: 'border-rose-100',
    },
    {
      label: 'To Do', value: stats.todoTasks, icon: Circle,
      iconBg: 'bg-violet-500/10', iconColor: 'text-violet-500',
      border: 'border-violet-100',
    },
  ];

  const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
    todo:  { label: 'To Do',   dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-600' },
    doing: { label: 'Doing',   dot: 'bg-amber-400',   badge: 'bg-amber-100 text-amber-700' },
    done:  { label: 'Done',    dot: 'bg-emerald-400', badge: 'bg-emerald-100 text-emerald-700' },
    hold:  { label: 'On Hold', dot: 'bg-rose-400',    badge: 'bg-rose-100 text-rose-700' },
  };

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">👋</span>
            <h1 className="text-2xl font-bold text-gray-900">
              Welcome back, {profile?.full_name?.split(' ')[0] || 'there'}!
            </h1>
          </div>
          <p className="text-gray-500 text-sm ml-9">Here's what's happening in your workspace today.</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-5 animate-pulse h-24 shadow-sm" />
            ))}
          </div>
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              {statCards.map(({ label, value, icon: Icon, iconBg, iconColor, border }) => (
                <div key={label} className={`bg-white rounded-2xl p-5 border ${border} shadow-sm hover:shadow-md transition-shadow`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
                      <p className="text-3xl font-bold text-gray-900 mt-1.5 leading-none">{value}</p>
                    </div>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
                      <Icon className={`w-5 h-5 ${iconColor}`} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Progress */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold text-gray-900">Overall Progress</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{stats.doneTasks} of {stats.totalTasks} tasks completed</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-emerald-600">{donePercent}%</span>
                  <p className="text-xs text-gray-400">complete</p>
                </div>
              </div>

              <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${donePercent}%` }}
                />
              </div>

              <div className="flex items-center gap-5 mt-4">
                {[
                  { label: 'To Do', val: stats.todoTasks, cls: 'bg-slate-400' },
                  { label: 'In Progress', val: stats.doingTasks, cls: 'bg-amber-400' },
                  { label: 'Done', val: stats.doneTasks, cls: 'bg-emerald-400' },
                  { label: 'On Hold', val: stats.holdTasks, cls: 'bg-rose-400' },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className={`w-2 h-2 rounded-full ${s.cls}`} />
                    <span className="font-medium">{s.val}</span> {s.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Tasks */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-gray-900">Recent Tasks</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Latest activity across all projects</p>
                </div>
                <button
                  onClick={() => onNavigate('tasks')}
                  className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                >
                  View all <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {recentTasks.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <CheckSquare className="w-8 h-8 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">No tasks yet. Create a project and add some tasks!</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {recentTasks.map(task => {
                    const cfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.todo;
                    return (
                      <div key={task.id} className="px-6 py-3.5 flex items-center gap-4 hover:bg-gray-50/60 transition-colors">
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: task.project?.color ?? '#94a3b8' }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{task.title}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{task.project?.name ?? 'Unknown project'}</p>
                        </div>
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full ${cfg.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
