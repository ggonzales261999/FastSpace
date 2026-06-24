import { TaskStatus } from '../../types';

const CONFIG: Record<TaskStatus, { label: string; dot: string; cls: string }> = {
  todo:  { label: 'To Do',  dot: 'bg-slate-400',   cls: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' },
  doing: { label: 'Doing',  dot: 'bg-amber-400',   cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  done:  { label: 'Done',   dot: 'bg-emerald-400', cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  hold:  { label: 'On Hold', dot: 'bg-rose-400',   cls: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200' },
};

export default function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const cfg = CONFIG[status] ?? CONFIG.todo;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

export function statusSelectClass(status: TaskStatus) {
  return CONFIG[status]?.cls ?? CONFIG.todo.cls;
}
