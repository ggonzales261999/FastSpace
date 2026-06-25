import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Calendar, Clock } from 'lucide-react';
import { Task, Project } from '../../types';
import { supabase } from '../../lib/supabase';

interface Props {
  projects: Project[];
  tasks: Task[];
  filterProjectId?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const CELL_W  = 36;   // px per day
const LEFT_W  = 440;  // total left-panel width
const COL_ACT = 220;  // Activity column
const COL_S   = 110;  // Start column
const COL_E   = 110;  // End column
const ROW_H   = 40;   // data row height
const HDR1_H  = 30;   // week header height
const HDR2_H  = 32;   // day header height

// ── Status styling ─────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  todo:  'To Do',
  doing: 'In Progress',
  done:  'Done',
  hold:  'On Hold',
};

const STATUS_DOT: Record<string, string> = {
  todo:  '#94a3b8',
  doing: '#f59e0b',
  done:  '#10b981',
  hold:  '#f87171',
};

const STATUS_BAR_GRADIENT: Record<string, string> = {
  todo:  'linear-gradient(90deg, #94a3b8 0%, #cbd5e1 100%)',
  doing: 'linear-gradient(90deg, #d97706 0%, #fbbf24 100%)',
  done:  'linear-gradient(90deg, #059669 0%, #34d399 100%)',
  hold:  'linear-gradient(90deg, #dc2626 0%, #f87171 100%)',
};

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  todo:  { bg: '#f1f5f9', text: '#64748b' },
  doing: { bg: '#fef3c7', text: '#92400e' },
  done:  { bg: '#d1fae5', text: '#065f46' },
  hold:  { bg: '#fee2e2', text: '#991b1b' },
};

