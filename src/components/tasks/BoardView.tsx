import { useState, useEffect } from 'react';
import { Task, Project, TaskStatus, BoardColumn } from '../../types';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Calendar, Clock, Trash2, Plus, X, Check } from 'lucide-react';

interface Props {
  projects: Project[];
  tasks: Task[];
  onRefresh: () => void;
  onSelectTask: (task: Task) => void;
  filterProjectId?: string;
  canEdit?: boolean;
}

const BUILT_IN: { status: TaskStatus; label: string; accent: string; bg: string; badge: string }[] = [
  { status: 'todo',  label: 'To Do',   accent: 'bg-slate-300',   bg: 'bg-slate-50/60',   badge: 'bg-slate-100 text-slate-500' },
  { status: 'doing', label: 'Doing',   accent: 'bg-amber-400',   bg: 'bg-amber-50/40',   badge: 'bg-amber-100 text-amber-600' },
  { status: 'done',  label: 'Done',    accent: 'bg-emerald-400', bg: 'bg-emerald-50/40', badge: 'bg-emerald-100 text-emerald-600' },
  { status: 'hold',  label: 'On Hold', accent: 'bg-rose-400',    bg: 'bg-rose-50/30',    badge: 'bg-rose-100 text-rose-600' },
];

const COLUMN_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#06b6d4', '#f43f5e',
];

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDateTime(d: string | null | undefined) {
  if (!d) return null;
  const date = new Date(d);
  if (isNaN(date.getTime())) return null;
  const h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${(h % 12 || 12)}:${m} ${ampm}`;
}

export default function BoardView({ projects, tasks, onRefresh, onSelectTask, filterProjectId, canEdit: canEditProp }: Props) {
  const { user, profile } = useAuth();
  const canEdit = canEditProp || profile?.role === 'admin' || profile?.role === 'manager';

  const [customColumns, setCustomColumns] = useState<BoardColumn[]>([]);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColColor, setNewColColor] = useState(COLUMN_COLORS[0]);

  const visibleProjects = filterProjectId ? projects.filter(p => p.id === filterProjectId) : projects;
  const projectIds = visibleProjects.map(p => p.id);
  const mainTasks = tasks.filter(t => !t.parent_task_id);

  useEffect(() => {
    if (projectIds.length === 0) return;
    supabase
      .from('board_columns')
      .select('*')
      .in('project_id', projectIds)
      .order('position')
      .then(({ data }) => setCustomColumns(data ?? []));
  }, [filterProjectId, projects.length]);

  // Human-readable label for whichever column a task currently sits in,
  // whether that's a built-in status column or a custom board column.
  function columnLabel(task: Task): string {
    if (task.board_column_id) {
      const col = customColumns.find(c => c.id === task.board_column_id);
      return col?.name ?? task.board_column_id;
    }
    const built = BUILT_IN.find(b => b.status === task.status);
    return built?.label ?? task.status;
  }

  async function logHistory(taskId: string, fieldName: string, oldValue: string | null, newValue: string | null) {
    if (!user) return;
    await supabase.from('task_history').insert({
      task_id: taskId,
      user_id: user.id,
      field_name: fieldName,
      old_value: oldValue,
      new_value: newValue,
    });
  }

  async function moveToBuiltIn(taskId: string, newStatus: TaskStatus) {
    const task = tasks.find(t => t.id === taskId);
    const oldLabel = task ? columnLabel(task) : null;
    const newLabel = BUILT_IN.find(b => b.status === newStatus)?.label ?? newStatus;

    await supabase.from('tasks').update({
      status: newStatus,
      board_column_id: null,
      updated_at: new Date().toISOString(),
    }).eq('id', taskId);

    if (oldLabel !== newLabel) {
      await logHistory(taskId, 'status', oldLabel, newLabel);
    }

    onRefresh();
  }

  async function moveToCustom(taskId: string, columnId: string) {
    const task = tasks.find(t => t.id === taskId);
    const oldLabel = task ? columnLabel(task) : null;
    const newLabel = customColumns.find(c => c.id === columnId)?.name ?? columnId;

    await supabase.from('tasks').update({
      board_column_id: columnId,
      updated_at: new Date().toISOString(),
    }).eq('id', taskId);

    if (oldLabel !== newLabel) {
      await logHistory(taskId, 'board_column', oldLabel, newLabel);
    }

    onRefresh();
  }

  async function deleteTask(id: string) {
    if (!confirm('Delete this task?')) return;
    await supabase.from('tasks').delete().eq('id', id);
    onRefresh();
  }

  async function addColumn() {
    if (!newColName.trim() || !filterProjectId) return;
    const pos = customColumns.filter(c => c.project_id === filterProjectId).length;
    const { data } = await supabase.from('board_columns').insert({
      project_id: filterProjectId,
      name: newColName.trim(),
      color: newColColor,
      position: pos,
    }).select().maybeSingle();
    if (data) setCustomColumns(prev => [...prev, data as BoardColumn]);
    setNewColName('');
    setNewColColor(COLUMN_COLORS[0]);
    setAddingColumn(false);
  }

  async function deleteColumn(id: string) {
    if (!confirm('Delete this column? Tasks in it will be moved to To Do.')) return;
    await supabase.from('tasks').update({ board_column_id: null, status: 'todo' }).eq('board_column_id', id);
    await supabase.from('board_columns').delete().eq('id', id);
    setCustomColumns(prev => prev.filter(c => c.id !== id));
    onRefresh();
  }

  function getBuiltInTasks(status: TaskStatus) {
    return mainTasks.filter(t =>
      t.status === status &&
      !t.board_column_id &&
      projectIds.includes(t.project_id)
    );
  }

  function getCustomColTasks(colId: string) {
    return mainTasks.filter(t =>
      t.board_column_id === colId &&
      projectIds.includes(t.project_id)
    );
  }

  function TaskCard({ task }: { task: Task }) {
    const project = projects.find(p => p.id === task.project_id);
    const subtaskCount = tasks.filter(t => t.parent_task_id === task.id).length;
    return (
      <div
        draggable={canEdit}
        onDragStart={e => e.dataTransfer.setData('taskId', task.id)}
        onClick={() => onSelectTask(task)}
        className="bg-white rounded-xl p-4 border border-gray-100/80 shadow-sm hover:shadow-md cursor-pointer transition-all hover:border-blue-200/60 hover:-translate-y-px group"
      >
        <div className="flex items-start justify-between gap-2 mb-3">
          <p className="text-sm font-medium text-gray-800 leading-snug">{task.title}</p>
          {canEdit && (
            <button
              onClick={e => { e.stopPropagation(); deleteTask(task.id); }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {project && (
          <div className="flex items-center gap-1.5 mb-2.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
            <span className="text-xs text-gray-400 font-medium">{project.name}</span>
          </div>
        )}

        {(task.planned_start || task.planned_end) && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2.5">
            <Calendar className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">
              {formatDateTime(task.planned_start)}
              {task.planned_end ? ` → ${formatDateTime(task.planned_end)}` : ''}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between">
          {task.estimated_hours ? (
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Clock className="w-3 h-3" />
              {task.estimated_hours}h
            </div>
          ) : <div />}
          {subtaskCount > 0 && (
            <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md">
              {subtaskCount} subtask{subtaskCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {canEdit && (
          <div className="mt-3 pt-2.5 border-t border-gray-100 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {BUILT_IN.filter(s => s.status !== task.status || task.board_column_id)
              .slice(0, 2)
              .map(s => (
                <button
                  key={s.status}
                  onClick={e => { e.stopPropagation(); moveToBuiltIn(task.id, s.status); }}
                  className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors capitalize"
                >
                  {s.label}
                </button>
              ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 h-full items-start">
      {/* Built-in columns */}
      {BUILT_IN.map(col => {
        const colTasks = getBuiltInTasks(col.status);
        return (
          <div
            key={col.status}
            className={`flex-shrink-0 w-72 ${col.bg} rounded-2xl border border-gray-200/60`}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              const taskId = e.dataTransfer.getData('taskId');
              if (taskId) moveToBuiltIn(taskId, col.status);
            }}
          >
            <div className="px-4 py-3.5 flex items-center gap-2.5">
              <div className={`w-2.5 h-2.5 rounded-full ${col.accent}`} />
              <span className="text-sm font-semibold text-gray-700">{col.label}</span>
              <span className={`ml-auto text-xs font-semibold rounded-full px-2 py-0.5 ${col.badge}`}>
                {colTasks.length}
              </span>
            </div>
            <div className="px-3 pb-3 space-y-2.5 min-h-24">
              {colTasks.map(task => <TaskCard key={task.id} task={task} />)}
              {colTasks.length === 0 && (
                <div className="flex items-center justify-center h-16 text-xs text-gray-300 border-2 border-dashed border-gray-200 rounded-xl">
                  Drop cards here
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Custom columns */}
      {customColumns.map(col => {
        const colTasks = getCustomColTasks(col.id);
        return (
          <div
            key={col.id}
            className="flex-shrink-0 w-72 rounded-2xl border border-gray-200/60 bg-white/60"
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              const taskId = e.dataTransfer.getData('taskId');
              if (taskId) moveToCustom(taskId, col.id);
            }}
          >
            <div className="px-4 py-3.5 flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: col.color }} />
              <span className="text-sm font-semibold text-gray-700">{col.name}</span>
              <span
                className="ml-auto text-xs font-semibold rounded-full px-2 py-0.5"
                style={{ backgroundColor: `${col.color}20`, color: col.color }}
              >
                {colTasks.length}
              </span>
              {canEdit && (
                <button
                  onClick={() => deleteColumn(col.id)}
                  className="p-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                  title="Delete column"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="px-3 pb-3 space-y-2.5 min-h-24">
              {colTasks.map(task => <TaskCard key={task.id} task={task} />)}
              {colTasks.length === 0 && (
                <div className="flex items-center justify-center h-16 text-xs text-gray-300 border-2 border-dashed border-gray-200 rounded-xl">
                  Drop cards here
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Add column */}
      {canEdit && filterProjectId && (
        <div className="flex-shrink-0 w-72">
          {addingColumn ? (
            <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-700">New Column</p>
              <input
                autoFocus
                value={newColName}
                onChange={e => setNewColName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addColumn(); if (e.key === 'Escape') setAddingColumn(false); }}
                placeholder="Column name..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40"
              />
              <div>
                <p className="text-xs text-gray-500 mb-2">Color</p>
                <div className="flex gap-1.5 flex-wrap">
                  {COLUMN_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setNewColColor(c)}
                      className={`w-6 h-6 rounded-full transition-all ${newColColor === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-110'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={addColumn}
                  disabled={!newColName.trim()}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  <Check className="w-3.5 h-3.5" /> Create
                </button>
                <button
                  onClick={() => { setAddingColumn(false); setNewColName(''); }}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingColumn(true)}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50/40 transition-all text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Add Column
            </button>
          )}
        </div>
      )}
    </div>
  );
}