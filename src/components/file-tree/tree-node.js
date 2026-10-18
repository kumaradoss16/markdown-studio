/**
 * TreeNode DOM Renderer
 * Generates semantic tree node markup with dynamic indentation,
 * extension-based iconography, and VS Code-inspired styling.
 */

export function getNodeIcon(node, isExpanded = false) {
  if (node.type === 'directory') {
    if (isExpanded) {
      return `
        <svg class="tree-icon folder-icon open" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
      `;
    }
    return `
      <svg class="tree-icon folder-icon closed" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
    `;
  }

  const ext = (node.extension || '').toLowerCase();

  switch (ext) {
    case 'md':
    case 'markdown':
      return `
        <svg class="tree-icon icon-md" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      `;
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':
    case 'html':
    case 'css':
      return `
        <svg class="tree-icon icon-code" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2DD4BF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 18 22 12 16 6"/>
          <polyline points="8 6 2 12 8 18"/>
        </svg>
      `;
    case 'json':
    case 'yaml':
    case 'yml':
    case 'toml':
      return `
        <svg class="tree-icon icon-data" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <line x1="8" y1="13" x2="16" y2="13"/>
          <line x1="8" y1="17" x2="16" y2="17"/>
        </svg>
      `;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'svg':
    case 'gif':
    case 'webp':
      return `
        <svg class="tree-icon icon-media" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#A855F7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      `;
    case 'mp3':
    case 'wav':
    case 'ogg':
      return `
        <svg class="tree-icon icon-audio" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#EC4899" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18V5l12-2v13"/>
          <circle cx="6" cy="18" r="3"/>
          <circle cx="18" cy="16" r="3"/>
        </svg>
      `;
    default:
      return `
        <svg class="tree-icon icon-generic" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      `;
  }
}

/**
 * Creates the DOM element for a single node in the file hierarchy.
 * @param {import('../../services/filesystem-adapter.js').FileNode} node
 * @param {number} depth
 * @param {boolean} isExpanded
 * @param {boolean} isActive
 * @returns {HTMLElement}
 */
export function createNodeElement(node, depth, isExpanded, isActive) {
  const item = document.createElement('div');
  item.className = `tree-item ${node.type} ${isActive ? 'active' : ''} ${isExpanded ? 'expanded' : ''}`;
  item.setAttribute('data-id', node.id);
  item.setAttribute('data-path', node.path);
  item.setAttribute('data-type', node.type);
  item.style.paddingLeft = `calc(${depth} * 12px + 10px)`;

  const chevronHtml = node.type === 'directory'
    ? `<svg class="tree-chevron ${isExpanded ? 'rotated' : ''}" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`
    : `<span class="tree-chevron-placeholder"></span>`;

  item.innerHTML = `
    <span class="tree-chevron-container">${chevronHtml}</span>
    <span class="tree-icon-container">${getNodeIcon(node, isExpanded)}</span>
    <span class="tree-label" title="${node.path}">${node.name}</span>
    <button class="tree-item-more-btn" title="More Options (Right click)">···</button>
  `;

  return item;
}