// ── Date helpers ───────────────────────────────────────────────────────────────
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfISOWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function localMidnight(): Date {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

function isoWeek(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  );
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  const d = parseDate(s);
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtForExcel(s: string | null | undefined): string {
  if (!s) return '';
  const d = parseDate(s);
  return d ? d.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '';
}

function durationDays(start: string | null | undefined, end: string | null | undefined): number | string {
  const s = parseDate(start);
  const e = parseDate(end);
  if (!s || !e) return '';
  const diff = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  return diff > 0 ? diff : '';
}

interface WeekGroup { weekNum: number; year: number; days: Date[]; startIndex: number }

function buildWeekGroups(days: Date[]): WeekGroup[] {
  const groups: WeekGroup[] = [];
  let cur: WeekGroup | null = null;
  days.forEach((d, i) => {
    const wn = isoWeek(d);
    const yr = d.getFullYear();
    if (!cur || cur.weekNum !== wn || cur.year !== yr) {
      cur = { weekNum: wn, year: yr, days: [d], startIndex: i };
      groups.push(cur);
    } else {
      cur.days.push(d);
    }
  });
  return groups;
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function GanttView({ projects, tasks, filterProjectId }: Props) {
  const [exporting, setExporting] = useState(false);

  const visibleProjects = filterProjectId
    ? projects.filter(p => p.id === filterProjectId)
    : projects;

  const mainTasks = tasks.filter(
    t => !t.parent_task_id && visibleProjects.some(p => p.id === t.project_id),
  );

  const subtaskMap: Record<string, Task[]> = {};
  tasks.filter(t => !!t.parent_task_id).forEach(t => {
    if (!subtaskMap[t.parent_task_id!]) subtaskMap[t.parent_task_id!] = [];
    subtaskMap[t.parent_task_id!].push(t);
  });

  // Date range
  const allDates = tasks.flatMap(t =>
    [parseDate(t.planned_start), parseDate(t.planned_end)].filter(Boolean) as Date[],
  );
  const baseDate = allDates.length > 0
    ? new Date(Math.min(...allDates.map(d => d.getTime())))
    : new Date();

  const NUM_WEEKS = 12;
  const NUM_DAYS  = NUM_WEEKS * 7;
  const weekStart = startOfISOWeek(baseDate);
  const days      = Array.from({ length: NUM_DAYS }, (_, i) => addDays(weekStart, i));
  const weekGroups = buildWeekGroups(days);
  const totalGridWidth = CELL_W * NUM_DAYS;

  // Today offset
  const today        = localMidnight();
  const todayOffset  = Math.round((today.getTime() - weekStart.getTime()) / 86400000);
  const todayVisible = todayOffset >= 0 && todayOffset < NUM_DAYS;
  const todayLeft    = todayOffset * CELL_W;

  function getBarProps(task: Task) {
    const start = parseDate(task.planned_start);
    const end   = parseDate(task.planned_end);
    if (!start) return null;
    const startOff = Math.round((start.getTime() - weekStart.getTime()) / 86400000);
    const endOff   = end
      ? Math.round((end.getTime() - weekStart.getTime()) / 86400000) + 1
      : startOff + 1;
    if (endOff < 0 || startOff >= NUM_DAYS) return null;
    const cs = Math.max(0, startOff);
    const ce = Math.min(endOff, NUM_DAYS);
    return { left: cs * CELL_W, width: Math.max(CELL_W - 2, (ce - cs) * CELL_W - 2) };
  }

  type Row = { type: 'project'; project: Project } | { type: 'task'; task: Task; depth: number; isLast: boolean };
  const rows: Row[] = [];
  visibleProjects.forEach(project => {
    rows.push({ type: 'project', project });
    const pts = mainTasks.filter(t => t.project_id === project.id);
    pts.forEach(task => {
      const subs = subtaskMap[task.id] ?? [];
      rows.push({ type: 'task', task, depth: 0, isLast: false });
      subs.forEach((sub, si) => {
        rows.push({ type: 'task', task: sub, depth: 1, isLast: si === subs.length - 1 });
      });
    });
  });

  // ── Excel export with styling ─────────────────────────────────────────────────
  async function handleExportExcel() {
    setExporting(true);
    try {
      const assigneeIds = [...new Set(tasks.map(t => t.assigned_to).filter(Boolean) as string[])];
      const profileMap: Record<string, string> = {};
      if (assigneeIds.length > 0) {
        const { data } = await supabase.from('profiles').select('id,full_name').in('id', assigneeIds);
        (data ?? []).forEach(p => { profileMap[p.id] = p.full_name; });
      }
      const projectNameMap: Record<string, string> = {};
      const projectColorMap: Record<string, string> = {};
      projects.forEach(p => {
        projectNameMap[p.id] = p.name;
        projectColorMap[p.id] = p.color;
      });

      // Sheet 1 — Gantt Chart
      type GRow = (string | number)[];
      const ganttData: GRow[] = [['#', 'Activity', 'Type', 'Planned Start', 'Planned End', 'Duration (days)', 'Status', 'Est. Hours', 'Assignee']];
      const projectRows: number[] = [];
      let n = 0;
      let currentRow = 1;

      visibleProjects.forEach(project => {
        projectRows.push(currentRow);
        ganttData.push(['', project.name.toUpperCase(), 'PROJECT', '', '', '', '', '', '']);
        currentRow++;

        mainTasks.filter(t => t.project_id === project.id).forEach(task => {
          n++;
          const assignee = task.assigned_to ? (profileMap[task.assigned_to] ?? 'Unknown') : '';
          ganttData.push([
            n, task.title, 'Task',
            fmtForExcel(task.planned_start), fmtForExcel(task.planned_end),
            durationDays(task.planned_start, task.planned_end),
            STATUS_LABEL[task.status] ?? task.status,
            task.estimated_hours ?? '',
            assignee
          ]);
          currentRow++;

          (subtaskMap[task.id] ?? []).forEach(sub => {
            const subAssignee = sub.assigned_to ? (profileMap[sub.assigned_to] ?? 'Unknown') : '';
            ganttData.push([
              '', `  ↳ ${sub.title}`, 'Subtask',
              fmtForExcel(sub.planned_start), fmtForExcel(sub.planned_end),
              durationDays(sub.planned_start, sub.planned_end),
              STATUS_LABEL[sub.status] ?? sub.status,
              sub.estimated_hours ?? '',
              subAssignee
            ]);
            currentRow++;
          });
        });
      });

      const ganttSheet = XLSX.utils.aoa_to_sheet(ganttData);
      ganttSheet['!cols'] = [
        { wch: 5 }, { wch: 42 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 20 },
      ];

      // Apply styles to cells
      const headerStyle = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '1E3A5F' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
          top: { style: 'thin', color: { rgb: '1E3A5F' } },
          bottom: { style: 'thin', color: { rgb: '1E3A5F' } },
          left: { style: 'thin', color: { rgb: 'CCCCCC' } },
          right: { style: 'thin', color: { rgb: 'CCCCCC' } }
        }
      };

      const projectStyle = (projectColor: string) => ({
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
        fill: { fgColor: { rgb: projectColor.replace('#', '') } },
        alignment: { horizontal: 'left', vertical: 'center' },
        border: {
          top: { style: 'medium' },
          bottom: { style: 'medium' },
          left: { style: 'thin' },
          right: { style: 'thin' }
        }
      });

      const statusStyles: Record<string, XLSX.CellStyle> = {
        todo: {
          fill: { fgColor: { rgb: 'F1F5F9' } },
          font: { color: { rgb: '64748B' } }
        },
        doing: {
          fill: { fgColor: { rgb: 'FEF3C7' } },
          font: { color: { rgb: '92400E' } }
        },
        done: {
          fill: { fgColor: { rgb: 'D1FAE5' } },
          font: { color: { rgb: '065F46' } }
        },
        hold: {
          fill: { fgColor: { rgb: 'FEE2E2' } },
          font: { color: { rgb: '991B1B' } }
        }
      };

      const cellStyle = {
        border: {
          top: { style: 'thin', color: { rgb: 'E5E7EB' } },
          bottom: { style: 'thin', color: { rgb: 'E5E7EB' } },
          left: { style: 'thin', color: { rgb: 'E5E7EB' } },
          right: { style: 'thin', color: { rgb: 'E5E7EB' } }
        },
        alignment: { vertical: 'center' }
      };

      // Apply header styles
      const range = XLSX.utils.decode_range(ganttSheet['!ref'] || 'A1:I1');
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
        if (ganttSheet[cellAddress]) {
          ganttSheet[cellAddress].s = headerStyle;
        }
      }

      // Apply project and task styles
      const dataRange = XLSX.utils.decode_range(ganttSheet['!ref'] || 'A1:I1');
      let projectIdx = 0;
      for (let row = 1; row <= dataRange.e.r; row++) {
        const typeCell = ganttSheet[XLSX.utils.encode_cell({ r: row, c: 2 })];
        const isProjectRow = typeCell?.v === 'PROJECT';

        if (isProjectRow && projectIdx < visibleProjects.length) {
          const project = visibleProjects[projectIdx];
          const projectColor = projectColorMap[project.id]?.replace('#', '') || '3B82F6';
          const style = {
            font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
            fill: { fgColor: { rgb: projectColor } },
            alignment: { horizontal: 'left', vertical: 'center' }
          };

          for (let col = range.s.c; col <= range.e.c; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
            if (ganttSheet[cellAddress]) {
              ganttSheet[cellAddress].s = style;
            }
          }
          projectIdx++;
        } else {
          // Apply status-based coloring to task/subtask rows
          const statusCell = ganttSheet[XLSX.utils.encode_cell({ r: row, c: 6 })];
          const statusValue = String(statusCell?.v || '').toLowerCase();
          const statusKey = Object.keys(STATUS_LABEL).find(k =>
            STATUS_LABEL[k].toLowerCase() === statusValue || k === statusValue
          );

          for (let col = range.s.c; col <= range.e.c; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
            if (ganttSheet[cellAddress]) {
              ganttSheet[cellAddress].s = {
                ...cellStyle,
                ...(statusKey ? statusStyles[statusKey] : {})
              };
            }
          }
        }
      }

      // Sheet 2 — All Tasks
      const allData: (string | number)[][] = [
        ['Project', 'Title', 'Type', 'Parent Task', 'Description', 'Status', 'Assignee',
         'Planned Start', 'Planned End', 'Actual Start', 'Actual End', 'Est. Hours', 'Progress'],
      ];
      let taskNum = 0;
      visibleProjects.forEach(project => {
        mainTasks.filter(t => t.project_id === project.id).forEach(task => {
          taskNum++;
          const subs = subtaskMap[task.id] ?? [];
          const doneSubs = subs.filter(s => s.status === 'done').length;
          const progress = subs.length > 0 ? `${doneSubs}/${subs.length}` : '';
          allData.push([
            projectNameMap[task.project_id] ?? '', task.title, 'Task', '',
            task.description ?? '', STATUS_LABEL[task.status] ?? task.status,
            task.assigned_to ? (profileMap[task.assigned_to] ?? task.assigned_to) : 'Unassigned',
            fmtForExcel(task.planned_start), fmtForExcel(task.planned_end),
            fmtForExcel(task.actual_start), fmtForExcel(task.actual_end),
            task.estimated_hours ?? '', progress
          ]);
          (subtaskMap[task.id] ?? []).forEach(sub => {
            allData.push([
              projectNameMap[sub.project_id] ?? '', sub.title, 'Subtask', task.title,
              sub.description ?? '', STATUS_LABEL[sub.status] ?? sub.status,
              sub.assigned_to ? (profileMap[sub.assigned_to] ?? sub.assigned_to) : 'Unassigned',
              fmtForExcel(sub.planned_start), fmtForExcel(sub.planned_end),
              fmtForExcel(sub.actual_start), fmtForExcel(sub.actual_end),
              sub.estimated_hours ?? '', ''
            ]);
          });
        });
      });
      const allSheet = XLSX.utils.aoa_to_sheet(allData);
      allSheet['!cols'] = [
        { wch: 22 }, { wch: 38 }, { wch: 10 }, { wch: 30 }, { wch: 40 },
        { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 10 },
      ];

      // Apply styles to All Tasks sheet
      const allRange = XLSX.utils.decode_range(allSheet['!ref'] || 'A1:M1');
      for (let col = allRange.s.c; col <= allRange.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
        if (allSheet[cellAddress]) {
          allSheet[cellAddress].s = headerStyle;
        }
      }

      // Apply status-based formatting to All Tasks sheet
      for (let row = 1; row <= allRange.e.r; row++) {
        const statusCell = allSheet[XLSX.utils.encode_cell({ r: row, c: 5 })];
        const statusValue = String(statusCell?.v || '').toLowerCase();
        const statusKey = Object.keys(STATUS_LABEL).find(k =>
          STATUS_LABEL[k].toLowerCase() === statusValue || k === statusValue
        );

        for (let col = allRange.s.c; col <= allRange.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
          if (allSheet[cellAddress]) {
            allSheet[cellAddress].s = {
              ...cellStyle,
              ...(statusKey ? statusStyles[statusKey] : {})
            };
          }
        }
      }

      // Sheet 3 — Summary Dashboard
      const summaryData: (string | number)[][] = [
        ['PROJECT GANTT SUMMARY REPORT'],
        [''],
        ['Report Date:', new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })],
        [''],
        ['PROJECTS', '', ''],
        ['Project Name', 'Total Tasks', 'Completed'],
      ];

      visibleProjects.forEach(project => {
        const projTasks = mainTasks.filter(t => t.project_id === project.id);
        const doneCount = projTasks.filter(t => t.status === 'done').length;
        const allProjTasks = tasks.filter(t => t.project_id === project.id);
        const totalIncludingSubtasks = allProjTasks.length;
        summaryData.push([project.name, projTasks.length, doneCount]);
      });

      const totalTasks = tasks.length;
      const doneTasks = tasks.filter(t => t.status === 'done').length;
      const doingTasks = tasks.filter(t => t.status === 'doing').length;
      const todoTasks = tasks.filter(t => t.status === 'todo').length;
      const holdTasks = tasks.filter(t => t.status === 'hold').length;
      const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

      summaryData.push(['']);
      summaryData.push(['OVERALL STATISTICS']);
      summaryData.push(['Total Tasks', totalTasks]);
      summaryData.push(['Completed', doneTasks]);
      summaryData.push(['In Progress', doingTasks]);
      summaryData.push(['To Do', todoTasks]);
      summaryData.push(['On Hold', holdTasks]);
      summaryData.push(['Completion Rate', `${completionRate}%`]);

      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      summarySheet['!cols'] = [
        { wch: 18 }, { wch: 14 }, { wch: 14 }
      ];

      // Style summary sheet
      const summaryRange = XLSX.utils.decode_range(summarySheet['!ref'] || 'A1:C1');
      const titleCell = summarySheet['A1'];
      if (titleCell) {
        titleCell.s = {
          font: { bold: true, sz: 16, color: { rgb: '1E3A5F' } },
          alignment: { horizontal: 'center' }
        };
      }

      const sectionHeaders = [5, 11];
      sectionHeaders.forEach(row => {
        const cell = summarySheet[XLSX.utils.encode_cell({ r: row, c: 0 })];
        if (cell) {
          cell.s = {
            font: { bold: true, color: { rgb: 'FFFFFF' } },
            fill: { fgColor: { rgb: '3B82F6' } }
          };
        }
      });

      // Style the header row
      for (let col = 0; col <= 2; col++) {
        const cell = summarySheet[XLSX.utils.encode_cell({ r: 5, c: col })];
        if (cell) {
          cell.s = {
            font: { bold: true },
            fill: { fgColor: { rgb: 'E5E7EB' } },
            border: {
              top: { style: 'thin' },
              bottom: { style: 'thin' },
              left: { style: 'thin' },
              right: { style: 'thin' }
            }
          };
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
      XLSX.utils.book_append_sheet(wb, ganttSheet, 'Gantt Chart');
      XLSX.utils.book_append_sheet(wb, allSheet, 'All Tasks');

      const slug = filterProjectId
        ? (projects.find(p => p.id === filterProjectId)?.name ?? 'project').replace(/\s+/g, '_')
        : 'all_projects';
      XLSX.writeFile(wb, `gantt-${slug}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  const hasAnyTask = rows.some(r => r.type === 'task');
  if (!hasAnyTask) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-16 flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
            <Calendar className="w-7 h-7 text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-gray-500">No tasks with planned dates</p>
          <p className="text-xs text-gray-400 max-w-xs">
            Set a planned start and end date on any task to see it appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

      {/* ── Top bar ── */}
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-4 bg-gradient-to-r from-slate-50 to-white">
        <div className="flex items-center gap-3">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold text-gray-700">
            {fmtShort(weekStart)} — {fmtShort(addDays(weekStart, NUM_DAYS - 1))}
          </span>
          <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {NUM_WEEKS} weeks
          </span>
          {todayVisible && (
            <span className="text-[11px] text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
              Today: {fmtShort(today)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Legend */}
          <div className="hidden sm:flex items-center gap-3">
            {Object.entries(STATUS_LABEL).map(([status, label]) => (
              <div key={status} className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ background: STATUS_BAR_GRADIENT[status] }}
                />
                <span className="text-[11px] text-gray-500">{label}</span>
              </div>
            ))}
          </div>

          <button
            onClick={handleExportExcel}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm shadow-emerald-500/25"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
        </div>
      </div>

      {/* ── Scrollable area ── */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: LEFT_W + totalGridWidth }}>

          {/* ── Week header ── */}
          <div
            className="flex border-b border-slate-700/60 sticky top-0 z-20"
            style={{ background: '#1e293b', height: HDR1_H }}
          >
            {/* Left panel header */}
            <div className="flex flex-shrink-0 items-stretch" style={{ width: LEFT_W }}>
              <div
                className="flex items-center px-4 border-r border-slate-700/50 text-[11px] font-semibold text-slate-300 uppercase tracking-wider"
                style={{ width: COL_ACT }}
              >
                Activity
              </div>
              <div
                className="flex items-center px-3 border-r border-slate-700/50 text-[11px] font-semibold text-slate-300 uppercase tracking-wider"
                style={{ width: COL_S }}
              >
                Start
              </div>
              <div
                className="flex items-center px-3 border-r border-slate-700/50 text-[11px] font-semibold text-slate-300 uppercase tracking-wider"
                style={{ width: COL_E }}
              >
                End
              </div>
            </div>

            {/* Week cells */}
            <div className="flex" style={{ width: totalGridWidth }}>
              {weekGroups.map((wg, wi) => (
                <div
                  key={wi}
                  style={{ width: wg.days.length * CELL_W }}
                  className="flex-shrink-0 flex items-center justify-center border-r border-slate-700/40"
                >
                  <span className="text-[10px] font-bold text-slate-200 tracking-widest">
                    W{String(wg.weekNum).padStart(2, '0')}
                  </span>
                  <span className="text-[9px] text-slate-500 ml-1.5 hidden sm:inline">
                    {wg.days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Day header ── */}
          <div
            className="flex border-b border-slate-600/40 sticky z-10"
            style={{ background: '#334155', top: HDR1_H, height: HDR2_H }}
          >
            <div className="flex-shrink-0 border-r border-slate-600/40" style={{ width: LEFT_W }} />
            <div className="flex" style={{ width: totalGridWidth }}>
              {days.map((d, i) => {
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const isToday   = todayVisible && i === todayOffset;
                const dayAbbr   = ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()];
                return (
                  <div
                    key={i}
                    style={{ width: CELL_W }}
                    className={`flex-shrink-0 flex flex-col items-center justify-center border-r text-center transition-colors ${
                      isToday
                        ? 'border-blue-400/60 bg-blue-500/20'
                        : isWeekend
                        ? 'border-slate-600/30 bg-slate-700/30'
                        : 'border-slate-600/20'
                    }`}
                  >
                    <span className={`text-[8px] font-semibold leading-none mb-0.5 ${
                      isToday ? 'text-blue-300' : isWeekend ? 'text-slate-500' : 'text-slate-400'
                    }`}>
                      {dayAbbr}
                    </span>
                    <span className={`text-[10px] font-bold leading-none ${
                      isToday ? 'text-blue-200' : isWeekend ? 'text-slate-500' : 'text-slate-200'
                    }`}>
                      {d.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Data rows ── */}
          {rows.map((row, idx) => {

            // Project header row
            if (row.type === 'project') {
              const { project } = row;
              const taskCount = mainTasks.filter(t => t.project_id === project.id).length;
              const doneCount = mainTasks.filter(t => t.project_id === project.id && t.status === 'done').length;
              return (
                <div
                  key={`proj-${project.id}-${idx}`}
                  className="flex items-stretch border-b border-gray-200"
                  style={{ height: ROW_H, background: `${project.color}0d` }}
                >
                  {/* Left panel */}
                  <div
                    className="flex items-center flex-shrink-0 border-r border-gray-200"
                    style={{ width: LEFT_W, borderLeft: `3px solid ${project.color}` }}
                  >
                    <div
                      className="flex items-center gap-2.5 px-3"
                      style={{ width: COL_ACT }}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-sm"
                        style={{ backgroundColor: project.color }}
                      />
                      <span className="text-xs font-bold text-gray-800 truncate">{project.name}</span>
                      {taskCount > 0 && (
                        <span
                          className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{
                            backgroundColor: `${project.color}22`,
                            color: project.color,
                          }}
                        >
                          {doneCount}/{taskCount}
                        </span>
                      )}
                    </div>
                    <div
                      className="flex items-center px-3 border-l border-gray-100"
                      style={{ width: COL_S }}
                    />
                    <div
                      className="flex items-center px-3 border-l border-gray-100"
                      style={{ width: COL_E }}
                    />
                  </div>

                  {/* Grid */}
                  <div className="relative flex" style={{ width: totalGridWidth }}>
                    {days.map((d, i) => {
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      const isToday   = todayVisible && i === todayOffset;
                      return (
                        <div
                          key={i}
                          style={{ width: CELL_W }}
                          className={`flex-shrink-0 border-r ${
                            isToday
                              ? 'border-blue-300/50 bg-blue-50/40'
                              : isWeekend
                              ? 'border-gray-200 bg-gray-100/50'
                              : 'border-gray-100'
                          }`}
                        />
                      );
                    })}
                    {/* Today line */}
                    {todayVisible && (
                      <div
                        className="absolute inset-y-0 pointer-events-none"
                        style={{ left: todayLeft + CELL_W / 2 - 1, width: 2, background: 'rgba(59,130,246,0.35)' }}
                      />
                    )}
                  </div>
                </div>
              );
            }

            // Task / subtask row
            const { task, depth, isLast } = row;
            const bar = getBarProps(task);
            const badge = STATUS_BADGE[task.status] ?? STATUS_BADGE.todo;
            const subs  = subtaskMap[task.id] ?? [];
            const doneSubtasks = subs.filter(s => s.status === 'done').length;
            const progress = subs.length > 0 ? Math.round((doneSubtasks / subs.length) * 100) : null;

            return (
              <div
                key={`task-${task.id}-${idx}`}
                className="flex items-stretch border-b border-gray-50 hover:bg-blue-50/20 transition-colors group"
                style={{ height: ROW_H }}
              >
                {/* Left panel */}
                <div
                  className="flex items-center flex-shrink-0 border-r border-gray-100"
                  style={{ width: LEFT_W }}
                >
                  {/* Activity */}
                  <div
                    className="flex items-center min-w-0 px-3 gap-2"
                    style={{ width: COL_ACT }}
                  >
                    {depth === 0 ? (
                      <>
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: STATUS_DOT[task.status] ?? '#94a3b8' }}
                        />
                        <span className="text-xs font-medium text-gray-800 truncate leading-none">{task.title}</span>
                        {subs.length > 0 && (
                          <span className="flex-shrink-0 text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                            {subs.length}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        {/* Tree lines */}
                        <div className="flex-shrink-0 flex items-center" style={{ width: 22 }}>
                          <div className="relative" style={{ width: 16, height: ROW_H }}>
                            {/* Vertical connector */}
                            {!isLast && (
                              <div
                                className="absolute left-2"
                                style={{ top: 0, bottom: 0, width: 1, background: '#cbd5e1' }}
                              />
                            )}
                            {/* Elbow: partial vertical + horizontal */}
                            <div
                              className="absolute left-2"
                              style={{ top: 0, height: ROW_H / 2, width: 1, background: '#cbd5e1' }}
                            />
                            <div
                              className="absolute"
                              style={{ top: ROW_H / 2, left: 8, right: 0, height: 1, background: '#cbd5e1' }}
                            />
                          </div>
                        </div>
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: STATUS_DOT[task.status] ?? '#94a3b8' }}
                        />
                        <span className="text-[11px] text-gray-600 truncate leading-none">{task.title}</span>
                      </>
                    )}
                  </div>

                  {/* Start */}
                  <div
                    className="flex items-center px-3 border-l border-gray-100"
                    style={{ width: COL_S }}
                  >
                    {task.planned_start ? (
                      <span className={`text-[11px] ${depth === 0 ? 'text-gray-600' : 'text-gray-400'}`}>
                        {fmtDate(task.planned_start)}
                      </span>
                    ) : (
                      <span className="text-[11px] text-gray-300">—</span>
                    )}
                  </div>

                  {/* End */}
                  <div
                    className="flex items-center px-3 border-l border-gray-100"
                    style={{ width: COL_E }}
                  >
                    {task.planned_end ? (
                      <div className="flex flex-col gap-0.5">
                        <span className={`text-[11px] ${depth === 0 ? 'text-gray-600' : 'text-gray-400'}`}>
                          {fmtDate(task.planned_end)}
                        </span>
                        {task.estimated_hours && depth === 0 && (
                          <span className="flex items-center gap-0.5 text-[9px] text-gray-400">
                            <Clock className="w-2.5 h-2.5" />
                            {task.estimated_hours}h
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] text-gray-300">—</span>
                    )}
                  </div>
                </div>

                {/* Grid + bar */}
                <div className="relative flex flex-shrink-0" style={{ width: totalGridWidth }}>
                  {/* Day cells */}
                  {days.map((d, i) => {
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    const isToday   = todayVisible && i === todayOffset;
                    return (
                      <div
                        key={i}
                        style={{ width: CELL_W }}
                        className={`flex-shrink-0 border-r h-full ${
                          isToday
                            ? 'border-blue-300/50 bg-blue-50/30'
                            : isWeekend
                            ? 'border-gray-100 bg-gray-50/70'
                            : 'border-gray-50'
                        }`}
                      />
                    );
                  })}

                  {/* Today vertical line */}
                  {todayVisible && (
                    <div
                      className="absolute inset-y-0 pointer-events-none z-10"
                      style={{ left: todayLeft + CELL_W / 2 - 1, width: 2, background: 'rgba(59,130,246,0.25)' }}
                    />
                  )}

                  {/* Task bar */}
                  {bar && (
                    <div
                      className="absolute flex items-center overflow-hidden"
                      style={{
                        left: bar.left + 2,
                        width: bar.width,
                        top: depth === 0 ? '50%' : '50%',
                        transform: 'translateY(-50%)',
                        height: depth === 0 ? 22 : 14,
                        borderRadius: depth === 0 ? 6 : 4,
                        background: STATUS_BAR_GRADIENT[task.status] ?? STATUS_BAR_GRADIENT.todo,
                        boxShadow: depth === 0
                          ? '0 1px 4px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.2)'
                          : '0 1px 2px rgba(0,0,0,0.12)',
                      }}
                      title={`${task.title} (${STATUS_LABEL[task.status] ?? task.status})`}
                    >
                      {/* Progress overlay for done */}
                      {task.status === 'done' && (
                        <div
                          className="absolute inset-0 rounded-md"
                          style={{ background: 'rgba(255,255,255,0.12)' }}
                        />
                      )}

                      {/* Subtask progress fill */}
                      {progress !== null && depth === 0 && (
                        <div
                          className="absolute inset-0"
                          style={{
                            width: `${progress}%`,
                            background: 'rgba(255,255,255,0.15)',
                            borderRadius: '6px 0 0 6px',
                          }}
                        />
                      )}

                      {/* Bar label */}
                      {bar.width >= 72 && depth === 0 && (
                        <span
                          className="px-2 text-[10px] font-semibold truncate leading-none select-none pointer-events-none"
                          style={{ color: 'rgba(255,255,255,0.95)', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
                        >
                          {task.title}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Status badge (shows on row hover if no bar) */}
                  {!bar && (
                    <div
                      className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: badge.bg, color: badge.text }}
                      >
                        {STATUS_LABEL[task.status] ?? task.status} · no dates
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Today pin at the top of grid */}
          {todayVisible && (
            <div
              className="sticky bottom-0 left-0 pointer-events-none z-30"
              style={{ height: 0 }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: LEFT_W + todayLeft + CELL_W / 2 - 1,
                  bottom: 0,
                  top: -(rows.length * ROW_H + HDR1_H + HDR2_H),
                  width: 2,
                  background: 'linear-gradient(180deg, rgba(59,130,246,0.7) 0%, rgba(59,130,246,0.15) 100%)',
                  pointerEvents: 'none',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: LEFT_W + todayLeft + CELL_W / 2 - 22,
                  top: -(rows.length * ROW_H + HDR1_H + HDR2_H),
                  background: '#3b82f6',
                  color: '#fff',
                  fontSize: 9,
                  fontWeight: 700,
                  padding: '2px 5px',
                  borderRadius: 4,
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.03em',
                }}
              >
                TODAY
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
