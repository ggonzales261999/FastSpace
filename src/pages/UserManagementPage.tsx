import { useEffect, useState } from 'react';
import { Users, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Profile, UserRole } from '../types';

const ROLE_BADGE: Record<UserRole, string> = {
  admin: 'bg-red-50 text-red-700 border border-red-200',
  manager: 'bg-amber-50 text-amber-700 border border-amber-200',
  user: 'bg-blue-50 text-blue-700 border border-blue-200',
};

export default function UserManagementPage() {
  const { profile, refreshProfile } = useAuth();
  const [departments, setDepartments] = useState<{ id: string; name: string; color: string }[]>([]);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from('departments').select('id,name,color').order('name').then(({ data }) => setDepartments(data ?? []));
    supabase
      .from('profiles')
      .select('*')
      .eq('is_deleted', false)
      .eq('status', true)
      .order('created_at')
      .then(({ data }) => setAllUsers(data ?? []));
  }, [isAdmin]);

  async function changeRole(userId: string, newRole: UserRole) {
    setUpdatingUser(userId);
    await supabase
      .from('profiles')
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq('id', userId);
    setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    if (userId === profile?.id) await refreshProfile();
    setUpdatingUser(null);
  }

  async function changeUserDept(userId: string, deptId: string) {
    setUpdatingUser(userId);
    await supabase
      .from('profiles')
      .update({ department_id: deptId || null, updated_at: new Date().toISOString() })
      .eq('id', userId);
    setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, department_id: deptId || null } : u));
    if (userId === profile?.id) await refreshProfile();
    setUpdatingUser(null);
  }

  if (!profile) return null;

  if (!isAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center text-gray-400">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-500">Access restricted</p>
          <p className="text-sm mt-1">Only admins can access this section.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500 mt-1">Manage user roles and department tags.</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-500" /> Users
          </h2>
          <div className="space-y-2">
            {allUsers.map(u => {
              const userDept = departments.find(d => d.id === u.department_id);
              return (
                <div
                  key={u.id}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl border border-gray-100 hover:bg-gray-50/60 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-xs font-bold text-slate-600 flex-shrink-0">
                    {u.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {u.full_name || 'Unnamed'}
                      {u.id === profile.id && <span className="ml-1.5 text-xs text-gray-400">(you)</span>}
                    </p>
                    {userDept && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: userDept.color }} />
                        <span className="text-xs text-gray-400">{userDept.name}</span>
                      </div>
                    )}
                  </div>

                  <select
                    value={u.department_id ?? ''}
                    onChange={e => changeUserDept(u.id, e.target.value)}
                    disabled={updatingUser === u.id}
                    className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/40 cursor-pointer text-gray-600"
                  >
                    <option value="">No dept</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>

                  <select
                    value={u.role}
                    onChange={e => changeRole(u.id, e.target.value as UserRole)}
                    disabled={updatingUser === u.id}
                    className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-400/40 cursor-pointer transition-colors ${ROLE_BADGE[u.role]}`}
                  >
                    <option value="user">User</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              );
            })}
            {allUsers.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No users found.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
