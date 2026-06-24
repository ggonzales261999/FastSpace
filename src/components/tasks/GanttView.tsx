import { Task, Project } from '../../types';

interface Props {
  projects: Project[];
  tasks: Task[];
  filterProjectId?: string;
}

const STATUS_COLORS: Record<string, string> = {
  todo:  '#D1D5DB',
  doing: '#FBBF24',
  done:  '#10B981',
  hold:  '#F87171',
};

const STATUS_BG_CLASS: Record<string, string> = {
  todo:  'bg-gray-300',
  doing: 'bg-amber-400',
  done:  'bg-emerald-500',
  hold:  'bg-red-400',
};

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1)); // Monday
  return d;
}

function formatMonthYear(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s); // Already ISO timestamp
  return isNaN(d.getTime()) ? null : d;
}

export default function GanttView({ projects, tasks, filterProjectId }: Props) {
  const visibleProjects = filterProjectId ? projects.filter(p => p.id === filterProjectId) : projects;
  const mainTasks = tasks.filter(t => !t.parent_task_id && visibleProjects.some(p => p.id === t.project_id));
  const subtaskMap: Record<string, Task[]> = {};
  tasks.filter(t => !!t.parent_task_id).forEach(t => {
    if (!subtaskMap[t.parent_task_id!]) subtaskMap[t.parent_task_id!] = [];
    subtaskMap[t.parent_task_id!].push(t);
  });

  // Determine date range — week view around earliest task
  const allDates = tasks.flatMap(t => [parseDate(t.planned_start), parseDate(t.planned_end)].filter(Boolean) as Date[]);
  const baseDate = allDates.length > 0
    ? new Date(Math.min(...allDates.map(d => d.getTime())))
    : new Date();
  const weekStart = startOfWeek(baseDate);
  const NUM_WEEKS = 4;
  const NUM_DAYS = NUM_WEEKS * 7;
  const days = Array.from({ length: NUM_DAYS }, (_, i) => addDays(weekStart, i));

  const CELL_W = 44; // px per day
  const LEFT_W = 380; // px for label columns

  function getBarStyle(task: Task) {
    const start = parseDate(task.planned_start);
    const end = parseDate(task.planned_end);
    if (!start) return null;
    const startOffset = Math.round((start.getTime() - weekStart.getTime()) / 86400000);
    const endOffset = end ? Math.round((end.getTime() - weekStart.getTime()) / 86400000) + 1 : startOffset + 1;
    if (endOffset < 0 || startOffset >= NUM_DAYS) return null;
    const left = Math.max(0, startOffset) * CELL_W;
    const width = Math.max(1, Math.min(endOffset, NUM_DAYS) - Math.max(0, startOffset)) * CELL_W - 4;
    return { left, width };
  }

  // Flatten rows: project header, main task, then subtasks
  type Row = { type: 'project'; project: Project } | { type: 'task'; task: Task; depth: number };
  const rows: Row[] = [];
  visibleProjects.forEach(project => {
    rows.push({ type: 'project', project });
    mainTasks.filter(t => t.project_id === project.id).forEach(task => {
      rows.push({ type: 'task', task, depth: 0 });
      (subtaskMap[task.id] ?? []).forEach(sub => {
        rows.push({ type: 'task', task: sub, depth: 1 });
      });
    });
  });

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
        No tasks with dates to display in Gantt view. Add dates to your tasks.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Month / week label */}
      <div className="px-5 py-3 border-b border-gray-100 text-center font-semibold text-gray-700">
        {formatMonthYear(weekStart)}
        {' '}—{' '}
        {formatMonthYear(addDays(weekStart, NUM_DAYS - 1))}
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: LEFT_W + CELL_W * NUM_DAYS }}>
          {/* Header row */}
          <div className="flex border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
            <div className="flex-shrink-0 border-r border-gray-200 bg-gray-50" style={{ width: LEFT_W / 3 }}>
              <div className="px-4 py-2 text-xs font-semibold text-gray-600">Activity</div>
            </div>
            <div className="flex-shrink-0 border-r border-gray-200 bg-gray-50" style={{ width: LEFT_W / 3 }}>
              <div className="px-4 py-2 text-xs font-semibold text-gray-600">Start Date</div>
            </div>
            <div className="flex-shrink-0 border-r border-gray-200 bg-gray-50" style={{ width: LEFT_W / 3 }}>
              <div className="px-4 py-2 text-xs font-semibold text-gray-600">Due Date</div>
            </div>
            {/* Day columns */}
            <div className="flex">
              {days.map((d, i) => {
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <div
                    key={i}
                    style={{ width: CELL_W }}
                    className={`flex-shrink-0 text-center border-r border-gray-100 py-2 ${isWeekend ? 'bg-gray-100' : ''}`}
                  >
                    <div className="text-xs font-medium text-gray-500 leading-tight">
                      {d.toLocaleDateString('en-US', { weekday: 'short' }).substring(0, 3)} {d.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rows */}
          {rows.map((row, idx) => {
            if (row.type === 'project') {
              return (
                <div key={`proj-${row.project.id}-${idx}`} className="flex items-center border-b border-gray-100 bg-gray-50/60">
                  <div style={{ width: LEFT_W }} className="flex items-center gap-2 px-4 py-2 border-r border-gray-100">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: row.project.color }} />
                    <span className="text-xs font-bold text-gray-700">{row.project.name}</span>
                  </div>
                  <div className="flex" style={{ width: CELL_W * NUM_DAYS }}>
                    {days.map((d, i) => {
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      return <div key={i} style={{ width: CELL_W }} className={`border-r border-gray-50 h-7 ${isWeekend ? 'bg-gray-100/50' : ''}`} />;
                    })}
                  </div>
                </div>
              );
            }

            const { task, depth } = row;
            const bar = getBarStyle(task);
            const startLabel = task.planned_start
              ? new Date(task.planned_start).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
              : '';
            const endLabel = task.planned_end
              ? new Date(task.planned_end).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
              : '';

            return (
              <div key={`task-${task.id}-${idx}`} className="flex items-center border-b border-gray-50 hover:bg-blue-50/20 transition-colors">
                {/* Activity label */}
                <div style={{ width: LEFT_W / 3 }} className="border-r border-gray-100 px-4 py-2 flex items-center gap-1.5 flex-shrink-0">
                  {depth > 0 && (
                    <div className="flex items-center gap-0.5 ml-3">
                      <div className="w-0.5 h-4 bg-blue-300" />
                      <div className="w-2 h-0.5 bg-blue-300" />
                    </div>
                  )}
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: STATUS_COLORS[task.status] ?? '#9ca3af' }}
                  />
                  <span className="text-xs text-gray-700 truncate">{task.title}</span>
                </div>
                {/* Start date */}
                <div style={{ width: LEFT_W / 3 }} className="border-r border-gray-100 px-4 py-2 flex-shrink-0">
                  <span className="text-xs text-gray-500">{startLabel}</span>
                </div>
                {/* End date */}
                <div style={{ width: LEFT_W / 3 }} className="border-r border-gray-100 px-4 py-2 flex-shrink-0">
                  <span className="text-xs text-gray-500">{endLabel}</span>
                </div>
                {/* Gantt bar area */}
                <div className="relative flex" style={{ width: CELL_W * NUM_DAYS, height: 36 }}>
                  {days.map((d, i) => {
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    return <div key={i} style={{ width: CELL_W }} className={`flex-shrink-0 border-r border-gray-50 ${isWeekend ? 'bg-gray-50' : ''}`} />;
                  })}
                  {bar && (
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 h-5 rounded-full ${STATUS_BG_CLASS[task.status] ?? 'bg-gray-300'} opacity-90`}
                      style={{ left: bar.left + 2, width: bar.width }}
                      title={`${task.title} (${task.status})`}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
