import { useState, useRef } from 'react';
import { X, Upload, Download, FileSpreadsheet, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Project, TaskStatus } from '../../types';

interface Props {
  projects: Project[];
  defaultProjectId?: string;
  onClose: () => void;
  onImported: () => void;
}

interface ParsedTask {
  title: string;
  description?: string;
  status: TaskStatus;
  planned_start?: string;
  planned_end?: string;
  actual_start?: string;
  actual_end?: string;
  estimated_hours?: number;
  parent_task_title?: string;
}

const TASK_TEMPLATE_COLUMNS = [
  'Title*',
  'Description',
  'Status (todo/doing/done/hold)',
  'Planned Start (YYYY-MM-DD HH:mm)',
  'Planned End (YYYY-MM-DD HH:mm)',
  'Actual Start (YYYY-MM-DD HH:mm)',
  'Actual End (YYYY-MM-DD HH:mm)',
  'Estimated Hours',
  'Parent Task Title',
];

function parseExcelCSV(text: string): ParsedTask[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[*"]/g, ''));
  const tasks: ParsedTask[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0 || !values[0]?.trim()) continue;

    const task: ParsedTask = {
      title: values[0]?.trim() || '',
      description: getValue(header, values, 'description'),
      status: parseStatus(getValue(header, values, 'status')),
      planned_start: parseDateTime(getValue(header, values, 'planned start')),
      planned_end: parseDateTime(getValue(header, values, 'planned end')),
      actual_start: parseDateTime(getValue(header, values, 'actual start')),
      actual_end: parseDateTime(getValue(header, values, 'actual end')),
      estimated_hours: parseFloat(getValue(header, values, 'estimated hours')) || undefined,
      parent_task_title: getValue(header, values, 'parent task title'),
    };

    if (task.title) {
      tasks.push(task);
    }
  }

  return tasks;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function getValue(header: string[], values: string[], searchKey: string): string {
  const key = searchKey.toLowerCase();
  for (let i = 0; i < header.length; i++) {
    if (header[i].includes(key)) {
      return values[i]?.trim() || '';
    }
  }
  return '';
}

function parseStatus(val: string): TaskStatus {
  const s = val.toLowerCase();
  if (s === 'doing' || s === 'in progress') return 'doing';
  if (s === 'done' || s === 'completed') return 'done';
  if (s === 'hold' || s === 'on hold') return 'hold';
  return 'todo';
}

function parseDateTime(val: string): string | undefined {
  if (!val) return undefined;
  // Try parsing various formats
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    return d.toISOString();
  }
  return undefined;
}

function downloadTemplate() {
  const header = TASK_TEMPLATE_COLUMNS.join(',');
  const example = '"Example Task","Task description here","todo","2024-01-15 09:00","2024-01-15 17:00","","",8,"Parent Task"';
  const content = `${header}\n${example}`;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'task_import_template.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function TaskImportModal({ projects, defaultProjectId, onClose, onImported }: Props) {
  const { user } = useAuth();
  const [projectId, setProjectId] = useState(defaultProjectId ?? (projects[0]?.id ?? ''));
  const [file, setFile] = useState<File | null>(null);
  const [parsedTasks, setParsedTasks] = useState<ParsedTask[]>([]);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(0);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFile(droppedFile);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) handleFile(selectedFile);
  }

  async function handleFile(f: File) {
    setFile(f);
    setError('');
    setParsedTasks([]);

    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext || '')) {
      setError('Please upload a CSV file. Excel files (.xlsx, .xls) are not supported.');
      return;
    }

    try {
      const text = await f.text();
      const tasks = parseExcelCSV(text);
      if (tasks.length === 0) {
        setError('No valid tasks found in file. Make sure the first column contains task titles.');
      } else {
        setParsedTasks(tasks);
      }
    } catch (err) {
      setError('Failed to read file. Please ensure it\'s a valid CSV file.');
    }
  }

  async function handleImport() {
    if (parsedTasks.length === 0 || !projectId) return;
    setImporting(true);
    setError('');
    let successCount = 0;

    // Get existing tasks to find parent task IDs
    const { data: existingTasks } = await supabase
      .from('tasks')
      .select('id, title')
      .eq('project_id', projectId);

    const taskTitleToId = new Map<string, string>();
    (existingTasks || []).forEach(t => {
      if (t.title) taskTitleToId.set(t.title.toLowerCase(), t.id);
    });

    // Import tasks
    for (const task of parsedTasks) {
      let parentTaskId: string | undefined;
      if (task.parent_task_title) {
        parentTaskId = taskTitleToId.get(task.parent_task_title.toLowerCase());
      }

      const { error } = await supabase.from('tasks').insert({
        project_id: projectId,
        title: task.title,
        description: task.description || null,
        status: task.status,
        planned_start: task.planned_start || null,
        planned_end: task.planned_end || null,
        actual_start: task.actual_start || null,
        actual_end: task.actual_end || null,
        estimated_hours: task.estimated_hours || null,
        parent_task_id: parentTaskId || null,
        created_by: user!.id,
      });

      if (!error) successCount++;
    }

    setImporting(false);
    setImported(successCount);
    if (successCount === parsedTasks.length) {
      setTimeout(() => {
        onImported();
        onClose();
      }, 1500);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900">Import Tasks</h2>
            <p className="text-xs text-gray-400 mt-0.5">Upload CSV file with task data</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Project selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Import to Project *</label>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Download template */}
          <button
            onClick={downloadTemplate}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Download Template (CSV)
          </button>

          {/* File drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative flex flex-col items-center justify-center gap-2 px-6 py-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
              dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-gray-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            {file ? (
              <>
                <FileSpreadsheet className="w-8 h-8 text-blue-500" />
                <p className="text-sm font-medium text-gray-700">{file.name}</p>
                <p className="text-xs text-gray-400">Click to select a different file</p>
              </>
            ) : (
              <>
                <Upload className="w-8 h-8 text-gray-300" />
                <p className="text-sm text-gray-500">Drop your CSV file here</p>
                <p className="text-xs text-gray-400">or click to browse</p>
              </>
            )}
          </div>

          {/* Parsed tasks preview */}
          {parsedTasks.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  {parsedTasks.length} task{parsedTasks.length !== 1 ? 's' : ''} found
                </span>
                {imported > 0 && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600">
                    <CheckCircle className="w-3.5 h-3.5" />
                    {imported}/{parsedTasks.length} imported
                  </span>
                )}
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {parsedTasks.slice(0, 5).map((task, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-4 h-4 rounded bg-blue-100 text-blue-600 flex items-center justify-center font-medium">
                      {i + 1}
                    </span>
                    <span className="text-gray-700 truncate">{task.title}</span>
                    <span className="text-gray-400">{task.status}</span>
                  </div>
                ))}
                {parsedTasks.length > 5 && (
                  <p className="text-xs text-gray-400 pl-6">...and {parsedTasks.length - 5} more</p>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t flex-shrink-0">
          <button
            onClick={onClose}
            disabled={importing}
            className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={importing || parsedTasks.length === 0}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {importing ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Importing...
              </>
            ) : imported > 0 ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Imported {imported}
              </>
            ) : (
              `Import ${parsedTasks.length || 0} Tasks`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
