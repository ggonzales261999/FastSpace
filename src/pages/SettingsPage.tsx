import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFontSize } from '../context/FontSizeContext';
import { supabase } from '../lib/supabase';
import { User, Shield, Building2, Type, Minus, Plus } from 'lucide-react';
import { UserRole, Department } from '../types';

const ROLE_INFO: Record<UserRole, { label: string; color: string; desc: string }> = {
  admin:   { label: 'Admin',   color: 'text-red-600 bg-red-50 border-red-200',     desc: 'Full access: create/delete projects, manage all users, access all tasks.' },
  manager: { label: 'Manager', color: 'text-amber-600 bg-amber-50 border-amber-200', desc: 'Can create projects, add tasks, assign to users, view all tasks.' },
  user:    { label: 'User',    color: 'text-blue-600 bg-blue-50 border-blue-200',  desc: 'Can view and update tasks assigned to them.' },
};

export default function SettingsPage() {
  const { profile, refreshProfile } = useAuth();
  const { fontSize, setFontSize } = useFontSize();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [departments, setDepartments] = useState<Department[]>([]);

  useEffect(() => {
    supabase.from('departments').select('*').order('name').then(({ data }) => setDepartments(data ?? []));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profile!.id);
    setSaving(false);
    if (error) { setError(error.message); return; }
    await refreshProfile();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (!profile) return null;

  const roleInfo = ROLE_INFO[profile.role];
  const departmentName = departments.find(d => d.id === profile.department_id)?.name;

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">
        <h1 className="text-2xl font-bold text-gray-900">User Profile</h1>

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
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                <Building2 className="w-4 h-4" /> Department
              </label>
              <div className="w-full px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-200 text-sm text-gray-700">
                {departmentName ?? 'No department assigned'}
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl text-sm font-semibold transition-colors"
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

        {/* Font Size */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Type className="w-4 h-4 text-gray-500" /> Accessibility
          </h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Font Size</label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setFontSize(fontSize - 0.1)}
                  disabled={fontSize <= 0.75}
                  className="w-10 h-10 flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Minus className="w-4 h-4 text-gray-600" />
                </button>
                <div className="flex-1 flex items-center justify-center">
                  <div className="px-4 py-2 bg-gray-50 rounded-xl border border-gray-200 min-w-[80px] text-center">
                    <span className="text-sm font-semibold text-gray-700">{Math.round(fontSize * 100)}%</span>
                  </div>
                </div>
                <button
                  onClick={() => setFontSize(fontSize + 0.1)}
                  disabled={fontSize >= 1.5}
                  className="w-10 h-10 flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className="w-4 h-4 text-gray-600" />
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2 text-center">
                Adjust text size for better readability (75% - 150%)
              </p>
            </div>

            <div className="pt-3 border-t border-gray-100">
              <p className="text-sm text-gray-600" style={{ fontSize: `${fontSize * 14}px` }}>
                Preview: This is how your text will look with the current font size setting.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
