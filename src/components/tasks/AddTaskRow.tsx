import { useState, useRef, useEffect } from 'react';
import { Check, X } from 'lucide-react';

interface Props {
  label: string;
  onSave: (title: string) => Promise<void>;
  onCancel: () => void;
}

export default function AddTaskRow({ label, onSave, onCancel }: Props) {
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSave() {
    if (!title.trim()) {
      onCancel();
      return;
    }
    setSaving(true);
    await onSave(title.trim());
    setSaving(false);
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
      <input
        ref={inputRef}
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder={label}
        className="flex-1 text-sm bg-transparent focus:outline-none text-gray-800 placeholder-gray-400"
      />
      <button
        onClick={handleSave}
        disabled={saving}
        className="p-1 text-blue-600 hover:text-blue-800 disabled:opacity-50"
      >
        <Check className="w-4 h-4" />
      </button>
      <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
