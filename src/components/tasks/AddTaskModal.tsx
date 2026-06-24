import { useState, useEffect, useMemo } from 'react';
import { X, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Project, Profile, TaskStatus } from '../../types';

interface Props {
  projects: Project[];
  defaultProjectId?: string;
  onClose: () => void;
  onCreated: () => void;
}

function toISO(local: string): string | null {
  if (!local) return null;
  return new Date(local).toISOString();
}

function calculateHours(start: string, end: string): number | null {
  if (!start || !end) return null;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return null;
  const diffMs = endDate.getTime() - startDate.getTime();
  if (diffMs <= 0) return null;
  return Math.round((diffMs / 3600000) * 10) / 10; // Round to 1 decimal
}

export default function AddTaskModal({ projects, defaultProjectId, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId ?? (projects[0]?.id ?? ''));
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [plannedStart, setPlannedStart] = useState('');
  const [plannedEnd, setPlannedEnd] = useState('');
  const [actualStart, setActualStart] = useState('');
  const [actualEnd, setActualEnd] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [autoCalculatePlanned, setAutoCalculatePlanned] = useState(true);
  const [autoCalculateActual, setAutoCalculateActual] = useState(true);
  const [assignedTo, setAssignedTo] = useState('');
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto-calculated hours
  const plannedHours = useMemo(() => {
    if (!autoCalculatePlanned) return null;
    return calculateHours(plannedStart, plannedEnd);
  }, [plannedStart, plannedEnd, autoCalculatePlanned]);

  const actualHours = useMemo(() => {
    if (!autoCalculateActual) return null;
    return calculateHours(actualStart, actualEnd);
  }, [actualStart, actualEnd, autoCalculateActual]);

  const displayHours = useMemo(() => {
    const est = estimatedHours ? parseFloat(estimatedHours) : null;
    return est ?? plannedHours ?? actualHours;
  }, [estimatedHours, plannedHours, actualHours]);

  useEffect(() => {
    supabase.from('profiles').select('*').then(({ data }) => setMembers(data ?? []));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !projectId) return;
    setLoading(true);
    setError('');
    const { error } = await supabase.from('tasks').insert({
      project_id: projectId,
      title: title.trim(),
      description: description.trim() || null,
      status,
      planned_start: toISO(plannedStart),
      planned_end: toISO(plannedEnd),
      actual_start: toISO(actualStart),
      actual_end: toISO(actualEnd),
      estimated_hours: displayHours,
      assigned_to: assignedTo || null,
      created_by: user!.id,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <h2 className="font-semibold text-gray-900">Add New Task</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Title *</label>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Task title"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Project *</label>
              <select
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as TaskStatus)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="todo">To Do</option>
                <option value="doing">Doing</option>
                <option value="done">Done</option>
                <option value="hold">Hold</option>
              </select>
            </div>
          </div>

          {/* Planned dates with auto-hours */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Planned Schedule</label>
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCalculatePlanned}
                  onChange={e => setAutoCalculatePlanned(e.target.checked)}
                  className="accent-blue-500"
                />
                Auto-calculate hours
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Start Date & Time</label>
                <input
                  type="datetime-local"
                  value={plannedStart}
                  onChange={e => setPlannedStart(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">End Date & Time</label>
                <input
                  type="datetime-local"
                  value={plannedEnd}
                  onChange={e => setPlannedEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            {plannedHours !== null && (
              <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                <Clock className="w-3 h-3" />
                Auto-calculated: {plannedHours} hours
              </div>
            )}
          </div>

          {/* Actual dates with auto-hours */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Actual Schedule</label>
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCalculateActual}
                  onChange={e => setAutoCalculateActual(e.target.checked)}
                  className="accent-blue-500"
                />
                Auto-calculate hours
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Start Date & Time</label>
                <input
                  type="datetime-local"
                  value={actualStart}
                  onChange={e => setActualStart(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">End Date & Time</label>
                <input
                  type="datetime-local"
                  value={actualEnd}
                  onChange={e => setActualEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            {actualHours !== null && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                <Clock className="w-3 h-3" />
                Auto-calculated: {actualHours} hours
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Est. Hours {displayHours !== null && <span className="text-blue-600 text-xs">({displayHours}h)</span>}
              </label>
              <input
                type="number"
                value={estimatedHours}
                onChange={e => setEstimatedHours(e.target.value)}
                min="0"
                step="0.5"
                placeholder={displayHours !== null ? `${displayHours}` : '0'}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">Leave empty to use auto-calculated</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Assign To</label>
              <select
                value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Unassigned</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </div>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg text-sm font-semibold transition-colors"
            >
              {loading ? 'Creating...' : 'Add Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
