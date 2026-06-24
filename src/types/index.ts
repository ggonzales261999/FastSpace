export type UserRole = 'admin' | 'manager' | 'user';
export type TaskStatus = 'todo' | 'doing' | 'done' | 'hold';
export type ProjectMemberRole = 'owner' | 'member';

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  description?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  main_task_count?: number;
  sub_task_count?: number;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role_in_project: ProjectMemberRole;
  created_at: string;
  profile?: Profile;
}

export interface BoardColumn {
  id: string;
  project_id: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  parent_task_id?: string | null;
  board_column_id?: string | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  planned_start?: string | null;
  planned_end?: string | null;
  actual_start?: string | null;
  actual_end?: string | null;
  estimated_hours?: number | null;
  assigned_to?: string | null;
  created_by: string;
  position: number;
  created_at: string;
  updated_at: string;
  subtasks?: Task[];
  assignee?: Profile | null;
  creator?: Profile | null;
}

export interface TaskMessage {
  id: string;
  task_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  author?: Profile | null;
}

export interface TaskHistory {
  id: string;
  task_id: string;
  user_id?: string | null;
  field_name: string;
  old_value?: string | null;
  new_value?: string | null;
  created_at: string;
  actor?: Profile | null;
}

export type ViewMode = 'list' | 'board' | 'gantt';
