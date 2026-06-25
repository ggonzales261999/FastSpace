import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart2, TrendingUp, Clock, Users, CheckCircle, AlertCircle,
  Download, Building2, FolderOpen, ChevronDown, UserCheck, Target,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Task, Project, Profile, Department } from '../types';
import { queryKeys } from '../lib/queryClient';

interface DeptStats {
  id: string;
  name: string;
  color: string;
  totalTasks: number;
  doneTasks: number;
  doingTasks: number;
  holdTasks: number;
  todoTasks: number;
  totalProjects: number;
  totalMembers: number;
  completionRate: number;
}

interface WorkloadStats {
  id: string;
  fullName: string;
  totalAssigned: number;
  doingTasks: number;
  todoTasks: number;
  overThreshold: boolean;
}

interface ProductivityStats {
  id: string;
  fullName: string;
  completedTasks: number;
  doingTasks: number;
  holdTasks: number;
  todoTasks: number;
  completionRate: number;
  totalAssigned: number;
  lateTasks: number;
  estimatedHours: number;
  actualHours: number;
  efficiency: number;
}

interface ProjectStats {
  id: string;
  name: string;
  color: string;
  totalTasks: number;
  doneTasks: number;
  doingTasks: number;
  holdTasks: number;
  todoTasks: number;
  completionRate: number;
  estimatedHours: number;
  actualHours: number;
}

