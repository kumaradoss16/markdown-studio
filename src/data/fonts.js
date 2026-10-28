export const FONT_STACKS = {
  'JetBrains Mono': "'JetBrains Mono','Fira Code','Cascadia Code','SF Mono',Consolas,monospace",
  'Fira Code': "'Fira Code','JetBrains Mono',Consolas,monospace",
  'Cascadia Code': "'Cascadia Code','JetBrains Mono',Consolas,monospace",
  'IBM Plex Mono': "'IBM Plex Mono',monospace",
  'Source Code Pro': "'Source Code Pro',monospace",
  'Consolas': "Consolas,'Courier New',monospace",
  'System Mono': "ui-monospace,'SF Mono',Menlo,Consolas,monospace",
  'Inter': "Inter,'Plus Jakarta Sans',-apple-system,'Segoe UI',sans-serif",
  'System Sans': "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  'Georgia': "Georgia,'Times New Roman',serif",
};

export const EDITOR_FONTS = [
  'JetBrains Mono',
  'Fira Code',
  'Cascadia Code',
  'IBM Plex Mono',
  'Source Code Pro',
  'Consolas',
  'System Mono',
];

export const PREVIEW_FONTS = [
  'Inter',
  'System Sans',
  'JetBrains Mono',
  'Cascadia Code',
  'Georgia',
];

export const GRAPH_FONTS = [
  'Inter',
  'System Sans',
  'JetBrains Mono',
  'Cascadia Code',
];

export const FONT_SIZES = [
  '11px',
  '12px',
  '12.5px',
  '13px',
  '13.5px',
  '14px',
  '14.5px',
  '15px',
  '16px',
  '17px',
  '18px',
  '20px',
];

export const TEXT_COLOR_PRESETS = [
  '#f1f5f9',
  '#cbd5e1',
  '#e2e8f0',
  '#94a3b8',
  '#00e5ff',
  '#38bdf8',
  '#10b981',
  '#f59e0b',
  '#f43f5e',
  '#a855f7',
];

/**
 * Validates strict 6-digit hex color format (#RRGGBB).
 * @param {string} v
 * @returns {boolean}
 */
export function isValidHexColor(v) {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim());
}

/**
 * Validates and clamps a CSS font size string between 10px and 24px.
 * @param {string} sizeStr
 * @returns {string} e.g. "14px"
 */
export function clampFontSize(sizeStr, defaultVal = '14px') {
  if (!sizeStr || typeof sizeStr !== 'string') return defaultVal;
  const num = parseFloat(sizeStr);
  if (isNaN(num)) return defaultVal;
  const clamped = Math.max(10, Math.min(24, num));
  return `${clamped}px`;
}
