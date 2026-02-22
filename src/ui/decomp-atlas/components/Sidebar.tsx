import type { KappaDb } from '@shared/kappa-db';
import { Icon } from '@ui-shared/components/Icon';
import { useMemo, useState } from 'react';

import { useKappaDb } from '../KappaDbContext';

interface SidebarProps {
  selectedPath: string | null;
  onPathSelect: (path: string | null) => void;
}

interface TreeNode {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  functionCount: number;
  decompiledCount: number;
  isFolder: boolean;
}

function buildFileTree(db: KappaDb): TreeNode {
  const root: TreeNode = {
    name: '',
    path: '',
    children: new Map(),
    functionCount: 0,
    decompiledCount: 0,
    isFolder: true,
  };

  for (const fn of db.functions) {
    const filePath = fn.cModulePath || fn.asmModulePath;
    const parts = filePath.split('/');

    let current = root;
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          path: currentPath,
          children: new Map(),
          functionCount: 0,
          decompiledCount: 0,
          isFolder: !part.includes('.'),
        });
      }

      const child = current.children.get(part)!;
      child.functionCount++;
      if (fn.cCode) {
        child.decompiledCount++;
      }
      current = child;
    }

    root.functionCount++;
    if (fn.cCode) {
      root.decompiledCount++;
    }
  }

  return root;
}

function TreeNodeComponent({
  node,
  depth,
  selectedPath,
  onPathSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onPathSelect: (path: string | null) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(depth < 1);
  const isFolder = node.isFolder;
  const isSelected = selectedPath === node.path;
  const sortedChildren = useMemo(
    () =>
      Array.from(node.children.values()).sort((a, b) => {
        // Folders first, then files
        if (a.isFolder !== b.isFolder) {
          return a.isFolder ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      }),
    [node.children],
  );

  return (
    <div>
      <div
        className={`w-full flex items-center gap-1.5 px-2 py-1 text-sm rounded transition-colors text-left ${
          isSelected ? 'bg-blue-500/20 text-blue-400' : 'text-slate-300 hover:bg-slate-700/50 hover:text-slate-200'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isFolder ? (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex-shrink-0 p-0.5 -m-0.5 rounded hover:bg-slate-600/50"
          >
            <Icon name="chevronRight" className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <span className="w-3 flex-shrink-0" />
        )}
        <button
          onClick={() => onPathSelect(isSelected ? null : node.path)}
          className="truncate flex-1 text-left cursor-pointer"
        >
          {node.name}
        </button>
        <span className="text-xs text-slate-500 flex-shrink-0">{node.functionCount}</span>
      </div>

      {isExpanded &&
        sortedChildren.map((child) => (
          <TreeNodeComponent
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onPathSelect={onPathSelect}
          />
        ))}
    </div>
  );
}

export function Sidebar({ selectedPath, onPathSelect }: SidebarProps) {
  const db = useKappaDb();
  const tree = useMemo(() => buildFileTree(db), [db]);
  const stats = useMemo(() => db.getStats(), [db]);
  const sortedChildren = useMemo(
    () =>
      Array.from(tree.children.values()).sort((a, b) => {
        if (a.isFolder !== b.isFolder) {
          return a.isFolder ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      }),
    [tree],
  );

  return (
    <div
      className="w-64 flex-shrink-0 bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden flex flex-col"
      style={{ minHeight: '400px' }}
    >
      {/* Legend */}
      <div className="p-3 border-b border-slate-700">
        <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Legend</h3>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs">
            <div className="w-2.5 h-2.5 rounded-full bg-pink-400" />
            <span className="text-slate-300">Has C code ({stats.decompiledFunctions})</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="w-2.5 h-2.5 rounded-full bg-white" />
            <span className="text-slate-300">Assembly only ({stats.asmOnlyFunctions})</span>
          </div>
          {selectedPath && (
            <div className="flex items-center gap-2 text-xs">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span className="text-slate-300">Selected</span>
            </div>
          )}
        </div>
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto p-2 [scrollbar-width:thin]">
        {sortedChildren.map((child) => (
          <TreeNodeComponent
            key={child.path}
            node={child}
            depth={0}
            selectedPath={selectedPath}
            onPathSelect={onPathSelect}
          />
        ))}
      </div>
    </div>
  );
}
