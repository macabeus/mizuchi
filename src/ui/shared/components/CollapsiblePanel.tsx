import { useState } from 'react';

interface CollapsiblePanelProps {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export function CollapsiblePanel({ title, children, defaultExpanded = false }: CollapsiblePanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-sm text-slate-300 hover:bg-slate-700/30 transition-colors"
      >
        <span className="font-medium">{title}</span>
        <span className="text-slate-500">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}
