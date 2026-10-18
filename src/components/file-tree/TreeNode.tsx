import React from 'react';

export interface FileNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  extension?: string;
  children?: FileNode[];
  size?: number;
  mtime?: number;
}

export interface TreeNodeProps {
  node: FileNode;
  depth: number;
  isExpanded: boolean;
  isActive: boolean;
  isFocused: boolean;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
}

export function getNodeIcon(node: FileNode, isExpanded: boolean) {
  if (node.type === 'directory') {
    return isExpanded ? (
      <svg className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
    ) : (
      <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
    );
  }

  const ext = (node.extension || '').toLowerCase();
  switch (ext) {
    case 'md':
    case 'markdown':
      return (
        <svg className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      );
    case 'ts':
    case 'js':
    case 'tsx':
    case 'jsx':
    case 'html':
    case 'css':
      return (
        <svg className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6"/>
          <polyline points="8 6 2 12 8 18"/>
        </svg>
      );
    case 'json':
    case 'yaml':
    case 'yml':
    case 'toml':
      return (
        <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <line x1="8" y1="13" x2="16" y2="13"/>
          <line x1="8" y1="17" x2="16" y2="17"/>
        </svg>
      );
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'svg':
    case 'gif':
    case 'webp':
      return (
        <svg className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      );
    default:
      return (
        <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      );
  }
}

export const TreeNode: React.FC<TreeNodeProps> = React.memo(({
  node,
  depth,
  isExpanded,
  isActive,
  isFocused,
  onToggle,
  onSelect,
  onContextMenu
}) => {
  const isDirectory = node.type === 'directory';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDirectory) {
      onToggle(node.path);
    } else {
      onSelect(node.path);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, node);
  };

  return (
    <div
      role="treeitem"
      aria-expanded={isDirectory ? isExpanded : undefined}
      aria-selected={isActive}
      tabIndex={-1}
      data-path={node.path}
      data-type={node.type}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      style={{ paddingLeft: `calc(${depth} * 12px + 10px)` }}
      className={`group flex items-center h-[26px] min-h-[26px] pr-2 gap-1.5 text-xs select-none cursor-pointer border-l-2 transition-colors ${
        isActive
          ? 'bg-[#0E2A38] text-[#38BDF8] border-[#38BDF8] font-medium'
          : isFocused
          ? 'bg-slate-800/40 text-slate-100 border-transparent outline-1 outline-dotted outline-[#38BDF8]'
          : 'text-slate-400 border-transparent hover:bg-slate-800/50 hover:text-slate-100'
      }`}
    >
      {/* Chevron for directories */}
      <span
        className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0 text-slate-500 hover:text-slate-300"
        onClick={(e) => {
          if (isDirectory) {
            e.stopPropagation();
            onToggle(node.path);
          }
        }}
      >
        {isDirectory ? (
          <svg
            className={`w-3 h-3 transition-transform duration-150 ${isExpanded ? 'rotate-90 text-slate-300' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        ) : (
          <span className="w-3.5" />
        )}
      </span>

      {/* Extension/Folder Vector Icon */}
      <span className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0">
        {getNodeIcon(node, isExpanded)}
      </span>

      {/* File/Folder Name */}
      <span className="flex-1 truncate pl-0.5 tracking-tight" title={node.path}>
        {node.name}
      </span>

      {/* More Options Button (···) */}
      <button
        type="button"
        title="More Options"
        onClick={(e) => {
          e.stopPropagation();
          onContextMenu(e, node);
        }}
        className="opacity-0 group-hover:opacity-80 hover:opacity-100! text-slate-400 hover:text-slate-100 hover:bg-slate-700/60 rounded px-1 text-xs leading-none transition-all"
      >
        ···
      </button>
    </div>
  );
});
