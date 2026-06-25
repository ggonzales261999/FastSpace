import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, UserPlus, Building2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Profile, Department } from '../../types';
import { queryKeys } from '../../lib/queryClient';

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
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [departmentId, setDepartmentId] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<Profile[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [error, setError] = useState('');

  const departmentsQuery = useQuery({
    queryKey: queryKeys.departments,
    queryFn: async () => {
      const { data } = await supabase.from('departments').select('*').order('name');
      return (data ?? []) as Department[];
    },
  });

  const usersQuery = useQuery({
    queryKey: queryKeys.profiles('project-modal'),
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', user!.id)
        .eq('is_deleted', false)
        .eq('status', true)
        .order('full_name');
      return (data ?? []) as Profile[];
    },
  });

  function addMember(u: Profile) {
    setSelectedMembers(prev => [...prev, u]);
    setUserSearch('');
  }

  function removeMember(id: string) {
    setSelectedMembers(prev => prev.filter(m => m.id !== id));
  }

  const createProjectMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Project name is required');

      const { data: project, error: projError } = await supabase
        .from('projects')
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          color,
          department_id: departmentId || null,
          created_by: user!.id,
        })
        .select()
        .single();

      if (projError || !project) {
        throw new Error(projError?.message ?? 'Failed to create project');
      }

      if (selectedMembers.length > 0) {
        const { error: membersError } = await supabase.from('project_members').insert(
          selectedMembers.map(m => ({
            project_id: project.id,
            user_id: m.id,
            role_in_project: 'member',
          }))
        );
        if (membersError) throw new Error(membersError.message);
      }

      return project;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
        queryClient.invalidateQueries({ queryKey: queryKeys.projectsMeta }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
      ]);
      onCreated();
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  const departments = departmentsQuery.data ?? [];
  const allUsers = usersQuery.data ?? [];
  const availableUsers = allUsers.filter(u =>
    !selectedMembers.some(m => m.id === u.id) &&
    (userSearch.trim() === '' || u.full_name.toLowerCase().includes(userSearch.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <h2 className="font-semibold text-gray-900">New Project</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={e => {
            e.preventDefault();
            setError('');
            createProjectMutation.mutate();
          }}
          className="flex flex-col flex-1 overflow-hidden"
        >
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
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                required
              />
            </div>

            {/* Department */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                <Building2 className="w-4 h-4" /> Department
              </label>
              {departments.length === 0 ? (
                <p className="text-xs text-gray-400 px-3 py-2 bg-gray-50 rounded-xl border border-gray-200">
                  No departments found. Create one in the Departments page first.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDepartmentId('')}
                    className={`px-3 py-2 rounded-xl text-sm text-left transition-all border ${
                      departmentId === ''
                        ? 'border-blue-400 bg-blue-50 text-blue-700 font-medium'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    None
                  </button>
                  {departments.map(d => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setDepartmentId(d.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-left transition-all border ${
                        departmentId === d.id
                          ? 'border-blue-400 bg-blue-50 text-blue-700 font-medium'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                      <span className="truncate">{d.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                placeholder="Optional description..."
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
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
                    className={`w-8 h-8 rounded-full transition-all hover:scale-110 ${
                      color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''
                    }`}
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

              {selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedMembers.map(m => (
                    <span
                      key={m.id}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-full text-xs font-medium text-blue-700"
                    >
                      {m.full_name}
                      <button type="button" onClick={() => removeMember(m.id)} className="text-blue-400 hover:text-blue-700">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <input
                type="text"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="Search users to add..."
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />

              {userSearch.trim() !== '' && (
                <div className="mt-1 border border-gray-200 rounded-xl overflow-hidden shadow-sm max-h-40 overflow-y-auto">
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
                        <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 text-xs font-bold text-slate-500">
                          {u.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 truncate">{u.full_name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${USER_ROLE_BADGE[u.role]}`}>
                              {u.role}
                            </span>
                            {u.department_id && (
                              <span className="text-xs text-gray-400">
                                {departments.find(d => d.id === u.department_id)?.name ?? ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
          </div>

          <div className="flex gap-3 px-6 py-4 border-t flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createProjectMutation.isPending || !name.trim()}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              {createProjectMutation.isPending ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