type ReportTab = 'overview' | 'departments' | 'workload' | 'productivity' | 'projects';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function calcCompletionRate(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

function calcEfficiency(completed: number, late: number, total: number): number {
  if (total === 0) return 100;
  const onTime = completed - late;
  return Math.round((onTime / Math.max(completed, 1)) * 100);
}

export default function ReportsPage() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
  const [expandedDept, setExpandedDept] = useState<string | null>(null);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin';

  // ─── Fetch all data ──────────────────────────────────────────────────────────
  const { data: allTasks = [], isLoading: tasksLoading, isError: tasksError } = useQuery({
    queryKey: [...queryKeys.reports, 'tasks'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from('tasks')
        .select('*')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });
      return (data ?? []) as Task[];
    },
  });

  const { data: allProjects = [], isLoading: projectsLoading, isError: projectsError } = useQuery({
    queryKey: [...queryKeys.reports, 'projects'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from('projects')
        .select('*')
        .eq('is_deleted', false)
        .eq('status', true)
        .order('name');
      return (data ?? []) as Project[];
    },
  });

  const { data: allDepartments = [], isLoading: deptsLoading, isError: deptsError } = useQuery({
    queryKey: [...queryKeys.reports, 'departments'],
    enabled: isAdmin,
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

  const { data: allProfiles = [], isLoading: profsLoading } = useQuery({
    queryKey: [...queryKeys.reports, 'profiles'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('is_deleted', false)
        .eq('status', true)
        .order('full_name');
      return (data ?? []) as Profile[];
    },
  });

  const loading = tasksLoading || projectsLoading || deptsLoading || profsLoading;
  const hasError = tasksError || projectsError || deptsError;

  const WORKLOAD_THRESHOLD = 10;

  // ─── Derived stats ───────────────────────────────────────────────────────────
  const projectMap = useMemo(() => {
    const map: Record<string, Project> = {};
    allProjects.forEach(p => { map[p.id] = p; });
    return map;
  }, [allProjects]);

  // ─── Department stats ────────────────────────────────────────────────────────
  const deptStats = useMemo<DeptStats[]>(() => {
    return allDepartments.map(dept => {
      const deptProjects = allProjects.filter(p => p.department_id === dept.id);
      const deptProjectIds = new Set(deptProjects.map(p => p.id));
      const deptTasks = allTasks.filter(t => deptProjectIds.has(t.project_id));
      const doneTasks = deptTasks.filter(t => t.status === 'done').length;
      const doingTasks = deptTasks.filter(t => t.status === 'doing').length;
      const holdTasks = deptTasks.filter(t => t.status === 'hold').length;
      const todoTasks = deptTasks.filter(t => t.status === 'todo').length;
      const deptMembers = allProfiles.filter(p => p.department_id === dept.id).length;

      return {
        id: dept.id,
        name: dept.name,
        color: dept.color,
        totalTasks: deptTasks.length,
        doneTasks,
        doingTasks,
        holdTasks,
        todoTasks,
        totalProjects: deptProjects.length,
        totalMembers: deptMembers,
        completionRate: calcCompletionRate(doneTasks, deptTasks.length),
      };
    }).sort((a, b) => b.totalTasks - a.totalTasks);
  }, [allDepartments, allProjects, allTasks, allProfiles]);

  // ─── Workload stats (assigned tasks per user) ────────────────────────────────
  const workloadStats = useMemo<WorkloadStats[]>(() => {
    return allProfiles.map(prof => {
      const assignedTasks = allTasks.filter(t => t.assigned_to === prof.id);
      const doingTasks = assignedTasks.filter(t => t.status === 'doing').length;
      const todoTasks = assignedTasks.filter(t => t.status === 'todo').length;

      return {
        id: prof.id,
        fullName: prof.full_name || 'Unnamed',
        totalAssigned: assignedTasks.length,
        doingTasks,
        todoTasks,
        overThreshold: assignedTasks.length > WORKLOAD_THRESHOLD,
      };
    }).filter(u => u.totalAssigned > 0)
      .sort((a, b) => b.totalAssigned - a.totalAssigned);
  }, [allProfiles, allTasks]);

  // ─── Productivity stats (team performance per user) ──────────────────────────
  const productivityStats = useMemo<ProductivityStats[]>(() => {
    return allProfiles.map(prof => {
      const assignedTasks = allTasks.filter(t => t.assigned_to === prof.id);
      const completedTasks = assignedTasks.filter(t => t.status === 'done').length;
      const doingTasks = assignedTasks.filter(t => t.status === 'doing').length;
      const holdTasks = assignedTasks.filter(t => t.status === 'hold').length;
      const todoTasks = assignedTasks.filter(t => t.status === 'todo').length;
      const totalAssigned = assignedTasks.length;

      // Late tasks: not done and past planned end date
      const lateTasks = assignedTasks.filter(t =>
        t.status !== 'done' && t.planned_end && new Date(t.planned_end) < new Date()
      ).length;

      const estimatedHours = assignedTasks.reduce((sum, t) => sum + (t.estimated_hours ?? 0), 0);
      const actualHours = assignedTasks
        .filter(t => t.actual_start && t.actual_end)
        .reduce((sum, t) => {
          const diff = new Date(t.actual_end!).getTime() - new Date(t.actual_start!).getTime();
          return sum + (diff > 0 ? Math.round(diff / 3600000 * 10) / 10 : 0);
        }, 0);

      return {
        id: prof.id,
        fullName: prof.full_name || 'Unnamed',
        completedTasks,
        doingTasks,
        holdTasks,
        todoTasks,
        completionRate: calcCompletionRate(completedTasks, totalAssigned),
        totalAssigned,
        lateTasks,
        estimatedHours: Math.round(estimatedHours * 10) / 10,
        actualHours: Math.round(actualHours * 10) / 10,
        efficiency: calcEfficiency(completedTasks, lateTasks, totalAssigned),
      };
    }).filter(u => u.totalAssigned > 0)
      .sort((a, b) => b.totalAssigned - a.totalAssigned);
  }, [allProfiles, allTasks]);

  // ─── Project stats ───────────────────────────────────────────────────────────
  const projectStats = useMemo<ProjectStats[]>(() => {
    return allProjects.map(proj => {
      const projTasks = allTasks.filter(t => t.project_id === proj.id);
      const doneTasks = projTasks.filter(t => t.status === 'done').length;
      const doingTasks = projTasks.filter(t => t.status === 'doing').length;
      const holdTasks = projTasks.filter(t => t.status === 'hold').length;
      const todoTasks = projTasks.filter(t => t.status === 'todo').length;
      const estimatedHours = projTasks.reduce((sum, t) => sum + (t.estimated_hours ?? 0), 0);
      const actualHours = projTasks
        .filter(t => t.actual_start && t.actual_end)
        .reduce((sum, t) => {
          const diff = new Date(t.actual_end!).getTime() - new Date(t.actual_start!).getTime();
          return sum + (diff > 0 ? Math.round(diff / 3600000 * 10) / 10 : 0);
        }, 0);

      return {
        id: proj.id,
        name: proj.name,
        color: proj.color,
        totalTasks: projTasks.length,
        doneTasks,
        doingTasks,
        holdTasks,
        todoTasks,
        completionRate: calcCompletionRate(doneTasks, projTasks.length),
        estimatedHours: Math.round(estimatedHours * 10) / 10,
        actualHours: Math.round(actualHours * 10) / 10,
      };
    }).sort((a, b) => b.totalTasks - a.totalTasks);
  }, [allProjects, allTasks]);

  // ─── Overview stats ──────────────────────────────────────────────────────────
  const overviewStats = useMemo(() => {
    const totalTasks = allTasks.length;
    const doneTasks = allTasks.filter(t => t.status === 'done').length;
    const doingTasks = allTasks.filter(t => t.status === 'doing').length;
    const holdTasks = allTasks.filter(t => t.status === 'hold').length;
    const todoTasks = allTasks.filter(t => t.status === 'todo').length;
    const totalEstimatedHours = allTasks.reduce((sum, t) => sum + (t.estimated_hours ?? 0), 0);
    const tasksWithActual = allTasks.filter(t => t.actual_start && t.actual_end);
    const totalActualHours = tasksWithActual.reduce((sum, t) => {
      const diff = new Date(t.actual_end!).getTime() - new Date(t.actual_start!).getTime();
      return sum + (diff > 0 ? Math.round(diff / 3600000 * 10) / 10 : 0);
    }, 0);
    const overdueTasks = allTasks.filter(t =>
      t.status !== 'done' && t.planned_end && new Date(t.planned_end) < new Date()
    ).length;
    const unassignedTasks = allTasks.filter(t => !t.assigned_to).length;

    // Tasks created per month (last 6 months)
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const monthlyData: { month: string; created: number; done: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(sixMonthsAgo.getFullYear(), sixMonthsAgo.getMonth() + i, 1);
      const monthStart = d.toISOString();
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString();
      const created = allTasks.filter(t => t.created_at >= monthStart && t.created_at <= monthEnd).length;
      const done = allTasks.filter(t =>
        t.status === 'done' && t.updated_at >= monthStart && t.updated_at <= monthEnd
      ).length;
      monthlyData.push({
        month: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
        created,
        done,
      });
    }

    return {
      totalTasks,
      doneTasks,
      doingTasks,
      holdTasks,
      todoTasks,
      completionRate: calcCompletionRate(doneTasks, totalTasks),
      totalProjects: allProjects.length,
      totalDepartments: allDepartments.length,
      totalUsers: allProfiles.length,
      totalEstimatedHours: Math.round(totalEstimatedHours * 10) / 10,
      totalActualHours: Math.round(totalActualHours * 10) / 10,
      overdueTasks,
      unassignedTasks,
      monthlyData,
    };
  }, [allTasks, allProjects, allDepartments, allProfiles]);

  // ─── Export CSV ──────────────────────────────────────────────────────────────
  function exportCSV() {
    const rows = [['Report', 'Metric', 'Value']];
    
    rows.push(['Overview', 'Total Tasks', String(overviewStats.totalTasks)]);
    rows.push(['Overview', 'Completed Tasks', String(overviewStats.doneTasks)]);
    rows.push(['Overview', 'In Progress', String(overviewStats.doingTasks)]);
    rows.push(['Overview', 'On Hold', String(overviewStats.holdTasks)]);
    rows.push(['Overview', 'To Do', String(overviewStats.todoTasks)]);
    rows.push(['Overview', 'Completion Rate', `${overviewStats.completionRate}%`]);
    rows.push(['Overview', 'Total Projects', String(overviewStats.totalProjects)]);
    rows.push(['Overview', 'Total Departments', String(overviewStats.totalDepartments)]);
    rows.push(['Overview', 'Total Users', String(overviewStats.totalUsers)]);
    rows.push(['Overview', 'Estimated Hours', String(overviewStats.totalEstimatedHours)]);
    rows.push(['Overview', 'Actual Hours', String(overviewStats.totalActualHours)]);
    rows.push(['Overview', 'Overdue Tasks', String(overviewStats.overdueTasks)]);
    rows.push(['Overview', 'Unassigned Tasks', String(overviewStats.unassignedTasks)]);

    deptStats.forEach(d => {
      rows.push([`Department: ${d.name}`, 'Total Tasks', String(d.totalTasks)]);
      rows.push([`Department: ${d.name}`, 'Completed', String(d.doneTasks)]);
      rows.push([`Department: ${d.name}`, 'Completion Rate', `${d.completionRate}%`]);
      rows.push([`Department: ${d.name}`, 'Projects', String(d.totalProjects)]);
      rows.push([`Department: ${d.name}`, 'Members', String(d.totalMembers)]);
    });

    workloadStats.forEach(w => {
      rows.push([`Workload: ${w.fullName}`, 'Assigned Tasks', String(w.totalAssigned)]);
      rows.push([`Workload: ${w.fullName}`, 'In Progress', String(w.doingTasks)]);
      rows.push([`Workload: ${w.fullName}`, 'To Do', String(w.todoTasks)]);
    });

    productivityStats.forEach(p => {
      rows.push([`Productivity: ${p.fullName}`, 'Completed Tasks', String(p.completedTasks)]);
      rows.push([`Productivity: ${p.fullName}`, 'Completion Rate', `${p.completionRate}%`]);
      rows.push([`Productivity: ${p.fullName}`, 'Late Tasks', String(p.lateTasks)]);
      rows.push([`Productivity: ${p.fullName}`, 'Est. Hours', String(p.estimatedHours)]);
      rows.push([`Productivity: ${p.fullName}`, 'Actual Hours', String(p.actualHours)]);
      rows.push([`Productivity: ${p.fullName}`, 'Efficiency', `${p.efficiency}%`]);
    });

    projectStats.forEach(p => {
      rows.push([`Project: ${p.name}`, 'Total Tasks', String(p.totalTasks)]);
      rows.push([`Project: ${p.name}`, 'Completed', String(p.doneTasks)]);
      rows.push([`Project: ${p.name}`, 'Completion Rate', `${p.completionRate}%`]);
      rows.push([`Project: ${p.name}`, 'Est. Hours', String(p.estimatedHours)]);
      rows.push([`Project: ${p.name}`, 'Actual Hours', String(p.actualHours)]);
    });

    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reports-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ─── Access check ────────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center text-gray-400">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-500">Access restricted</p>
          <p className="text-sm mt-1">Only admins can access reports.</p>
        </div>
      </div>
    );
  }

  const tabs: { id: ReportTab; label: string; icon: typeof BarChart2 }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart2 },
    { id: 'departments', label: 'Departments', icon: Building2 },
    { id: 'workload', label: 'Workload', icon: Users },
    { id: 'productivity', label: 'Productivity', icon: Target },
    { id: 'projects', label: 'Projects', icon: FolderOpen },
  ];

  const statusBar = (done: number, doing: number, hold: number, todo: number, total: number) => {
    if (total === 0) return null;
    const pDone = (done / total) * 100;
    const pDoing = (doing / total) * 100;
    const pHold = (hold / total) * 100;
    const pTodo = (todo / total) * 100;
    return (
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden flex">
        {pDone > 0 && <div className="h-full bg-emerald-400 transition-all" style={{ width: `${pDone}%` }} title={`Done: ${done}`} />}
        {pDoing > 0 && <div className="h-full bg-amber-400 transition-all" style={{ width: `${pDoing}%` }} title={`Doing: ${doing}`} />}
        {pHold > 0 && <div className="h-full bg-rose-400 transition-all" style={{ width: `${pHold}%` }} title={`Hold: ${hold}`} />}
        {pTodo > 0 && <div className="h-full bg-slate-300 transition-all" style={{ width: `${pTodo}%` }} title={`Todo: ${todo}`} />}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart2 className="w-6 h-6 text-blue-500" />
              Reports
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Analytics and insights across your entire workspace
            </p>
          </div>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 rounded-xl text-sm font-semibold transition-all hover:shadow-sm"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>

        {hasError ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-gray-100 shadow-sm">
            <AlertCircle className="w-10 h-10 text-red-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 font-medium">Error loading reports data</p>
            <p className="text-xs text-gray-400 mt-1">Try refreshing the page.</p>
          </div>
        ) : loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl h-32 animate-pulse shadow-sm" />
            ))}
          </div>
        ) : (
          <>
            <div className="flex gap-1 mb-6 bg-white rounded-xl p-1 border border-gray-100 shadow-sm">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all flex-1 justify-center ${
                    activeTab === id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>

            {/* ── Overview Tab ── */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Tasks', value: overviewStats.totalTasks, icon: BarChart2, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { label: 'Completion Rate', value: `${overviewStats.completionRate}%`, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: 'Overdue Tasks', value: overviewStats.overdueTasks, icon: Clock, color: 'text-rose-600', bg: 'bg-rose-50' },
                    { label: 'Unassigned', value: overviewStats.unassignedTasks, icon: Users, color: 'text-amber-600', bg: 'bg-amber-50' },
                  ].map(({ label, value, icon: Icon, color, bg }) => (
                    <div key={label} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
                          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
                        </div>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bg}`}>
                          <Icon className={`w-5 h-5 ${color}`} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                  <h2 className="font-semibold text-gray-900 mb-4">Task Status Distribution</h2>
                  <div className="space-y-3">
                    {[
                      { label: 'Done', value: overviewStats.doneTasks, color: 'bg-emerald-500', percent: overviewStats.totalTasks > 0 ? (overviewStats.doneTasks / overviewStats.totalTasks) * 100 : 0 },
                      { label: 'In Progress', value: overviewStats.doingTasks, color: 'bg-amber-500', percent: overviewStats.totalTasks > 0 ? (overviewStats.doingTasks / overviewStats.totalTasks) * 100 : 0 },
                      { label: 'On Hold', value: overviewStats.holdTasks, color: 'bg-rose-500', percent: overviewStats.totalTasks > 0 ? (overviewStats.holdTasks / overviewStats.totalTasks) * 100 : 0 },
                      { label: 'To Do', value: overviewStats.todoTasks, color: 'bg-slate-400', percent: overviewStats.totalTasks > 0 ? (overviewStats.todoTasks / overviewStats.totalTasks) * 100 : 0 },
                    ].map(s => (
                      <div key={s.label}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                            <span className="text-gray-700 font-medium">{s.label}</span>
                          </div>
                          <span className="text-gray-500">{s.value} ({Math.round(s.percent)}%)</span>
                        </div>
                        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-700 ${s.color}`} style={{ width: `${s.percent}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                  <h2 className="font-semibold text-gray-900 mb-4">Monthly Activity (Last 6 Months)</h2>
                  <div className="space-y-3">
                    {overviewStats.monthlyData.map(m => {
                      const maxVal = Math.max(m.created, m.done, 1);
                      return (
                        <div key={m.month}>
                          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                            <span className="font-medium text-gray-700">{m.month}</span>
                            <span>Created: {m.created} · Completed: {m.done}</span>
                          </div>
                          <div className="flex gap-1 h-8 items-end">
                            <div className="flex-1 flex flex-col items-center gap-0.5">
                              <div className="w-full bg-blue-400 rounded-t transition-all" style={{ height: `${(m.created / maxVal) * 100}%`, minHeight: m.created > 0 ? '4px' : '0' }} title={`Created: ${m.created}`} />
                            </div>
                            <div className="flex-1 flex flex-col items-center gap-0.5">
                              <div className="w-full bg-emerald-400 rounded-t transition-all" style={{ height: `${(m.done / maxVal) * 100}%`, minHeight: m.done > 0 ? '4px' : '0' }} title={`Completed: ${m.done}`} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[
                    { label: 'Total Projects', value: overviewStats.totalProjects, icon: FolderOpen, color: 'text-violet-600', bg: 'bg-violet-50' },
                    { label: 'Departments', value: overviewStats.totalDepartments, icon: Building2, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                    { label: 'Active Users', value: overviewStats.totalUsers, icon: Users, color: 'text-cyan-600', bg: 'bg-cyan-50' },
                    { label: 'Est. Hours', value: overviewStats.totalEstimatedHours, icon: Clock, color: 'text-orange-600', bg: 'bg-orange-50' },
                    { label: 'Actual Hours', value: overviewStats.totalActualHours, icon: TrendingUp, color: 'text-teal-600', bg: 'bg-teal-50' },
                    // { label: 'Hour Variance', value: `${overviewStats.totalEstimatedHours > 0 ? Math.round(((overviewStats.totalActualHours - overviewStats.totalEstimatedHours) / overviewStats.totalEstimatedHours) * 100) : 0}%`, icon: BarChart2, color: 'text-gray-600', bg: 'bg-gray-50' },
                  ].map(({ label, value, icon: Icon, color, bg }) => (
                    <div key={label} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
                          <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
                        </div>
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${bg}`}>
                          <Icon className={`w-4.5 h-4.5 ${color}`} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Departments Tab ── */}
            {activeTab === 'departments' && (
              <div className="space-y-4">
                {deptStats.length === 0 ? (
                  <div className="bg-white rounded-2xl p-12 text-center border border-gray-100 shadow-sm">
                    <Building2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm text-gray-400">No department data available.</p>
                  </div>
                ) : (
                  deptStats.map(dept => {
                    const isExpanded = expandedDept === dept.id;
                    return (
                      <div key={dept.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <button
                          onClick={() => setExpandedDept(isExpanded ? null : dept.id)}
                          className="w-full px-6 py-4 flex items-center gap-4 hover:bg-gray-50/60 transition-colors"
                        >
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: dept.color }} />
                          <div className="flex-1 text-left">
                            <h3 className="font-semibold text-gray-900">{dept.name}</h3>
                            <p className="text-xs text-gray-400">{dept.totalProjects} projects · {dept.totalMembers} members · {dept.totalTasks} tasks</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className="text-lg font-bold text-gray-900">{dept.completionRate}%</span>
                            <p className="text-xs text-gray-400">complete</p>
                          </div>
                          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                        {isExpanded && (
                          <div className="px-6 pb-5 border-t border-gray-100 pt-4">
                            {statusBar(dept.doneTasks, dept.doingTasks, dept.holdTasks, dept.todoTasks, dept.totalTasks)}
                            <div className="grid grid-cols-4 gap-4 mt-4">
                              {[
                                { label: 'Done', value: dept.doneTasks, color: 'text-emerald-600' },
                                { label: 'Doing', value: dept.doingTasks, color: 'text-amber-600' },
                                { label: 'Hold', value: dept.holdTasks, color: 'text-rose-600' },
                                { label: 'To Do', value: dept.todoTasks, color: 'text-slate-600' },
                              ].map(s => (
                                <div key={s.label} className="text-center">
                                  <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                                  <p className="text-xs text-gray-400">{s.label}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ── Workload Dashboard Tab ── */}
            {activeTab === 'workload' && (
              <div className="space-y-4">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100">
                    <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-blue-500" />
                      Workload Dashboard
                    </h2>
                    <p className="text-xs text-gray-400 mt-1">
                      Current task assignment per team member. Threshold: {WORKLOAD_THRESHOLD} tasks
                    </p>
                  </div>
                  {workloadStats.length === 0 ? (
                    <div className="p-12 text-center">
                      <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                      <p className="text-sm text-gray-400">No workload data available.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {workloadStats.map((w, idx) => (
                        <div key={w.id} className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50/60 transition-colors">
                          <span className="text-xs font-bold text-gray-300 w-6">{idx + 1}</span>
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-xs font-bold text-slate-600 flex-shrink-0">
                            {w.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{w.fullName}</p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
                                Doing: {w.doingTasks}
                              </span>
                              <span className="text-xs text-slate-600 bg-slate-50 px-2 py-0.5 rounded-full font-medium">
                                To Do: {w.todoTasks}
                              </span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className={`text-xl font-bold ${w.overThreshold ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {w.totalAssigned}
                            </span>
                            <p className="text-xs text-gray-400">tasks</p>
                          </div>
                          <div className="w-24 flex-shrink-0">
                            {w.totalAssigned > 0 && (
                              <div className="space-y-1">
                                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${(w.doingTasks / w.totalAssigned) * 100}%` }} />
                                </div>
                                <div className="flex justify-between text-[10px] text-gray-400">
                                  <span>Active</span>
                                  <span className={w.overThreshold ? 'text-rose-500 font-bold' : 'text-gray-500'}>
                                    {w.overThreshold ? 'OVERLOADED' : 'OK'}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Team Productivity Tab ── */}
            {activeTab === 'productivity' && (
              <div className="space-y-4">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100">
                    <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                      <Target className="w-4 h-4 text-emerald-500" />
                      Team Productivity Report
                    </h2>
                    <p className="text-xs text-gray-400 mt-1">
                      Individual performance metrics including completion rate, and efficiency
                    </p>
                  </div>
                  {productivityStats.length === 0 ? (
                    <div className="p-12 text-center">
                      <Target className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                      <p className="text-sm text-gray-400">No productivity data available.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {productivityStats.map((ps, idx) => (
                        <div key={ps.id} className="px-6 py-4 hover:bg-gray-50/60 transition-colors">
                          <div className="flex items-center gap-4">
                            <span className="text-xs font-bold text-gray-300 w-6">{idx + 1}</span>
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-xs font-bold text-slate-600 flex-shrink-0">
                              {ps.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{ps.fullName}</p>
                              <p className="text-xs text-gray-400">{ps.totalAssigned} total tasks</p>
                            </div>
                            {/* <div className="text-right flex-shrink-0">
                              <span className={`text-lg font-bold ${ps.efficiency >= 90 ? 'text-emerald-600' : ps.efficiency >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>
                                {ps.efficiency}%
                              </span>
                              <p className="text-xs text-gray-400">efficiency</p>
                            </div> */}
                          </div>
                          <div className="mt-3 ml-10 grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="bg-emerald-50 rounded-lg px-3 py-2 text-center">
                              <p className="text-sm font-bold text-emerald-700">{ps.completedTasks}</p>
                              <p className="text-[10px] text-emerald-600">Completed</p>
                            </div>
                            <div className="bg-amber-50 rounded-lg px-3 py-2 text-center">
                              <p className="text-sm font-bold text-amber-700">{ps.doingTasks}</p>
                              <p className="text-[10px] text-amber-600">In Progress</p>
                            </div>
                            <div className="bg-rose-50 rounded-lg px-3 py-2 text-center">
                              <p className="text-sm font-bold text-rose-700">{ps.lateTasks}</p>
                              <p className="text-[10px] text-rose-600">Late Tasks</p>
                            </div>
                            <div className="bg-purple-50 rounded-lg px-3 py-2 text-center">
                              <p className="text-sm font-bold text-purple-700">{ps.completionRate}%</p>
                              <p className="text-[10px] text-purple-600">Rate</p>
                            </div>
                          </div>
                          {ps.estimatedHours > 0 && (
                            <div className="ml-10 mt-2 flex items-center gap-3 text-xs text-gray-400">
                              <span>Est. Hours: <strong>{ps.estimatedHours}h</strong></span>
                              <span>Actual: <strong>{ps.actualHours}h</strong></span>
                              {/* <span className={ps.actualHours <= ps.estimatedHours ? 'text-emerald-600' : 'text-rose-600'}>
                                Variance: {ps.estimatedHours > 0 ? `${Math.round(((ps.actualHours - ps.estimatedHours) / ps.estimatedHours) * 100)}%` : 'N/A'}
                              </span> */}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Projects Tab ── */}
            {activeTab === 'projects' && (
              <div className="space-y-4">
                {projectStats.length === 0 ? (
                  <div className="bg-white rounded-2xl p-12 text-center border border-gray-100 shadow-sm">
                    <FolderOpen className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm text-gray-400">No project data available.</p>
                  </div>
                ) : (
                  projectStats.map(proj => {
                    const isExpanded = expandedProject === proj.id;
                    const dept = allDepartments.find(d => d.id === projectMap[proj.id]?.department_id);
                    return (
                      <div key={proj.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <button
                          onClick={() => setExpandedProject(isExpanded ? null : proj.id)}
                          className="w-full px-6 py-4 flex items-center gap-4 hover:bg-gray-50/60 transition-colors"
                        >
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: proj.color }} />
                          <div className="flex-1 text-left">
                            <h3 className="font-semibold text-gray-900">{proj.name}</h3>
                            <p className="text-xs text-gray-400">{proj.totalTasks} tasks{dept && <> · {dept.name}</>}</p>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-500 flex-shrink-0">
                            <span title="Estimated hours"><Clock className="w-3 h-3 inline" /> {proj.estimatedHours}h</span>
                          </div>
                          <div className="text-right flex-shrink-0 w-16">
                            <span className="text-lg font-bold text-gray-900">{proj.completionRate}%</span>
                          </div>
                          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                        {isExpanded && (
                          <div className="px-6 pb-5 border-t border-gray-100 pt-4">
                            {statusBar(proj.doneTasks, proj.doingTasks, proj.holdTasks, proj.todoTasks, proj.totalTasks)}
                            <div className="grid grid-cols-4 gap-4 mt-4">
                              {[
                                { label: 'Done', value: proj.doneTasks, color: 'text-emerald-600' },
                                { label: 'Doing', value: proj.doingTasks, color: 'text-amber-600' },
                                { label: 'Hold', value: proj.holdTasks, color: 'text-rose-600' },
                                { label: 'To Do', value: proj.todoTasks, color: 'text-slate-600' },
                              ].map(s => (
                                <div key={s.label} className="text-center">
                                  <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                                  <p className="text-xs text-gray-400">{s.label}</p>
                                </div>
                              ))}
                            </div>
                            {proj.actualHours > 0 && (
                              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-500">
                                <span>Estimated: <strong>{proj.estimatedHours}h</strong></span>
                                <span>Actual: <strong>{proj.actualHours}h</strong></span>
                                <span className={proj.actualHours <= proj.estimatedHours ? 'text-emerald-600' : 'text-rose-600'}>
                                  Variance: {proj.estimatedHours > 0 ? `${Math.round(((proj.actualHours - proj.estimatedHours) / proj.estimatedHours) * 100)}%` : 'N/A'}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}