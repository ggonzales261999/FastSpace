import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, UserPlus, Trash2, Search, Crown, User, Shield } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Profile, ProjectMember, Project } from '../../types';
import { queryKeys } from '../../lib/queryClient';

interface Props {
  project: Project;
  onClose: () => void;
}

const ROLE_BADGE: Record<string, { label: string; cls: string; icon: typeof Crown }> = {
  owner:  { label: 'Owner',  cls: 'bg-amber-100 text-amber-700 border-amber-200',  icon: Crown },
  member: { label: 'Member', cls: 'bg-blue-100 text-blue-700 border-blue-200',   icon: User  },
};

const USER_ROLE_BADGE: Record<string, string> = {
  admin:   'bg-red-100 text-red-600',
  manager: 'bg-amber-100 text-amber-600',
  user:    'bg-blue-100 text-blue-600',
};

export default function ProjectMembersModal({ project, onClose }: Props) {
  const { user, profile: myProfile } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const isAdmin = myProfile?.role === 'admin';
  const isOwner = project.created_by === user?.id;
  const canManage = isAdmin || isOwner || myProfile?.role === 'manager';

  const membersQuery = useQuery({
    queryKey: queryKeys.projectMembers(project.id),
    queryFn: async () => {
      const [{ data: mems }, { data: users }] = await Promise.all([
        supabase.from('project_members').select('*').eq('project_id', project.id),
        supabase.from('profiles').select('*').eq('is_deleted', false).eq('status', true).order('full_name'),
      ]);

      const memberList = (mems ?? []) as ProjectMember[];
      const profileMap: Record<string, Profile> = {};
      (users ?? []).forEach(u => { profileMap[u.id] = u; });

      return {
        members: memberList
          .filter(m => profileMap[m.user_id])
          .map(m => ({ ...m, profile: profileMap[m.user_id] })),
        users: (users ?? []) as Profile[],
      };
    },
  });

  const members = membersQuery.data?.members ?? [];
  const allUsers = membersQuery.data?.users ?? [];
  const memberIds = new Set(members.map(m => m.user_id));
  // Also exclude the project creator (they have implicit access)
  const availableUsers = allUsers.filter(u =>
    !memberIds.has(u.id) &&
    u.id !== project.created_by &&
    (search.trim() === '' ||
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.id.toLowerCase().includes(search.toLowerCase()))
  );

  const addMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from('project_members').insert({
        project_id: project.id,
        user_id: userId,
        role_in_project: 'member',
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setSearch('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectMembers(project.id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectsMeta });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from('project_members').delete().eq('id', memberId);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectMembers(project.id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectsMeta });
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ memberId, newRole }: { memberId: string; newRole: 'owner' | 'member' }) => {
      const { error } = await supabase.from('project_members').update({ role_in_project: newRole }).eq('id', memberId);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectMembers(project.id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectsMeta });
    },
  });

  // Creator profile
  const creatorProfile = allUsers.find(u => u.id === project.created_by);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900">Project Access</h2>
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: project.color }}
              />
              {project.name}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Current members */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Members ({members.length + 1})
            </h3>
            <div className="space-y-2">
              {/* Creator row — always shown */}
              {creatorProfile && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-100">
                  <div className="w-8 h-8 rounded-full bg-amber-200 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-4 h-4 text-amber-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{creatorProfile.full_name}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${USER_ROLE_BADGE[creatorProfile.role]}`}>
                      {creatorProfile.role}
                    </span>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-lg border font-medium bg-amber-100 text-amber-700 border-amber-200 flex items-center gap-1 flex-shrink-0">
                    <Crown className="w-3 h-3" /> Creator
                  </span>
                </div>
              )}

              {membersQuery.isLoading ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
                ))
              ) : members.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No additional members yet.</p>
              ) : (
                members.map(m => {
                  const badge = ROLE_BADGE[m.role_in_project] ?? ROLE_BADGE.member;
                  const BadgeIcon = badge.icon;
                  return (
                    <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{m.profile.full_name}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${USER_ROLE_BADGE[m.profile.role]}`}>
                          {m.profile.role}
                        </span>
                      </div>
                      {canManage ? (
                        <select
                          value={m.role_in_project}
                          onChange={e => changeRoleMutation.mutate({ memberId: m.id, newRole: e.target.value as 'owner' | 'member' })}
                          className={`text-xs px-2 py-1 rounded-lg border font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${badge.cls}`}
                        >
                          <option value="member">Member</option>
                          <option value="owner">Owner</option>
                        </select>
                      ) : (
                        <span className={`text-xs px-2 py-1 rounded-lg border font-medium flex items-center gap-1 ${badge.cls}`}>
                          <BadgeIcon className="w-3 h-3" /> {badge.label}
                        </span>
                      )}
                      {canManage && (
                        <button
                          onClick={() => removeMemberMutation.mutate(m.id)}
                          className="p-1.5 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Add members — only admin/manager/creator */}
          {canManage && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5" /> Add Members
              </h3>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name..."
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {availableUsers.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-3">
                  {search ? 'No users match your search.' : 'All users are already members.'}
                </p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {availableUsers.map(u => (
                    <div
                      key={u.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/40 transition-colors group"
                    >
                      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700 truncate">{u.full_name}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${USER_ROLE_BADGE[u.role]}`}>
                          {u.role}
                        </span>
                      </div>
                      <button
                        onClick={() => addMemberMutation.mutate(u.id)}
                        disabled={addMemberMutation.isPending}
                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                      >
                        <UserPlus className="w-3 h-3" /> Add
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
