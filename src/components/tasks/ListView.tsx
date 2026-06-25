import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, MessageSquare, Pencil } from 'lucide-react';
import { Task, Project, TaskStatus, Profile } from '../../types';
import TaskStatusBadge from './TaskStatusBadge';
import AddTaskRow from './AddTaskRow';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Props {
  projects: Project[];
  tasks: Task[];
  onRefresh: () => void;
  onSelectTask: (task: Task) => void;
  selectedTaskId?: string;
  filterProjectId?: string;
  canEditTaskForProject: (projectId: string) => boolean;
  assigneeOptionsByProjectId: Record<string, Profile[]>;
  canManageAssigneeForProject: (projectId: string) => boolean;
}

type FieldType = 'text' | 'status' | 'datetime' | 'number' | 'assignee';

interface EditingCell {
  taskId: string;
  field: string;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDateTime(d: string | null | undefined) {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '';
  const h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = (h % 12 || 12).toString();
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}, ${hour}:${m} ${ampm}`;
}

const pad = (n: number) => n.toString().padStart(2, '0');

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toISO(local: string): string | null {
  if (!local) return null;
  // datetime-local strings (YYYY-MM-DDTHH:mm) are treated as local time by the browser
  const d = new Date(local);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function calcHours(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null;
  const diff = new Date(end).getTime() - new Date(start).getTime();
  if (diff <= 0) return null;
  return Math.round((diff / 3600000) * 10) / 10;
}

// ─── Inline editable cell ────────────────────────────────────────────────────
interface CellProps {
  taskId: string;
  field: string;
  fieldType: FieldType;
  value: string | number | null | undefined;
  isEditing: boolean;
  canEdit: boolean;
  selectOptions?: { value: string; label: string }[];
  onStartEdit: (taskId: string, field: string, current: string) => void;
  onSave: (taskId: string, field: string, fieldType: FieldType, value: string) => Promise<void>;
  onCancel: () => void;
  editValue: string;
  setEditValue: (v: string) => void;
  displayClassName?: string;
}

function EditableCell({
  taskId, field, fieldType, value, isEditing, canEdit,
  selectOptions = [],
  onStartEdit, onSave, onCancel, editValue, setEditValue, displayClassName = ''
}: CellProps) {
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (isEditing) {
      setTimeout(() => (inputRef.current as HTMLElement)?.focus(), 10);
    }
  }, [isEditing]);

  function getDisplayValue() {
    if (fieldType === 'datetime') return formatDateTime(value as string) || '—';
    if (fieldType === 'number') return value ? `${value}h` : '—';
    if (fieldType === 'status') return <TaskStatusBadge status={value as TaskStatus} />;
    if (fieldType === 'assignee') {
      return selectOptions.find(option => option.value === String(value ?? ''))?.label || 'Unassigned';
    }
    return (value as string) || '—';
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') onSave(taskId, field, fieldType, editValue);
    if (e.key === 'Escape') onCancel();
  }

  if (isEditing && canEdit) {
    const baseInput = 'text-xs border border-blue-400 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400/40 w-full bg-white shadow-sm';
    if (fieldType === 'status') {
      return (
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => onSave(taskId, field, fieldType, editValue)}
          onKeyDown={handleKeyDown}
          className={baseInput}
        >
          <option value="todo">To Do</option>
          <option value="doing">Doing</option>
          <option value="done">Done</option>
          <option value="hold">Hold</option>
        </select>
      );
    }
    if (fieldType === 'assignee') {
      return (
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => onSave(taskId, field, fieldType, editValue)}
          onKeyDown={handleKeyDown}
          className={baseInput}
        >
          <option value="">Unassigned</option>
          {selectOptions.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      );
    }
    if (fieldType === 'datetime') {
      return (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="datetime-local"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => onSave(taskId, field, fieldType, editValue)}
          onKeyDown={handleKeyDown}
          className={baseInput}
        />
      );
    }
    if (fieldType === 'number') {
      return (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="number"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => onSave(taskId, field, fieldType, editValue)}
          onKeyDown={handleKeyDown}
          min="0"
          step="0.5"
          className={baseInput}
        />
      );
    }
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        value={editValue}
        onChange={e => setEditValue(e.target.value)}
        onBlur={() => onSave(taskId, field, fieldType, editValue)}
        onKeyDown={handleKeyDown}
        className={baseInput}
      />
    );
  }

  return (
    <div
      onClick={e => {
        if (!canEdit) return;
        e.stopPropagation();
        const raw = fieldType === 'datetime' ? toDatetimeLocal(value as string) : String(value ?? '');
        onStartEdit(taskId, field, raw);
      }}
      className={`group/cell flex items-center gap-1.5 min-h-[28px] rounded-md px-1.5 -mx-1.5 ${canEdit ? 'cursor-text hover:bg-blue-50/60 hover:ring-1 hover:ring-blue-200/70' : ''} transition-all ${displayClassName}`}
    >
      <span className="truncate">{getDisplayValue()}</span>
      {canEdit && (
        <Pencil className="w-2.5 h-2.5 text-blue-400 opacity-0 group-hover/cell:opacity-100 transition-opacity flex-shrink-0" />
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ListView({
  projects, tasks, onRefresh, onSelectTask, selectedTaskId, filterProjectId, canEditTaskForProject,
  assigneeOptionsByProjectId, canManageAssigneeForProject,
}: Props) {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [addingTaskFor, setAddingTaskFor] = useState<string | null>(null);
  const [addingSubtaskFor, setAddingSubtaskFor] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState('');

  const visibleProjects = filterProjectId
    ? projects.filter(p => p.id === filterProjectId)
    : projects;

  async function addTask(projectId: string, title: string) {
    await supabase.from('tasks').insert({ project_id: projectId, title, status: 'todo', created_by: user!.id });
    setAddingTaskFor(null);
    onRefresh();
  }

  async function addSubtask(projectId: string, parentId: string, title: string) {
    await supabase.from('tasks').insert({ project_id: projectId, parent_task_id: parentId, title, status: 'todo', created_by: user!.id });
    setAddingSubtaskFor(null);
    onRefresh();
  }

  async function deleteTask(id: string) {
    if (!confirm('Delete this task?')) return;
    await supabase.from('tasks').update({ is_deleted: true, is_active: false, updated_at: new Date().toISOString() }).eq('id', id);
    onRefresh();
  }

  function startEdit(taskId: string, field: string, current: string) {
    setEditingCell({ taskId, field });
    setEditValue(current);
  }

  function cancelEdit() {
    setEditingCell(null);
    setEditValue('');
  }

  const saveCell = useCallback(async (taskId: string, field: string, fieldType: FieldType, value: string) => {
    setEditingCell(null);
    setEditValue('');

    const task = tasks.find(t => t.id === taskId);
    const oldVal = task ? getTaskValue(task, field) : undefined;

    let stored: string | number | null = value || null;
    if (fieldType === 'datetime') stored = toISO(value);
    if (fieldType === 'number') stored = value ? parseFloat(value) : null;

    const normalizedOldValue = (() => {
      if (oldVal === null || oldVal === undefined) return '';
      if (fieldType === 'datetime') return toDatetimeLocal(String(oldVal));
      if (fieldType === 'number') return String(typeof oldVal === 'number' ? oldVal : parseFloat(String(oldVal)));
      return String(oldVal);
    })();

    const normalizedNewValue = (() => {
      if (stored === null || stored === undefined) return '';
      if (fieldType === 'datetime') return toDatetimeLocal(stored as string | null | undefined);
      if (fieldType === 'number') return String(stored);
      return String(stored);
    })();

    if (normalizedOldValue === normalizedNewValue) return;

    const updateData: Record<string, string | number | null> = {
      [field]: stored,
      updated_at: new Date().toISOString(),
    };

    // Auto-recalculate hours from the same date group that was edited
    if (['planned_start', 'planned_end', 'actual_start', 'actual_end'].includes(field)) {
      if (task) {
        const isActual = field === 'actual_start' || field === 'actual_end';
        let hours: number | null = null;
        if (isActual) {
          const aStart = field === 'actual_start' ? (stored as string) : task.actual_start;
          const aEnd = field === 'actual_end' ? (stored as string) : task.actual_end;
          hours = calcHours(aStart, aEnd);
        } else {
          const pStart = field === 'planned_start' ? (stored as string) : task.planned_start;
          const pEnd = field === 'planned_end' ? (stored as string) : task.planned_end;
          hours = calcHours(pStart, pEnd);
        }
        if (hours !== null) updateData.estimated_hours = hours;
      }
    }

    await supabase.from('tasks').update(updateData).eq('id', taskId);

    if (user) {
      await supabase.from('task_history').insert({
        task_id: taskId,
        user_id: user.id,
        field_name: field,
        old_value: oldVal !== null && oldVal !== undefined ? String(oldVal) : null,
        new_value: value || null,
      });
    }

    onRefresh();
  }, [tasks, onRefresh, user]);

  function getTaskValue(task: Task, field: string): string | number | null | undefined {
    if (field === 'title') return task.title;
    if (field === 'status') return task.status;
    if (field === 'assigned_to') return task.assigned_to;
    if (field === 'planned_start') return task.planned_start;
    if (field === 'planned_end') return task.planned_end;
    if (field === 'actual_start') return task.actual_start;
    if (field === 'actual_end') return task.actual_end;
    if (field === 'estimated_hours') return task.estimated_hours;
    return undefined;
  }

  const cellProps = (task: Task, field: string, fieldType: FieldType) => ({
    taskId: task.id,
    field,
    fieldType,
    value: getTaskValue(task, field),
    isEditing: editingCell?.taskId === task.id && editingCell?.field === field,
    canEdit: fieldType === 'assignee' ? canManageAssigneeForProject(task.project_id) : canEditTaskForProject(task.project_id),
    onStartEdit: startEdit,
    onSave: saveCell,
    onCancel: cancelEdit,
    editValue,
    setEditValue,
  });

  const mainTasks = tasks.filter(t => !t.parent_task_id);
  const subtasks = tasks.filter(t => !!t.parent_task_id);

  const thCls = 'text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 py-3';
  const tdCls = 'px-3 py-2.5 text-xs text-gray-600';

  function renderTaskRow(task: Task, depth: number = 0): JSX.Element {
    const isTaskCollapsed = collapsed[task.id];
    const taskSubtasks = subtasks.filter(s => s.parent_task_id === task.id);
    const isSelected = selectedTaskId === task.id;

    return (
      <>
        <tr
          key={task.id}
          className={`border-b border-gray-100/80 transition-colors group/row ${isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50/80'}`}
        >
          {/* Expand / indent */}
          <td className="pl-4 pr-1 py-2.5 w-8">
            {depth === 0 ? (
              <button
                onClick={() => setCollapsed(c => ({ ...c, [task.id]: !c[task.id] }))}
                className="p-0.5 text-gray-300 hover:text-gray-500 transition-colors"
              >
                {isTaskCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <div className="flex items-center pl-3">
                <div className="w-0.5 h-4 bg-gray-200 mr-1.5" />
              </div>
            )}
          </td>

          {/* Title */}
          <td className="px-3 py-2.5">
            <div className="flex items-center gap-2">
              {depth === 0 ? (
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-slate-300" />
              ) : (
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-blue-200" />
              )}
              <EditableCell
                {...cellProps(task, 'title', 'text')}
                displayClassName={`text-sm font-${depth === 0 ? 'medium' : 'normal'} text-gray-800 flex-1`}
              />
              <button
                onClick={e => { e.stopPropagation(); onSelectTask(task); }}
                className="opacity-0 group-hover/row:opacity-100 p-1 rounded-md text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-all flex-shrink-0"
                title="Open details"
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </button>
            </div>
          </td>

          {/* Status */}
          <td className={tdCls + ' w-32'}>
            <EditableCell {...cellProps(task, 'status', 'status')} />
          </td>

          {/* Assignee */}
          <td className={tdCls + ' w-44'}>
            <EditableCell
              {...cellProps(task, 'assigned_to', 'assignee')}
              selectOptions={(assigneeOptionsByProjectId[task.project_id] ?? []).map(person => ({
                value: person.id,
                label: person.full_name,
              }))}
              displayClassName="text-gray-700"
            />
          </td>

          {/* Planned Start */}
          <td className={tdCls + ' w-44'}>
            <EditableCell {...cellProps(task, 'planned_start', 'datetime')} displayClassName="text-gray-600" />
          </td>

          {/* Planned End */}
          <td className={tdCls + ' w-44'}>
            <EditableCell {...cellProps(task, 'planned_end', 'datetime')} displayClassName="text-gray-600" />
          </td>

          {/* Actual Start */}
          <td className={tdCls + ' w-44'}>
            <EditableCell {...cellProps(task, 'actual_start', 'datetime')} displayClassName="text-gray-500" />
          </td>

          {/* Actual End */}
          <td className={tdCls + ' w-44'}>
            <EditableCell {...cellProps(task, 'actual_end', 'datetime')} displayClassName="text-gray-500" />
          </td>

          {/* Hours */}
          <td className={tdCls + ' w-20'}>
            <EditableCell {...cellProps(task, 'estimated_hours', 'number')} displayClassName="font-medium text-gray-700" />
          </td>

          {/* Delete */}
          <td className="pr-3 py-2.5 w-10">
            {canEditTaskForProject(task.project_id) && (
              <button
                onClick={e => { e.stopPropagation(); deleteTask(task.id); }}
                className="opacity-0 group-hover/row:opacity-100 p-1.5 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </td>
        </tr>

        {/* Subtasks */}
        {depth === 0 && !isTaskCollapsed && (
          <>
            {taskSubtasks.map((sub): JSX.Element => renderTaskRow(sub, 1))}

            {/* Add subtask row */}
            {canEditTaskForProject(task.project_id) && (
              <tr key={`${task.id}-add-sub`} className="border-b border-gray-100/60">
                <td colSpan={10} className="pl-10 pr-4 py-1.5 bg-slate-50/40">
                  {addingSubtaskFor === task.id ? (
                    <AddTaskRow
                      label="New subtask title..."
                      onSave={async (title: string) => {
                        const project = projects.find(p => p.id === task.project_id);
                        if (project) await addSubtask(project.id, task.id, title);
                      }}
                      onCancel={() => setAddingSubtaskFor(null)}
                    />
                  ) : (
                    <button
                      onClick={() => setAddingSubtaskFor(task.id)}
                      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-600 transition-colors py-0.5"
                    >
                      <Plus className="w-3 h-3" />
                      Add Subtask
                    </button>
                  )}
                </td>
              </tr>
            )}
          </>
        )}
      </>
    );
  }

  return (
    <div className="space-y-5">
      {visibleProjects.map(project => {
        const projectMainTasks = mainTasks.filter(t => t.project_id === project.id);
        const projectSubtaskCount = subtasks.filter(s => projectMainTasks.some(m => m.id === s.parent_task_id)).length;
        const isCollapsed = collapsed[project.id];

        return (
          <div key={project.id} className="bg-white border border-gray-200/80 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            {/* Project header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setCollapsed(c => ({ ...c, [project.id]: !c[project.id] }))}
                  className="p-0.5 rounded text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {isCollapsed
                    ? <ChevronRight className="w-4 h-4" />
                    : <ChevronDown className="w-4 h-4" />}
                </button>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-sm" style={{ backgroundColor: project.color }} />
                  <span className="font-semibold text-sm text-gray-800">{project.name}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
                  {projectMainTasks.length} task{projectMainTasks.length !== 1 ? 's' : ''} · {projectSubtaskCount} subtask{projectSubtaskCount !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {!isCollapsed && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="border-b border-gray-100/80 bg-gray-50/40">
                      <th className="w-8"></th>
                      <th className={thCls}>Task</th>
                      <th className={thCls + ' w-32'}>Status</th>
                      <th className={thCls + ' w-44'}>Assignee</th>
                      <th className={thCls + ' w-44'}>Planned Start</th>
                      <th className={thCls + ' w-44'}>Planned End</th>
                      <th className={thCls + ' w-44'}>Actual Start</th>
                      <th className={thCls + ' w-44'}>Actual End</th>
                      <th className={thCls + ' w-20'}>Hours</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectMainTasks.length === 0 && (
                      <tr>
                        <td colSpan={10} className="px-5 py-8 text-center text-sm text-gray-400">
                          No tasks yet. {canEditTaskForProject(project.id) && 'Click "Add Task" below to get started.'}
                        </td>
                      </tr>
                    )}
                    {projectMainTasks.map(task => renderTaskRow(task, 0))}

                    {/* Add task */}
                    {canEditTaskForProject(project.id) && (
                      <tr>
                        <td colSpan={10} className="px-5 py-2.5">
                          {addingTaskFor === project.id ? (
                            <AddTaskRow
                              label="New task title..."
                              onSave={title => addTask(project.id, title)}
                              onCancel={() => setAddingTaskFor(null)}
                            />
                          ) : (
                            <button
                              onClick={() => setAddingTaskFor(project.id)}
                              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-600 font-medium transition-colors py-0.5"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Add Task
                            </button>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {visibleProjects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <Plus className="w-6 h-6 text-gray-300" />
          </div>
          <p className="text-sm font-medium">No projects to show</p>
          <p className="text-xs mt-1">Create a project first to manage tasks.</p>
        </div>
      )}
    </div>
  );
}
