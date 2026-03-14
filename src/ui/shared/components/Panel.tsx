interface PanelProps {
  title: string;
  /** Content rendered to the right of the title in the header */
  headerRight?: React.ReactNode;
  /** Extra content rendered below the title row but still inside the header */
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Padding applied to the content area (default: none) */
  contentClassName?: string;
  /** Whether the content area should scroll (default: true) */
  scroll?: boolean;
}

export function Panel({
  title,
  headerRight,
  headerExtra,
  children,
  className,
  contentClassName,
  scroll = true,
}: PanelProps) {
  return (
    <div className={`bg-slate-800/50 rounded-lg border border-slate-700 flex flex-col ${className ?? ''}`}>
      <div className="px-3 py-2 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <div className="text-slate-500 text-[10px] uppercase tracking-wider">{title}</div>
          {headerRight}
        </div>
        {headerExtra}
      </div>
      <div className={`flex-1 ${scroll ? 'overflow-y-auto' : ''} ${contentClassName ?? ''}`}>{children}</div>
    </div>
  );
}
