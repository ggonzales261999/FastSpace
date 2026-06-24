import { useState, useEffect } from 'react';
import { X, UserPlus, User as UserIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Profile } from '../../types';

const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#06B6D4', '#F97316', '#EC4899',
];

const USER_ROLE_BADGE: Record<string, string> = {
  admin:   'bg-red-100 text-red-600',
  manager: 'bg-amber-100 text-amber-600',
  user:    'bg-blue-100 text-blue-600',
};

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function ProjectModal({ onClose, onCreated }: Props) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Profile[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('profiles').select('*').neq('id', user!.id).order('full_name').then(({ data }) => {
      setAllUsers(data ?? []);
    });
  }, []);

  const availableUsers = allUsers.filter(u =>
    !selectedMembers.some(m => m.id === u.id) &&
    (userSearch.trim() === '' || u.full_name.toLowerCase().includes(userSearch.toLowerCase()))
  );

  function addMember(u: Profile) {
    setSelectedMembers(prev => [...prev, u]);
    setUserSearch('');
  }

  function removeMember(id: string) {
    setSelectedMembers(prev => prev.filter(m => m.id !== id));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError('');

    const { data: project, error: projError } = await supabase
      .from('projects')
      .insert({ name: name.trim(), description: description.trim() || null, color, created_by: user!.id })
      .select()
      .single();

    if (projError || !project) {
      setError(projError?.message ?? 'Failed to create project');
      setLoading(false);
      return;
    }

    // Add selected members
    if (selectedMembers.length > 0) {
      await supabase.from('project_members').insert(
        selectedMembers.map(m => ({
          project_id: project.id,
          user_id: m.id,
          role_in_project: 'member',
        }))
      );
    }

    setLoading(false);
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <h2 className="font-semibold text-gray-900">New Project</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Project Name *</label>
              <input
                autoFocus
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Website Redesign"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                placeholder="Optional description..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Color */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {/* Members */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                <UserPlus className="w-4 h-4" /> Add Members
              </label>

              {/* Selected chips */}
              {selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedMembers.map(m => (
                    <span
                      key={m.id}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-full text-xs font-medium text-blue-700"
                    >
                      {m.full_name}
                      <button
                        type="button"
                        onClick={() => removeMember(m.id)}
                        className="text-blue-400 hover:text-blue-700"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Search input */}
              <input
                type="text"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="Search users to add..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              {/* Dropdown results */}
              {userSearch.trim() !== '' && (
                <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden shadow-sm max-h-36 overflow-y-auto">
                  {availableUsers.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-gray-400">No users found</p>
                  ) : (
                    availableUsers.slice(0, 6).map(u => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => addMember(u)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 text-left transition-colors border-b border-gray-50 last:border-0"
                      >
                        <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                          <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{u.full_name}</p>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${USER_ROLE_BADGE[u.role]}`}>
                            {u.role}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          </div>

          <div className="flex gap-3 px-6 py-4 border-t flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg text-sm font-semibold transition-colors"
            >
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
