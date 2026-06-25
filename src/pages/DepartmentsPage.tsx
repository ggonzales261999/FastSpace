import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Plus, Pencil, Trash2, Building2, X, Check, AlertCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Department } from '../types';
import { useAuth } from '../context/AuthContext';
import { queryKeys } from '../lib/queryClient';

const DEPT_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#06B6D4', '#F97316', '#EC4899',
  '#14B8A6', '#6366F1', '#84CC16', '#F43F5E',
];

interface DeptWithCount extends Department {
  memberCount: number;
  projectCount: number;
}

interface FormState {
  name: string;
  description: string;
  color: string;
}

const BLANK_FORM: FormState = { name: '', description: '', color: DEPT_COLORS[0] };

export default function DepartmentsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [departments, setDepartments] = useState<DeptWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Department | null>(null);
  const [form, setForm] = useState<FormState>(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isAdmin = profile?.role === 'admin';
  const canManage = profile?.role === 'admin' || profile?.role === 'manager';

  async function load() {
    const [{ data: depts }, { data: profiles }, { data: projects }] = await Promise.all([
      supabase.from('departments').select('*').order('name'),
      supabase.from('profiles').select('department_id').eq('is_deleted', false).eq('status', true),
      supabase.from('projects').select('department_id').eq('is_deleted', false).eq('status', true),
    ]);

    const memberMap: Record<string, number> = {};
    const projectMap: Record<string, number> = {};
    (profiles ?? []).forEach(p => {
      if (p.department_id) memberMap[p.department_id] = (memberMap[p.department_id] ?? 0) + 1;
    });
    (projects ?? []).forEach(p => {
      if (p.department_id) projectMap[p.department_id] = (projectMap[p.department_id] ?? 0) + 1;
    });

    setDepartments(
      (depts ?? []).map(d => ({
        ...d,
        memberCount: memberMap[d.id] ?? 0,
        projectCount: projectMap[d.id] ?? 0,
      }))
    );
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditTarget(null);
    setForm(BLANK_FORM);
    setError('');
    setShowModal(true);
  }

  function openEdit(dept: Department) {
    setEditTarget(dept);
    setForm({ name: dept.name, description: dept.description ?? '', color: dept.color });
    setError('');
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError('');

    if (editTarget) {
      const { error } = await supabase
        .from('departments')
        .update({
          name: form.name.trim(),
          description: form.description.trim() || null,
          color: form.color,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editTarget.id);
      if (error) { setError(error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase
        .from('departments')
        .insert({ name: form.name.trim(), description: form.description.trim() || null, color: form.color });
      if (error) { setError(error.message); setSaving(false); return; }
    }

    setSaving(false);
    setShowModal(false);
    load();
    queryClient.invalidateQueries({ queryKey: queryKeys.departments });
  }

  async function handleDelete(dept: DeptWithCount) {
    if (dept.memberCount > 0 || dept.projectCount > 0) {
      if (!confirm(
        `This department has ${dept.memberCount} member(s) and ${dept.projectCount} project(s).\n\n` +
        `Deleting it will unlink them. Continue?`
      )) return;
    } else {
      if (!confirm(`Delete department "${dept.name}"?`)) return;
    }

    // Soft delete
    await supabase
      .from('departments')
      .update({ is_deleted: true, status: false, updated_at: new Date().toISOString() })
      .eq('id', dept.id);

    load();
    queryClient.invalidateQueries({ queryKey: queryKeys.departments });
  }

  if (!canManage) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center text-gray-400">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-500">Access restricted</p>
          <p className="text-sm mt-1">Only admins and managers can manage departments.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Departments</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {departments.length} department{departments.length !== 1 ? 's' : ''}
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-all shadow-sm shadow-blue-500/25"
            >
              <Plus className="w-4 h-4" />
              New Department
            </button>
          )}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl h-40 animate-pulse shadow-sm" />
            ))}
          </div>
        ) : departments.length === 0 ? (
          <div className="text-center py-20">
            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-500 mb-1">No departments yet</h3>
            {isAdmin && (
              <button
                onClick={openCreate}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                Create your first department
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {departments.map(dept => (
              <div
                key={dept.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all overflow-hidden group flex flex-col"
              >
                <div className="h-1.5 flex-shrink-0" style={{ backgroundColor: dept.color }} />

                <div className="p-5 flex flex-col flex-1">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: dept.color + '22' }}
                      >
                        <Building2 className="w-4.5 h-4.5" style={{ color: dept.color }} />
                      </div>
                      <h3 className="font-semibold text-gray-900 text-sm truncate">{dept.name}</h3>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button
                          onClick={() => openEdit(dept)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(dept)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {dept.description && (
                    <p className="text-xs text-gray-500 mb-3 line-clamp-2">{dept.description}</p>
                  )}

                  <div className="mt-auto flex items-center gap-4 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <span className="font-semibold text-gray-600">{dept.memberCount}</span>
                      member{dept.memberCount !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="font-semibold text-gray-600">{dept.projectCount}</span>
                      project{dept.projectCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-semibold text-gray-900">
                {editTarget ? 'Edit Department' : 'New Department'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Department Name *
                </label>
                <input
                  autoFocus
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Engineering"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder="Optional description..."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {DEPT_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, color: c }))}
                      className={`w-8 h-8 rounded-full transition-all flex items-center justify-center ${
                        form.color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {form.color === c && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !form.name.trim()}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  {saving ? 'Saving...' : editTarget ? 'Save Changes' : 'Create Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
