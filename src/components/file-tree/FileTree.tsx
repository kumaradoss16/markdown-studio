import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { TreeNode, type FileNode } from './TreeNode';
import { useFileSystem } from './useFileSystem';

export interface FileTreeProps {
  rootPath?: string;
  onFileSelect?: (filePath: string, content: string) => void;
  className?: string;
}

interface FlattenedNode {
  node: FileNode;
  depth: number;
  parentPath: string | null;
}

export const FileTree: React.FC<FileTreeProps> = ({
  rootPath = 'ExampleVault',
  onFileSelect,
  className = ''
}) => {
  const {
    treeData,
    isLoading,
    error,
    expandedPaths,
    activePath,
    focusedPath,
    setFocusedPath,
    toggleFolder,
    expandFolder,
    collapseFolder,
    selectFile,
    createFile,
    createFolder,
    rename,
    remove
  } = useFileSystem({ rootPath, onFileSelect });

  const containerRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: FileNode;
  } | null>(null);

  // Compute flattened list of only VISIBLE items for arrow key traversal
  const visibleNodes = useMemo(() => {
    const list: FlattenedNode[] = [];
    if (!treeData) return list;

    function traverse(node: FileNode, depth: number, parentPath: string | null) {
      list.push({ node, depth, parentPath });
      if (node.type === 'directory' && expandedPaths.has(node.path) && node.children) {
        for (const child of node.children) {
          traverse(child, depth + 1, node.path);
        }
      }
    }

    if (treeData.children) {
      for (const child of treeData.children) {
        traverse(child, 0, treeData.path);
      }
    }
    return list;
  }, [treeData, expandedPaths]);

  // Keyboard navigation handler (VS Code parity)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!visibleNodes.length) return;

    const currentIndex = visibleNodes.findIndex(
      (item) => item.node.path === (focusedPath || activePath)
    );

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const nextIndex = currentIndex < visibleNodes.length - 1 ? currentIndex + 1 : 0;
        const target = visibleNodes[nextIndex].node;
        setFocusedPath(target.path);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : visibleNodes.length - 1;
        const target = visibleNodes[prevIndex].node;
        setFocusedPath(target.path);
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        if (currentIndex === -1) return;
        const current = visibleNodes[currentIndex].node;
        if (current.type === 'directory') {
          if (!expandedPaths.has(current.path)) {
            expandFolder(current.path);
          } else if (current.children && current.children.length > 0) {
            setFocusedPath(current.children[0].path);
          }
        }
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        if (currentIndex === -1) return;
        const currentItem = visibleNodes[currentIndex];
        if (currentItem.node.type === 'directory' && expandedPaths.has(currentItem.node.path)) {
          collapseFolder(currentItem.node.path);
        } else if (currentItem.parentPath) {
          setFocusedPath(currentItem.parentPath);
        }
        break;
      }
      case 'Enter': {
        e.preventDefault();
        if (currentIndex === -1) return;
        const current = visibleNodes[currentIndex].node;
        if (current.type === 'directory') {
          toggleFolder(current.path);
        } else {
          selectFile(current.path);
        }
        break;
      }
      case 'Escape': {
        setContextMenu(null);
        break;
      }
    }
  }, [visibleNodes, focusedPath, activePath, expandedPaths, expandFolder, collapseFolder, toggleFolder, selectFile, setFocusedPath]);

  // Context menu trigger
  const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      node
    });
  };

  // Close context menu on outside click
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Recursive renderer component
  const renderTree = (nodes?: FileNode[], depth = 0): React.ReactNode => {
    if (!nodes || nodes.length === 0) return null;

    return nodes.map((node) => {
      const isExpanded = expandedPaths.has(node.path);
      const isActive = activePath === node.path;
      const isFocused = focusedPath === node.path;

      return (
        <React.Fragment key={node.path}>
          <TreeNode
            node={node}
            depth={depth}
            isExpanded={isExpanded}
            isActive={isActive}
            isFocused={isFocused}
            onToggle={toggleFolder}
            onSelect={selectFile}
            onContextMenu={handleContextMenu}
          />
          {node.type === 'directory' && isExpanded && (
            <div className="flex flex-col">
              {renderTree(node.children, depth + 1)}
            </div>
          )}
        </React.Fragment>
      );
    });
  };

  if (isLoading) {
    return (
      <div className={`p-3 text-xs italic text-slate-500 ${className}`}>
        Loading filesystem...
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-3 text-xs text-rose-400 bg-rose-950/20 rounded border border-rose-900/40 m-2 ${className}`}>
        Error: {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="tree"
      aria-label="Filesystem Explorer"
      onKeyDown={handleKeyDown}
      className={`relative w-full outline-none focus-visible:ring-1 focus-visible:ring-sky-500/50 py-1 select-none font-sans ${className}`}
    >
      {treeData?.children && treeData.children.length > 0 ? (
        renderTree(treeData.children, 0)
      ) : (
        <div className="p-3 text-xs text-slate-500 italic">No files in workspace</div>
      )}

      {/* Floating Context Menu */}
      {contextMenu && (
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 min-w-[170px] bg-[#151B27] border border-[#232D3F] rounded-md shadow-2xl py-1 text-xs text-slate-200"
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.node.type === 'directory' && (
            <>
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 hover:bg-slate-800 flex items-center gap-2"
                onClick={() => {
                  const name = prompt('Enter new file name:');
                  if (name) createFile(contextMenu.node.path, name);
                  setContextMenu(null);
                }}
              >
                <span>New File...</span>
              </button>
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 hover:bg-slate-800 flex items-center gap-2"
                onClick={() => {
                  const name = prompt('Enter new folder name:');
                  if (name) createFolder(contextMenu.node.path, name);
                  setContextMenu(null);
                }}
              >
                <span>New Folder...</span>
              </button>
              <div className="h-px bg-slate-800 my-1" />
            </>
          )}

          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-slate-800 flex items-center gap-2"
            onClick={() => {
              const newName = prompt('Rename to:', contextMenu.node.name);
              if (newName && newName !== contextMenu.node.name) {
                rename(contextMenu.node.path, newName);
              }
              setContextMenu(null);
            }}
          >
            <span>Rename</span>
          </button>

          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-slate-800 flex items-center gap-2"
            onClick={async () => {
              await navigator.clipboard.writeText(contextMenu.node.path);
              setContextMenu(null);
            }}
          >
            <span>Copy Path</span>
          </button>

          <div className="h-px bg-slate-800 my-1" />

          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-rose-950/60 text-rose-400 flex items-center gap-2"
            onClick={() => {
              if (confirm(`Are you sure you want to delete "${contextMenu.node.name}"?`)) {
                remove(contextMenu.node.path);
              }
              setContextMenu(null);
            }}
          >
            <span>Delete</span>
          </button>
        </div>
      )}
    </div>
  );
};
