import type React from 'react';

export interface Column<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T, index: number) => React.ReactNode;
  align?: 'left' | 'right';
  width?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  selectedKey?: string | null;
  onRowClick?: (row: T) => void;
  className?: string;
  style?: React.CSSProperties;
}

export function Table<T>({ columns, rows, rowKey, selectedKey, onRowClick, className, style }: TableProps<T>) {
  return (
    <div
      className={`bg-slate-800/50 rounded-xl border border-slate-700 overflow-auto ${className ?? ''}`}
      style={style}
    >
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider">
            {columns.map((col) => (
              <th
                key={col.id}
                className={`${col.align === 'right' ? 'text-right' : 'text-left'} px-3 py-2.5 ${col.width ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const key = rowKey(row);
            const isSelected = selectedKey != null && key === selectedKey;
            return (
              <tr
                key={key}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`${onRowClick ? 'cursor-pointer' : ''} border-b border-slate-800 transition-colors ${
                  isSelected ? 'bg-yellow-500/10 text-white' : 'text-slate-300 hover:bg-slate-700/40'
                }`}
              >
                {columns.map((col) => (
                  <td key={col.id} className={`px-3 py-1.5 ${col.align === 'right' ? 'text-right' : ''}`}>
                    {col.cell(row, idx)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
