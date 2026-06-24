import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { User, Shield, Users } from 'lucide-react';
import { Profile, UserRole } from '../types';

const ROLE_INFO: Record<UserRole, { label: string; color: string; desc: string }> = {
  admin: { label: 'Admin', color: 'text-red-600 bg-red-50 border-red-200', desc: 'Full access: create/delete projects, manage all users, access all tasks.' },
  manager: { label: 'Manager', color: 'text-amber-600 bg-amber-50 border-amber-200', desc: 'Can create projects, add tasks, assign to users, view all tasks.' },
  user: { label: 'User', color: 'text-blue-600 bg-blue-50 border-blue-200', desc: 'Can view and update tasks assigned to them.' },
};

const ROLE_BADGE: Record<UserRole, string> = {
  admin: 'bg-red-50 text-red-700 border border-red-200',
  manager: 'bg-amber-50 text-amber-700 border border-amber-200',
  user: 'bg-blue-50 text-blue-700 border border-blue-200',
};

export default function SettingsPage() {
  const { profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from('profiles').select('*').order('created_at').then(({ data }) => setAllUsers(data ?? []));
  }, [isAdmin]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const { error } = await supabase.from('profiles').update({ full_name: fullName, updated_at: new Date().toISOString() }).eq('id', profile!.id);
    setSaving(false);
    if (error) { setError(error.message); return; }
    await refreshProfile();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function changeRole(userId: string, newRole: UserRole) {
    setUpdatingRole(userId);
    await supabase.from('profiles').update({ role: newRole, updated_at: new Date().toISOString() }).eq('id', userId);
    setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    if (userId === profile?.id) await refreshProfile();
    setUpdatingRole(null);
  }

  if (!profile) return null;

  const roleInfo = ROLE_INFO[profile.role];

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

        {/* Profile */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-gray-500" /> Profile
          </h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
              <input
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg text-sm font-semibold transition-colors"
            >
              {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
            </button>
          </form>
        </div>

        {/* Role */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-gray-500" /> Role & Permissions
          </h2>
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-semibold ${roleInfo.color}`}>
            <Shield className="w-3.5 h-3.5" />
            {roleInfo.label}
          </div>
          <p className="text-sm text-gray-500 mt-3">{roleInfo.desc}</p>
        </div>

        {/* Admin: User Management */}
        {isAdmin && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-500" /> User Management
            </h2>
            <div className="space-y-2">
              {allUsers.map(u => (
                <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 hover:bg-gray-50/60 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-xs font-bold text-slate-600 flex-shrink-0">
                    {u.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {u.full_name || 'Unnamed'}
                      {u.id === profile.id && <span className="ml-1.5 text-xs text-gray-400">(you)</span>}
                    </p>
                  </div>
                  <select
                    value={u.role}
                    onChange={e => changeRole(u.id, e.target.value as UserRole)}
                    disabled={updatingRole === u.id}
                    className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-400/40 cursor-pointer transition-colors ${ROLE_BADGE[u.role]}`}
                  >
                    <option value="user">User</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              ))}
              {allUsers.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No users found.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
