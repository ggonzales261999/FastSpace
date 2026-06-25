import { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard, FolderOpen, CheckSquare, Settings,
  ChevronDown, Plus, LogOut, Users, Trash2, MoreHorizontal, Building2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Department, Project } from '../../types';
import { supabase } from '../../lib/supabase';
import ProjectMembersModal from '../modals/ProjectMembersModal';

interface SidebarProps {
  activePage: string;
  onNavigate: (page: string, projectId?: string) => void;
  projects: Project[];
  departments: Department[];
  activeProjectId?: string;
  onAddProject: () => void;
  onRefreshProjects: () => void;
}

interface MenuPos { x: number; y: number; projectId: string }

export default function Sidebar({
  activePage, onNavigate, projects, departments, activeProjectId, onAddProject, onRefreshProjects,
}: SidebarProps) {
  const { profile, user, signOut } = useAuth();
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [collapsedDepts, setCollapsedDepts] = useState<Record<string, boolean>>({});
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const [managingProject, setManagingProject] = useState<Project | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const canCreate = profile?.role === 'admin' || profile?.role === 'manager';

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuPos(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function openMenu(e: React.MouseEvent<HTMLButtonElement>, projectId: string) {
    e.stopPropagation();
    if (menuPos?.projectId === projectId) { setMenuPos(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPos({ x: rect.right + 8, y: rect.top, projectId });
  }

  async function deleteProject(id: string) {
    if (!confirm('Delete this project and all its tasks?')) return;
    setMenuPos(null);
    // Soft delete: mark project and its tasks as deleted
    await supabase
      .from('projects')
      .update({ is_deleted: true, status: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    onRefreshProjects();
  }

  function canManageProject(p: Project) {
    return profile?.role === 'admin' || profile?.role === 'manager' || p.created_by === user?.id;
  }

  const roleBadge = profile?.role === 'admin'
    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
    : profile?.role === 'manager'
    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
    : 'bg-sky-500/20 text-sky-300 border border-sky-500/30';

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : 'U';

  const navItems = [
    { id: 'dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
    { id: 'projects',    label: 'Projects',    icon: FolderOpen },
    { id: 'tasks',       label: 'All Tasks',   icon: CheckSquare },
    ...((profile?.role === 'admin' || profile?.role === 'manager')
      ? [{ id: 'departments', label: 'Departments', icon: Building2 }]
      : []),
    ...(profile?.role === 'admin' ? [{ id: 'user-management', label: 'User Management', icon: Users }] : []),
  ];

  const activeMenuProject = menuPos ? projects.find(p => p.id === menuPos.projectId) : null;
  const projectGroups = departments
    .map(department => ({
      department,
      projects: projects.filter(project => project.department_id === department.id),
    }))
    .filter(group => group.projects.length > 0);
  const unassignedProjects = projects.filter(project => !project.department_id);

  return (
    <>
      <aside className="w-64 flex-shrink-0 flex flex-col h-full" style={{ background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)' }}>
        {/* Logo */}
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-center gap-3">
            <div>
              <span className="text-white font-bold text-[15px] tracking-tight">Fast Space</span>
              <p className="text-slate-500 text-[10px] leading-none mt-0.5">Project Management</p>
            </div>
          </div>
        </div>

        <div className="mx-4 h-px bg-white/5 mb-3" />

        {/* Main nav */}
        <nav className="px-3 space-y-0.5">
          {navItems.map(({ id, label, icon: Icon }) => {
            const isActive = activePage === id;
            return (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-white/10 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : ''}`} />
                {label}
                {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400" />}
              </button>
            );
          })}
        </nav>

        <div className="mx-4 my-3 h-px bg-white/5" />

        {/* My Projects */}
        <div className="px-3 flex-1 overflow-y-auto min-h-0">
          <div className="flex items-center justify-between px-2 py-1 mb-1">
            <button
              onClick={() => setProjectsOpen(!projectsOpen)}
              className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest hover:text-slate-400 transition-colors"
            >
              Projects
              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${projectsOpen ? '' : '-rotate-90'}`} />
            </button>
            {canCreate && (
              <button
                onClick={onAddProject}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all"
                title="New project"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {projectsOpen && (
            <div className="space-y-3">
              {projectGroups.map(({ department, projects: deptProjects }) => {
                const isDeptCollapsed = collapsedDepts[department.id] ?? false;
                return (
                  <div key={department.id} className="space-y-1">
                    <button
                      onClick={() => setCollapsedDepts(prev => ({ ...prev, [department.id]: !prev[department.id] }))}
                      className="w-full flex items-center gap-1.5 px-2.5 pt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-400 transition-colors"
                    >
                      <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform duration-200 ${isDeptCollapsed ? '-rotate-90' : ''}`} />
                      <span className="flex-1 text-left truncate">{department.name}</span>
                      <span className="text-[9px] font-normal normal-case tracking-normal text-slate-600 flex-shrink-0">
                        {deptProjects.length}
                      </span>
                    </button>
                    {!isDeptCollapsed && (
                      <div className="space-y-0.5">
                        {deptProjects.map(p => {
                          const isActive = activeProjectId === p.id && activePage === 'tasks';
                          return (
                            <div key={p.id} className="relative group">
                              <button
                                onClick={() => onNavigate('tasks', p.id)}
                                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] transition-all ${
                                  isActive
                                    ? 'bg-white/10 text-white'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                                }`}
                              >
                                <span
                                  className="w-2 h-2 rounded-full flex-shrink-0 shadow-sm"
                                  style={{ backgroundColor: p.color }}
                                />
                                <span className="flex-1 text-left truncate">{p.name}</span>
                                {canManageProject(p) && (
                                  <button
                                    onClick={e => openMenu(e, p.id)}
                                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded-md hover:bg-white/10 text-slate-500 hover:text-slate-300 transition-all"
                                  >
                                    <MoreHorizontal className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {unassignedProjects.length > 0 && (
                <div className="space-y-1">
                  <button
                    onClick={() => setCollapsedDepts(prev => ({ ...prev, __unassigned__: !prev.__unassigned__ }))}
                    className="w-full flex items-center gap-1.5 px-2.5 pt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-400 transition-colors"
                  >
                    <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform duration-200 ${collapsedDepts.__unassigned__ ? '-rotate-90' : ''}`} />
                    <span className="flex-1 text-left">Unassigned</span>
                    <span className="text-[9px] font-normal normal-case tracking-normal text-slate-600 flex-shrink-0">
                      {unassignedProjects.length}
                    </span>
                  </button>
                  {!collapsedDepts.__unassigned__ && (
                    <div className="space-y-0.5">
                      {unassignedProjects.map(p => {
                        const isActive = activeProjectId === p.id && activePage === 'tasks';
                        return (
                          <div key={p.id} className="relative group">
                            <button
                              onClick={() => onNavigate('tasks', p.id)}
                              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] transition-all ${
                                isActive
                                  ? 'bg-white/10 text-white'
                                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                              }`}
                            >
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0 shadow-sm"
                                style={{ backgroundColor: p.color }}
                              />
                              <span className="flex-1 text-left truncate">{p.name}</span>
                              {canManageProject(p) && (
                                <button
                                  onClick={e => openMenu(e, p.id)}
                                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded-md hover:bg-white/10 text-slate-500 hover:text-slate-300 transition-all"
                                >
                                  <MoreHorizontal className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {projects.length === 0 && (
                <p className="px-2.5 py-2 text-xs text-slate-600">No projects yet</p>
              )}
            </div>
          )}
        </div>

        {/* User section */}
        <div className="mx-4 mt-3 h-px bg-white/5" />
        <div className="px-3 py-4 space-y-0.5">
          <button
            onClick={() => onNavigate('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activePage === 'settings'
                ? 'bg-white/10 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Settings className="w-4 h-4" />
            User Profile
          </button>

          <div className="flex items-center gap-3 px-3 py-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center flex-shrink-0 text-xs font-bold text-slate-300">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-slate-200 truncate">{profile?.full_name || 'User'}</p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold uppercase tracking-wide ${roleBadge}`}>
                {profile?.role}
              </span>
            </div>
            <button
              onClick={signOut}
              className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-all"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Fixed-position project context menu (escapes sidebar overflow) */}
      {menuPos && activeMenuProject && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-white border border-gray-100 rounded-xl shadow-2xl py-1 w-44 overflow-hidden"
          style={{ left: menuPos.x, top: menuPos.y }}
        >
          <button
            onClick={() => { setMenuPos(null); setManagingProject(activeMenuProject); }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
          >
            <Users className="w-3.5 h-3.5" />
            Manage Members
          </button>
          <div className="h-px bg-gray-100 mx-2" />
          <button
            onClick={() => deleteProject(activeMenuProject.id)}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Project
          </button>
        </div>
      )}

      {managingProject && (
        <ProjectMembersModal
          project={managingProject}
          onClose={() => { setManagingProject(null); onRefreshProjects(); }}
        />
      )}
    </>
  );
}
