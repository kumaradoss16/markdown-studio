import { useState, useEffect, useCallback, useRef } from 'react';
import type { FileNode } from './TreeNode';
import { fileSystemAdapter } from '../../services/filesystem-adapter.js';

export interface UseFileSystemOptions {
  rootPath?: string;
  initialExpanded?: string[];
  onFileSelect?: (filePath: string, content: string) => void;
}

export function useFileSystem({
  rootPath = 'ExampleVault',
  initialExpanded = ['ExampleVault', 'ExampleVault/embeds'],
  onFileSelect
}: UseFileSystemOptions = {}) {
  const [treeData, setTreeData] = useState<FileNode | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(initialExpanded));
  const [activePath, setActivePath] = useState<string | null>(null);
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load tree from adapter
  const refreshTree = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fileSystemAdapter.readTree(rootPath);
      setTreeData(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load file tree');
    } finally {
      setIsLoading(false);
    }
  }, [rootPath]);

  useEffect(() => {
    refreshTree();
  }, [refreshTree]);

  // Non-destructive expand/collapse
  const toggleFolder = useCallback((folderPath: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  }, []);

  const expandFolder = useCallback((folderPath: string) => {
    setExpandedPaths((prev) => {
      if (prev.has(folderPath)) return prev;
      const next = new Set(prev);
      next.add(folderPath);
      return next;
    });
  }, []);

  const collapseFolder = useCallback((folderPath: string) => {
    setExpandedPaths((prev) => {
      if (!prev.has(folderPath)) return prev;
      const next = new Set(prev);
      next.delete(folderPath);
      return next;
    });
  }, []);

  // Select file and notify consumer
  const selectFile = useCallback(async (filePath: string) => {
    setActivePath(filePath);
    setFocusedPath(filePath);

    try {
      const fileData = await fileSystemAdapter.readFile(filePath);
      onFileSelect?.(filePath, fileData.content);
    } catch {
      onFileSelect?.(filePath, '');
    }
  }, [onFileSelect]);

  // File system operations
  const createFile = useCallback(async (parentDir: string, fileName: string, initialContent = '') => {
    const fullPath = `${parentDir}/${fileName}`;
    await fileSystemAdapter.writeFile(fullPath, initialContent);
    expandFolder(parentDir);
    await refreshTree();
    await selectFile(fullPath);
    return fullPath;
  }, [expandFolder, refreshTree, selectFile]);

  const createFolder = useCallback(async (parentDir: string, folderName: string) => {
    const fullPath = `${parentDir}/${folderName}`;
    await fileSystemAdapter.createDirectory(fullPath);
    expandFolder(parentDir);
    await refreshTree();
    return fullPath;
  }, [expandFolder, refreshTree]);

  const rename = useCallback(async (oldPath: string, newName: string) => {
    const parts = oldPath.split('/');
    parts.pop();
    const newPath = [...parts, newName].join('/');
    await fileSystemAdapter.rename(oldPath, newPath);
    if (activePath === oldPath) {
      setActivePath(newPath);
    }
    await refreshTree();
    return newPath;
  }, [activePath, refreshTree]);

  const remove = useCallback(async (targetPath: string) => {
    await fileSystemAdapter.delete(targetPath);
    if (activePath === targetPath) {
      setActivePath(null);
    }
    await refreshTree();
  }, [activePath, refreshTree]);

  return {
    treeData,
    isLoading,
    error,
    expandedPaths,
    activePath,
    focusedPath,
    setFocusedPath,
    refreshTree,
    toggleFolder,
    expandFolder,
    collapseFolder,
    selectFile,
    createFile,
    createFolder,
    rename,
    remove
  };
}
