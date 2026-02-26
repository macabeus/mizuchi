import type { DecompFunctionDoc, KappaDb } from '@shared/kappa-db/kappa-db';
import { Icon } from '@ui-shared/components/Icon';
import { useMemo, useState } from 'react';

import { useKappaDb } from '../KappaDbContext';

interface SidebarProps {
  selectedPath: string | null;
  onPathSelect: (path: string | null) => void;
  selectedFunctionId: string | null;
  onFunctionSelect: (id: string) => void;
}

interface TreeNode {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  functionCount: number;
  decompiledCount: number;
  isFolder: boolean;
  functions: DecompFunctionDoc[];
}

function buildFileTree(db: KappaDb): TreeNode {
  const root: TreeNode = {
    name: '',
    path: '',
    children: new Map(),
    functionCount: 0,
    decompiledCount: 0,
    isFolder: true,
    functions: [],
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
          functions: [],
        });
      }

      const child = current.children.get(part)!;
      child.functionCount++;
      if (fn.cCode) {
        child.decompiledCount++;
      }
      current = child;
    }

    // Add function to the leaf node
    current.functions.push(fn);

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
  selectedFunctionId,
  selectedFunctionFilePath,
  onFunctionSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onPathSelect: (path: string | null) => void;
  selectedFunctionId: string | null;
  selectedFunctionFilePath: string | null;
  onFunctionSelect: (id: string) => void;
}) {
  const isFolder = node.isFolder;
  const hasFunctions = node.functions.length > 0;
  const isExpandable = isFolder || hasFunctions;
  const isSelected = selectedPath === node.path;
  const containsSelected = selectedFunctionFilePath
    ? selectedFunctionFilePath === node.path || selectedFunctionFilePath.startsWith(node.path + '/')
    : false;

  // Auto-expand: top-level folders, or any node containing the selected function
  const [isExpanded, setIsExpanded] = useState(depth < 1 || containsSelected);

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
        {isExpandable ? (
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
          className={`truncate flex-1 text-left cursor-pointer ${containsSelected ? 'font-bold' : ''}`}
        >
          {node.name}
        </button>
        <span className="text-xs text-slate-500 flex-shrink-0">{node.functionCount}</span>
      </div>

      {isExpanded && (
        <>
          {sortedChildren.map((child) => (
            <TreeNodeComponent
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onPathSelect={onPathSelect}
              selectedFunctionId={selectedFunctionId}
              selectedFunctionFilePath={selectedFunctionFilePath}
              onFunctionSelect={onFunctionSelect}
            />
          ))}

          {/* List individual functions under file nodes */}
          {hasFunctions &&
            node.functions.map((fn) => (
              <button
                key={fn.id}
                onClick={() => onFunctionSelect(fn.id)}
                className={`w-full text-left px-2 py-0.5 text-xs truncate rounded transition-colors ${
                  selectedFunctionId === fn.id
                    ? 'bg-cyan-500/20 text-cyan-400 font-bold'
                    : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-300'
                }`}
                style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
                title={fn.name}
              >
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${fn.cCode ? 'bg-pink-400' : 'bg-slate-600'}`}
                />
                {fn.name}
              </button>
            ))}
        </>
      )}
    </div>
  );
}

export function Sidebar({ selectedPath, onPathSelect, selectedFunctionId, onFunctionSelect }: SidebarProps) {
  const db = useKappaDb();
  const tree = useMemo(() => buildFileTree(db), [db]);
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

  const selectedFunctionFilePath = useMemo(() => {
    if (!selectedFunctionId) {
      return null;
    }
    const fn = db.getFunctionById(selectedFunctionId);
    if (!fn) {
      return null;
    }
    return fn.cModulePath || fn.asmModulePath;
  }, [db, selectedFunctionId]);

  return (
    <div
      className="w-64 flex-shrink-0 bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden flex flex-col"
      style={{ minHeight: '400px' }}
    >
      {/* File tree */}
      <div className="flex-1 overflow-y-auto p-2 [scrollbar-width:thin]">
        {sortedChildren.map((child) => (
          <TreeNodeComponent
            key={child.path}
            node={child}
            depth={0}
            selectedPath={selectedPath}
            onPathSelect={onPathSelect}
            selectedFunctionId={selectedFunctionId}
            selectedFunctionFilePath={selectedFunctionFilePath}
            onFunctionSelect={onFunctionSelect}
          />
        ))}
      </div>
    </div>
  );
}
