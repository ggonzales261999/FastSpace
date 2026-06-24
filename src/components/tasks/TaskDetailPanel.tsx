import { useEffect, useState, useRef } from 'react';
import { X, Send, Clock, User, Calendar, Hash } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Task, TaskMessage, TaskHistory, Profile } from '../../types';
import TaskStatusBadge from './TaskStatusBadge';

interface Props {
  task: Task;
  onClose: () => void;
  onUpdate: () => void;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDateTime(d: string | null | undefined) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  const h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = (h % 12 || 12).toString();
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}, ${hour}:${m} ${ampm}`;
}

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

function calculateHours(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return null;
  const diffMs = endDate.getTime() - startDate.getTime();
  if (diffMs <= 0) return null;
  return Math.round((diffMs / 3600000) * 10) / 10;
}

export default function TaskDetailPanel({ task, onClose, onUpdate }: Props) {
  const { user } = useAuth();
  const [tab, setTab] = useState<'messages' | 'history'>('messages');
  const [messages, setMessages] = useState<TaskMessage[]>([]);
  const [history, setHistory] = useState<TaskHistory[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [fieldValue, setFieldValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  async function loadData() {
    const [{ data: msgs }, { data: hist }] = await Promise.all([
      supabase.from('task_messages').select('*').eq('task_id', task.id).order('created_at'),
      supabase.from('task_history').select('*').eq('task_id', task.id).order('created_at', { ascending: false }),
    ]);
    const allMsgs = msgs ?? [];
    const allHist = hist ?? [];
    setMessages(allMsgs);
    setHistory(allHist);

    const userIds = new Set<string>();
    allMsgs.forEach(m => m.user_id && userIds.add(m.user_id));
    allHist.forEach(h => h.user_id && userIds.add(h.user_id));
    if (userIds.size > 0) {
      const { data: profs } = await supabase.from('profiles').select('*').in('id', [...userIds]);
      const map: Record<string, Profile> = {};
      (profs ?? []).forEach(p => { map[p.id] = p; });
      setProfiles(map);
    }
  }

  useEffect(() => {
    loadData();
  }, [task.id]);

  useEffect(() => {
    if (tab === 'messages') messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, tab]);

  async function sendMessage() {
    if (!newMessage.trim()) return;
    setSending(true);
    await supabase.from('task_messages').insert({ task_id: task.id, user_id: user!.id, body: newMessage.trim() });
    setNewMessage('');
    setSending(false);
    loadData();
  }

  async function saveField(field: string, value: string) {
    const oldVal = (task as any)[field];
    const updateData: Record<string, any> = { [field]: value || null, updated_at: new Date().toISOString() };

    // Auto-calculate hours from matching date group (planned or actual)
    if (['planned_start', 'planned_end', 'actual_start', 'actual_end'].includes(field)) {
      const isActual = field === 'actual_start' || field === 'actual_end';
      let hours: number | null = null;
      if (isActual) {
        const aStart = (field === 'actual_start' ? value : task.actual_start) ?? undefined;
        const aEnd = (field === 'actual_end' ? value : task.actual_end) ?? undefined;
        hours = calculateHours(aStart, aEnd);
      } else {
        const pStart = (field === 'planned_start' ? value : task.planned_start) ?? undefined;
        const pEnd = (field === 'planned_end' ? value : task.planned_end) ?? undefined;
        hours = calculateHours(pStart, pEnd);
      }
      if (hours !== null) updateData.estimated_hours = hours;
    }

    await supabase.from('tasks').update(updateData).eq('id', task.id);
    await supabase.from('task_history').insert({
      task_id: task.id,
      user_id: user!.id,
      field_name: field,
      old_value: oldVal ? String(oldVal) : null,
      new_value: value || null,
    });
    setEditingField(null);
    loadData();
    onUpdate();
  }

  const infoRows = [
    { label: 'Status', key: 'status', type: 'status' as const },
    { label: 'Planned Start', key: 'planned_start', type: 'datetime' as const },
    { label: 'Planned End', key: 'planned_end', type: 'datetime' as const },
    { label: 'Actual Start', key: 'actual_start', type: 'datetime' as const },
    { label: 'Actual End', key: 'actual_end', type: 'datetime' as const },
    { label: 'Est. Hours', key: 'estimated_hours', type: 'number' as const },
  ];

  // Prefer actual hours when actual dates are set, otherwise show planned hours
  const autoHours =
    calculateHours(task.actual_start ?? undefined, task.actual_end ?? undefined) ??
    calculateHours(task.planned_start ?? undefined, task.planned_end ?? undefined);

  return (
    <div className="w-96 flex-shrink-0 border-l border-gray-200 bg-white flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 mb-0.5 flex items-center gap-1">
            <Hash className="w-3 h-3" /> Task Details
          </p>
          <h3 className="font-semibold text-gray-900 text-sm leading-snug">{task.title}</h3>
        </div>
        <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Info */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="space-y-2">
          {infoRows.map(({ label, key, type }) => {
            const val = (task as any)[key];
            return (
              <div key={key} className="flex items-center justify-between">
                <span className="text-xs text-gray-500 w-28 flex-shrink-0">{label}</span>
                {editingField === key ? (
                  <div className="flex items-center gap-1.5 flex-1">
                    {type === 'status' ? (
                      <select
                        value={fieldValue}
                        onChange={e => setFieldValue(e.target.value)}
                        className="text-xs border border-gray-200 rounded px-2 py-1 flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="todo">To Do</option>
                        <option value="doing">Doing</option>
                        <option value="done">Done</option>
                        <option value="hold">Hold</option>
                      </select>
                    ) : type === 'datetime' ? (
                      <input
                        type="datetime-local"
                        value={fieldValue}
                        onChange={e => setFieldValue(e.target.value)}
                        className="text-xs border border-gray-200 rounded px-2 py-1 flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    ) : (
                      <input
                        type="number"
                        value={fieldValue}
                        onChange={e => setFieldValue(e.target.value)}
                        step="0.5"
                        min="0"
                        className="text-xs border border-gray-200 rounded px-2 py-1 flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    )}
                    <button onClick={() => saveField(key, fieldValue)} className="text-xs text-blue-600 font-medium hover:underline">Save</button>
                    <button onClick={() => setEditingField(null)} className="text-xs text-gray-400 hover:underline">Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditingField(key); setFieldValue(type === 'datetime' ? toDatetimeLocal(val) : (val ?? '')); }}
                    className="text-xs flex-1 text-right hover:text-blue-600 transition-colors"
                  >
                    {type === 'status' ? (
                      <TaskStatusBadge status={val} />
                    ) : type === 'datetime' ? (
                      <span className="text-gray-700">{formatDateTime(val)}</span>
                    ) : (
                      <span className="text-gray-700">{val ?? '—'}</span>
                    )}
                  </button>
                )}
              </div>
            );
          })}
          {autoHours !== null && (
            <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded mt-2">
              <Clock className="w-3 h-3" />
              Auto: {autoHours} hours from planned dates
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100">
        {(['messages', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
              tab === t ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {t === 'messages' ? (
              <span className="flex items-center justify-center gap-1.5"><Send className="w-3 h-3" />Messages</span>
            ) : (
              <span className="flex items-center justify-center gap-1.5"><Clock className="w-3 h-3" />History</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'messages' ? (
          <div className="p-4 space-y-3">
            {messages.length === 0 && (
              <p className="text-center text-xs text-gray-400 py-6">No messages yet. Start the conversation!</p>
            )}
            {messages.map(msg => {
              const isMe = msg.user_id === user?.id;
              const author = profiles[msg.user_id];
              return (
                <div key={msg.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                  <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                    <User className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                  <div className={`max-w-[80%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                    <span className="text-xs text-gray-400">{author?.full_name ?? 'Unknown'} · {timeAgo(msg.created_at)}</span>
                    <div className={`px-3 py-2 rounded-xl text-xs leading-relaxed ${isMe ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                      {msg.body}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          <div className="p-4 space-y-2">
            {history.length === 0 && (
              <p className="text-center text-xs text-gray-400 py-6">No history yet.</p>
            )}
            {history.map(h => {
              const actor = h.user_id ? profiles[h.user_id] : null;
              return (
                <div key={h.id} className="flex gap-2.5 text-xs">
                  <div className="flex-shrink-0 mt-0.5">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">{actor?.full_name ?? 'System'}</span>
                    {' '}changed{' '}
                    <span className="font-medium text-blue-600">{h.field_name.replace(/_/g, ' ')}</span>
                    {h.old_value && <> from <span className="text-gray-500 line-through">{h.old_value}</span></>}
                    {h.new_value && <> to <span className="font-medium text-gray-800">{h.new_value}</span></>}
                    <div className="text-gray-400 mt-0.5">{timeAgo(h.created_at)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Message input */}
      {tab === 'messages' && (
        <div className="px-4 py-3 border-t border-gray-100">
          <div className="flex gap-2">
            <input
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Write a message..."
              className="flex-1 text-xs px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={sendMessage}
              disabled={sending || !newMessage.trim()}
              className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
