import { useEffect, useState, useRef } from 'react';
import {
  X, Send, Clock, User, Calendar, Hash,
  CheckSquare, Square, AlertCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Task, TaskMessage, TaskHistory, Profile, TaskStatus } from '../../types';
import TaskStatusBadge from './TaskStatusBadge';

interface Props {
  task: Task;
  onClose: () => void;
  onUpdate: () => void;
  canEdit: boolean;
  canManageAssignee: boolean;
  assigneeOptions: Profile[];
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDateTime(d: string | null | undefined) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  const h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}, ${(h % 12 || 12)}:${m} ${ampm}`;
}

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toISO(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function calcHours(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null;
  const diff = new Date(end).getTime() - new Date(start).getTime();
  if (diff <= 0) return null;
  return Math.round((diff / 3600000) * 10) / 10;
}

function normalizeComparableValue(field: string, value: string | null | undefined): string | number | null {
  if (!value) return null;
  if (['planned_start', 'planned_end', 'actual_start', 'actual_end'].includes(field)) {
    return toDatetimeLocal(value) ? toDatetimeLocal(value) : null;
  }
  if (field === 'estimated_hours') {
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return value;
}

const STATUS_DOT: Record<TaskStatus, string> = {
  todo:  'bg-slate-400',
  doing: 'bg-amber-400',
  done:  'bg-emerald-400',
  hold:  'bg-rose-400',
};

export default function TaskDetailModal({ task, onClose, onUpdate, canEdit, canManageAssignee, assigneeOptions }: Props) {
  const { user } = useAuth();
  const [tab, setTab] = useState<'details' | 'messages' | 'history'>('details');
  const [liveTask, setLiveTask] = useState<Task>(task);
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [messages, setMessages] = useState<TaskMessage[]>([]);
  const [history, setHistory] = useState<TaskHistory[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [fieldValue, setFieldValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  async function loadAll() {
    const [{ data: taskData }, { data: msgs }, { data: hist }, { data: subs }] = await Promise.all([
      supabase.from('tasks').select('*').eq('id', task.id).maybeSingle(),
      supabase.from('task_messages').select('*').eq('task_id', task.id).eq('is_deleted', false).eq('status', true).order('created_at'),
      supabase.from('task_history').select('*').eq('task_id', task.id).order('created_at', { ascending: false }),
      supabase.from('tasks').select('*').eq('parent_task_id', task.id).eq('is_deleted', false).eq('is_active', true).order('created_at'),
    ]);

    if (taskData) setLiveTask(taskData as Task);
    const allMsgs = msgs ?? [];
    const allHist = hist ?? [];
    setMessages(allMsgs);
    setHistory(allHist);
    setSubtasks(subs ?? []);

    const userIds = new Set<string>();
    if (taskData) {
      const taskRow = taskData as Task;
      if (taskRow.assigned_to) userIds.add(taskRow.assigned_to);
    }
    allMsgs.forEach(m => m.user_id && userIds.add(m.user_id));
    allHist.forEach(h => h.user_id && userIds.add(h.user_id));
    subs?.forEach(sub => {
      if (sub.assigned_to) userIds.add(sub.assigned_to);
    });
    if (userIds.size > 0) {
      const { data: profs } = await supabase.from('profiles').select('*').in('id', [...userIds]);
      const map: Record<string, Profile> = {};
      (profs ?? []).forEach(p => { map[p.id] = p; });
      setProfiles(map);
    }
  }

  useEffect(() => { loadAll(); }, [task.id]);

  useEffect(() => {
    if (tab === 'messages') messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, tab]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function sendMessage() {
    if (!newMessage.trim()) return;
    setSending(true);
    await supabase.from('task_messages').insert({ task_id: task.id, user_id: user!.id, body: newMessage.trim() });
    setNewMessage('');
    setSending(false);
    loadAll();
  }

  async function saveField(field: string, value: string) {
    const oldVal = (liveTask as unknown as Record<string, unknown>)[field];
    const nextValue = ['planned_start', 'planned_end', 'actual_start', 'actual_end'].includes(field)
      ? toISO(value)
      : field === 'estimated_hours'
        ? (value ? parseFloat(value) : null)
        : (value || null);
    const oldComparable = normalizeComparableValue(field, oldVal != null ? String(oldVal) : null);
    const nextComparable = normalizeComparableValue(field, nextValue != null ? String(nextValue) : null);

    if (oldComparable === nextComparable) {
      setEditingField(null);
      return;
    }

    const updateData: Record<string, unknown> = { [field]: nextValue, updated_at: new Date().toISOString() };

    if (['planned_start', 'planned_end', 'actual_start', 'actual_end'].includes(field)) {
      const isActual = field === 'actual_start' || field === 'actual_end';
      const hours = isActual
        ? calcHours(
            field === 'actual_start' ? value : liveTask.actual_start,
            field === 'actual_end' ? value : liveTask.actual_end,
          )
        : calcHours(
            field === 'planned_start' ? value : liveTask.planned_start,
            field === 'planned_end' ? value : liveTask.planned_end,
          );
      if (hours !== null) updateData.estimated_hours = hours;
    }

    await supabase.from('tasks').update(updateData).eq('id', task.id);
    await supabase.from('task_history').insert({
      task_id: task.id,
      user_id: user!.id,
      field_name: field,
      old_value: oldVal != null ? String(oldVal) : null,
      new_value: nextValue != null ? String(nextValue) : null,
    });
    setEditingField(null);
    loadAll();
    onUpdate();
  }

  async function toggleSubtaskStatus(sub: Task) {
    if (!canEdit) return;
    const newStatus: TaskStatus = sub.status === 'done' ? 'todo' : 'done';
    await supabase.from('tasks').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', sub.id);
    loadAll();
    onUpdate();
  }

  const autoHours =
    calcHours(liveTask.actual_start, liveTask.actual_end) ??
    calcHours(liveTask.planned_start, liveTask.planned_end);

  const doneSubtasks = subtasks.filter(s => s.status === 'done').length;
  const taskRecord = liveTask as unknown as Record<string, unknown>;

  const infoRows: { label: string; key: string; type: 'status' | 'datetime' | 'number' | 'text' | 'textarea' }[] = [
    { label: 'Title',         key: 'title',           type: 'text' },
    { label: 'Description',    key: 'description',     type: 'textarea' },
    { label: 'Status',        key: 'status',          type: 'status' },
    { label: 'Assigned To',   key: 'assigned_to',     type: 'text' },
    { label: 'Planned Start', key: 'planned_start',   type: 'datetime' },
    { label: 'Planned End',   key: 'planned_end',     type: 'datetime' },
    { label: 'Actual Start',  key: 'actual_start',    type: 'datetime' },
    { label: 'Actual End',    key: 'actual_end',      type: 'datetime' },
    { label: 'Est. Hours',    key: 'estimated_hours', type: 'number' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Hash className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-xs text-gray-400 font-medium">Task Details</span>
              {!canEdit && (
                <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  <AlertCircle className="w-3 h-3" /> View only
                </span>
              )}
            </div>
            <h2 className="text-base font-semibold text-gray-900 leading-snug">{liveTask.title}</h2>
            {liveTask.description && (
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">{liveTask.description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 flex-shrink-0 px-6">
          {(['details', 'messages', 'history'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative py-3 px-1 mr-6 text-xs font-semibold transition-colors capitalize ${
                tab === t
                  ? 'text-blue-600'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {t === 'messages' && messages.length > 0 && (
                <span className="absolute -top-0.5 -right-2 w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] flex items-center justify-center font-bold">
                  {messages.length > 9 ? '9+' : messages.length}
                </span>
              )}
              {t}
              {tab === t && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full" />
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* ── Details tab ── */}
          {tab === 'details' && (
            <div className="p-6 grid grid-cols-2 gap-6">
              {/* Left: fields */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Properties</h3>
                {infoRows.map(({ label, key, type }) => {
                  const val = taskRecord[key];
                  const isAssignee = key === 'assigned_to';
                  const isDescription = key === 'description';
                  const isEditing = editingField === key && (canEdit || (isAssignee && canManageAssignee));
                  const assigneeId = String(val ?? '');
                  const assigneeLabel =
                    assigneeOptions.find(option => option.id === assigneeId)?.full_name ||
                    profiles[assigneeId]?.full_name ||
                    'Unassigned';
                  const hasAssigneeOption = assigneeOptions.some(option => option.id === assigneeId);

                  return (
                    <div key={key} className="flex items-center gap-3 min-h-[28px]">
                      <span className="text-xs text-gray-500 w-28 flex-shrink-0">{label}</span>
                      {isEditing ? (
                        <div className="flex items-center gap-1.5 flex-1">
                          {isAssignee ? (
                            <select
                              autoFocus
                              value={fieldValue}
                              onChange={e => setFieldValue(e.target.value)}
                              onBlur={() => saveField(key, fieldValue)}
                              className="text-xs border border-blue-300 rounded-lg px-2 py-1.5 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                            >
                              <option value="">Unassigned</option>
                              {assigneeId && !hasAssigneeOption && (
                                <option value={assigneeId} disabled>
                                  {profiles[assigneeId]?.full_name ?? 'Current assignee'}
                                </option>
                              )}
                              {assigneeOptions.map(option => (
                                <option key={option.id} value={option.id}>{option.full_name}</option>
                              ))}
                            </select>
                          ) : isDescription ? (
                            <textarea
                              autoFocus
                              value={fieldValue}
                              onChange={e => setFieldValue(e.target.value)}
                              onBlur={() => saveField(key, fieldValue)}
                              rows={4}
                              className="text-xs border border-blue-300 rounded-lg px-2 py-1.5 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-400/40 resize-y"
                            />
                          ) : type === 'status' ? (
                            <select
                              autoFocus
                              value={fieldValue}
                              onChange={e => setFieldValue(e.target.value)}
                              onBlur={() => saveField(key, fieldValue)}
                              className="text-xs border border-blue-300 rounded-lg px-2 py-1.5 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                            >
                              <option value="todo">To Do</option>
                              <option value="doing">Doing</option>
                              <option value="done">Done</option>
                              <option value="hold">Hold</option>
                            </select>
                          ) : type === 'datetime' ? (
                            <input
                              autoFocus
                              type="datetime-local"
                              value={fieldValue}
                              onChange={e => setFieldValue(e.target.value)}
                              onBlur={() => saveField(key, fieldValue)}
                              className="text-xs border border-blue-300 rounded-lg px-2 py-1.5 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                            />
                          ) : key === 'estimated_hours' ? (
                            <input
                              autoFocus
                              type="number"
                              value={fieldValue}
                              onChange={e => setFieldValue(e.target.value)}
                              onBlur={() => saveField(key, fieldValue)}
                              step="0.5"
                              min="0"
                              className="text-xs border border-blue-300 rounded-lg px-2 py-1.5 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                            />
                          ) : (
                            <input
                              autoFocus
                              type="text"
                              value={fieldValue}
                              onChange={e => setFieldValue(e.target.value)}
                              onBlur={() => saveField(key, fieldValue)}
                              className="text-xs border border-blue-300 rounded-lg px-2 py-1.5 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                            />
                          )}
                          <button
                            onMouseDown={e => { e.preventDefault(); saveField(key, fieldValue); }}
                            className="text-xs text-blue-600 font-semibold hover:underline"
                          >
                            Save
                          </button>
                          <button
                          onMouseDown={e => { e.preventDefault(); setEditingField(null); }}
                            className="text-xs text-gray-400 hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            if (!(canEdit || (key === 'assigned_to' && canManageAssignee))) return;
                            setEditingField(key);
                            const raw = isAssignee || isDescription
                              ? String(val ?? '')
                              : type === 'datetime'
                                ? toDatetimeLocal(val as string)
                                : String(val ?? '');
                            setFieldValue(raw);
                          }}
                          className={`flex-1 text-left transition-colors rounded-md px-1 -mx-1 ${
                            canEdit || (isAssignee && canManageAssignee) ? 'hover:bg-blue-50 cursor-text' : 'cursor-default'
                          }`}
                        >
                          {isAssignee ? (
                            <span className="text-xs text-gray-700">{assigneeLabel}</span>
                          ) : isDescription ? (
                            <span className="text-xs text-gray-700 whitespace-pre-wrap break-words">{(val as string) || '—'}</span>
                          ) : type === 'status' ? (
                            <TaskStatusBadge status={val as TaskStatus} />
                          ) : type === 'datetime' ? (
                            <span className="text-xs text-gray-700">{formatDateTime(val as string)}</span>
                          ) : key === 'estimated_hours' ? (
                            <span className="text-xs text-gray-700">{val != null ? `${val}h` : '—'}</span>
                          ) : (
                            <span className="text-xs text-gray-700">{val != null ? String(val) : '—'}</span>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}

                {autoHours !== null && (
                  <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded-lg mt-2">
                    <Clock className="w-3 h-3" />
                    Auto-calculated: {autoHours}h from dates
                  </div>
                )}
              </div>

              {/* Right: subtasks */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Subtasks
                  </h3>
                  {subtasks.length > 0 && (
                    <span className="text-xs text-gray-500 font-medium">
                      {doneSubtasks}/{subtasks.length} done
                    </span>
                  )}
                </div>

                {subtasks.length > 0 && (
                  <div className="w-full bg-gray-100 rounded-full h-1.5 mb-4">
                    <div
                      className="bg-emerald-400 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${subtasks.length ? (doneSubtasks / subtasks.length) * 100 : 0}%` }}
                    />
                  </div>
                )}

                {subtasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-gray-300">
                    <CheckSquare className="w-8 h-8 mb-2" />
                    <p className="text-xs">No subtasks</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                {subtasks.map(sub => {
                          const subAssignee =
                            (sub.assigned_to && assigneeOptions.find(option => option.id === sub.assigned_to)?.full_name) ||
                            (sub.assigned_to && profiles[sub.assigned_to]?.full_name) ||
                            'Unassigned';
                          return (
                          <div
                            key={sub.id}
                            className="flex items-start gap-2.5 p-2.5 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors group"
                          >
                        <button
                          onClick={() => toggleSubtaskStatus(sub)}
                          disabled={!canEdit}
                          className={`mt-0.5 flex-shrink-0 transition-colors ${
                            canEdit ? 'cursor-pointer' : 'cursor-default'
                          }`}
                        >
                          {sub.status === 'done' ? (
                            <CheckSquare className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors" />
                          )}
                        </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm leading-snug ${sub.status === 'done' ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                              {sub.title}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[sub.status]}`} />
                              <span className="text-xs text-gray-400 capitalize">{sub.status}</span>
                              <span className="text-gray-200">·</span>
                              {canManageAssignee ? (
                                <select
                                  value={sub.assigned_to ?? ''}
                                  onChange={async e => {
                                    await supabase.from('tasks').update({ assigned_to: e.target.value || null, updated_at: new Date().toISOString() }).eq('id', sub.id);
                                    await supabase.from('task_history').insert({
                                      task_id: sub.id,
                                      user_id: user!.id,
                                      field_name: 'assigned_to',
                                      old_value: sub.assigned_to ?? null,
                                      new_value: e.target.value || null,
                                    });
                                    onUpdate();
                                    loadAll();
                                  }}
                                  className="text-[11px] border border-gray-200 rounded-md px-1.5 py-0.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                  <option value="">Unassigned</option>
                                  {assigneeOptions.map(option => (
                                    <option key={option.id} value={option.id}>{option.full_name}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-xs text-gray-400">{subAssignee}</span>
                              )}
                              {sub.planned_end && (
                                <>
                                  <span className="text-gray-200">·</span>
                                <span className="text-xs text-gray-400 flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {formatDateTime(sub.planned_end)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {sub.estimated_hours && (
                          <span className="text-xs text-gray-400 flex items-center gap-1 flex-shrink-0">
                            <Clock className="w-3 h-3" />{sub.estimated_hours}h
                          </span>
                        )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Messages tab ── */}
          {tab === 'messages' && (
            <div className="p-5 space-y-3">
              {messages.length === 0 && (
                <p className="text-center text-xs text-gray-400 py-8">No messages yet. Start the conversation!</p>
              )}
              {messages.map(msg => {
                const isMe = msg.user_id === user?.id;
                const author = profiles[msg.user_id];
                const initials = author?.full_name
                  ? author.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                  : '?';
                return (
                  <div key={msg.id} className={`flex gap-2.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                    <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 text-xs font-bold text-slate-500">
                      {initials}
                    </div>
                    <div className={`max-w-[75%] flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
                      <span className="text-xs text-gray-400">
                        {author?.full_name ?? 'Unknown'} · {timeAgo(msg.created_at)}
                      </span>
                      <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        isMe
                          ? 'bg-blue-600 text-white rounded-tr-sm'
                          : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                      }`}>
                        {msg.body}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* ── History tab ── */}
          {tab === 'history' && (
            <div className="p-5 space-y-2">
              {history.length === 0 && (
                <p className="text-center text-xs text-gray-400 py-8">No history yet.</p>
              )}
              {history.map(h => {
                const actor = h.user_id ? profiles[h.user_id] : null;
                return (
                  <div key={h.id} className="flex gap-3 text-xs p-3 rounded-xl hover:bg-gray-50 transition-colors">
                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-gray-700">{actor?.full_name ?? 'System'}</span>
                        <span className="text-gray-400">changed</span>
                        <span className="font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                          {h.field_name.replace(/_/g, ' ')}
                        </span>
                        {h.old_value && (
                          <><span className="text-gray-400">from</span>
                          <span className="line-through text-gray-400">{h.old_value}</span></>
                        )}
                        {h.new_value && (
                          <><span className="text-gray-400">to</span>
                          <span className="font-semibold text-gray-700">{h.new_value}</span></>
                        )}
                      </div>
                      <p className="text-gray-400 mt-0.5">{timeAgo(h.created_at)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Message input (messages tab only) */}
        {tab === 'messages' && (
          <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0 bg-gray-50/50">
            <div className="flex gap-2">
              <input
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Write a message..."
                className="flex-1 text-sm px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 bg-white"
              />
              <button
                onClick={sendMessage}
                disabled={sending || !newMessage.trim()}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl transition-colors flex items-center gap-1.5 text-sm font-semibold"
              >
                <Send className="w-3.5 h-3.5" />
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
