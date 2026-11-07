import { clipboardImportService } from '../../services/clipboard-import-service.js';
import { clipboardCaptureService } from '../../services/clipboard-capture-service.js';
import { clipboardHistoryService } from '../../services/clipboard-history-service.js';
import { formatDetectionService } from '../../services/format-detection-service.js';
import { documentStructureValidator } from '../../services/document-structure-validator.js';
import { htmlToMarkdownService } from '../../services/html-to-markdown-service.js';
import { assetService, MAX_TOTAL_BYTES, MAX_IMAGE_COUNT } from '../../services/asset-service.js';
import { markdownPipeline } from '../../services/markdown-pipeline.js';
import { documentStateManager } from '../../core/document-state-manager.js';
import { workspaceStore } from '../../services/workspace-store.js';
import { AppEvents, eventBus } from '../../app/events.js';

export class RichPasteModalComponent {
  constructor() {
    this.overlay = null;
    this.activeDoc = null;
    this.editorView = null;
    this.stagedAssets = [];
    this.finalMarkdown = '';
    this.originalContent = '';
    this.warnings = [];
    this.validationIssues = [];
    this.counts = {
      headings: 0,
      paragraphs: 0,
      tables: 0,
      codeBlocks: 0,
      images: 0,
      lists: 0,
      links: 0,
      diagrams: 0,
    };
    this.detectedFormats = [];
    this.detectionMetadata = null;
    this.currentFormat = 'auto'; // 'auto' | 'html' | 'markdown' | 'text'
    this.rawPayload = null;
  }

  /**
   * Opens the Clipboard Import modal.
   * @param {{ view?: any, clipboardData?: any }} [options]
   */
  async show(options = {}) {
    this.editorView = options.view || null;
    this.activeDoc = documentStateManager.getActiveDocument();

    if (!this.activeDoc) {
      eventBus.emit(AppEvents.NOTIFICATION, {
        type: 'warning',
        message: 'Please open or create a document before using Clipboard Import.',
      });
      return;
    }

    // Capture selection position immediately
    this.savedSelection = this.editorView ? this.editorView.state.selection.main : null;

    // Inspect clipboard
    let inspectResult;
    if (options.clipboardData) {
      inspectResult = clipboardImportService.inspectFromDataTransfer(options.clipboardData);
    } else {
      inspectResult = await clipboardCaptureService.capture();
    }

    this.rawPayload = inspectResult;
    await this.processClipboardPayload(inspectResult, 'auto');
    this.render();
  }

  /**
   * Processes the inspected clipboard payload into Markdown and staged assets.
   * @param {{ formats: string[], text: string | null, html: string | null, images: any[], unavailableReason?: string }} payload
   * @param {'auto' | 'html' | 'markdown' | 'text'} [overrideFormat='auto']
   */
  async processClipboardPayload(payload, overrideFormat = 'auto') {
    if (!this.activeDoc) {
      this.activeDoc = documentStateManager.getActiveDocument();
    }
    this.rawPayload = payload;
    this.currentFormat = overrideFormat;
    this.detectedFormats = payload.formats || [];
    this.warnings = [];
    this.stagedAssets = [];
    this.originalContent = payload.html || payload.text || '';

    if (payload.unavailableReason) {
      this.warnings.push(payload.unavailableReason);
    }

    // Run deep structure detection
    this.detectionMetadata = formatDetectionService.detect(payload);
    if (this.detectionMetadata.warnings.length > 0) {
      for (const w of this.detectionMetadata.warnings) {
        if (!this.warnings.includes(w)) this.warnings.push(w);
      }
    }

    const { dirPath, isWorkspaceDefault } = assetService.resolveAssetDirectory(this.activeDoc);
    if (isWorkspaceDefault) {
      this.warnings.push('Document is unsaved. Assets will be saved to workspace default "assets/" folder.');
    }

    // Determine target format
    let type = overrideFormat;
    if (type === 'auto') {
      type = clipboardImportService.determineContentType(payload);
    }

    if (type === 'empty') {
      this.finalMarkdown = '';
      this.warnings.push('No usable text, HTML, or image content was detected on the clipboard.');
      return;
    }

    if (type === 'markdown' || type === 'text') {
      this.finalMarkdown = payload.text || payload.markdown || '';
      this.counts.paragraphs = this.finalMarkdown.split(/\n\s*\n/).filter(Boolean).length;
      this._validateMarkdown();
      return;
    }

    if (type === 'image' && payload.images && payload.images.length > 0) {
      let totalBytes = 0;
      const docName = this.activeDoc ? this.activeDoc.name : 'pasted-image';
      const mdLines = [];

      for (let i = 0; i < payload.images.length; i++) {
        if (i >= MAX_IMAGE_COUNT) {
          this.warnings.push(`Image count exceeds maximum limit of ${MAX_IMAGE_COUNT}. Additional images omitted.`);
          break;
        }

        const img = payload.images[i];
        let bytes;
        try {
          const buffer = await img.blob.arrayBuffer();
          bytes = new Uint8Array(buffer);
        } catch {
          this.warnings.push(`Failed to read binary data for image ${i + 1}.`);
          continue;
        }

        totalBytes += bytes.byteLength;
        if (totalBytes > MAX_TOTAL_BYTES) {
          this.warnings.push(`Total image payload exceeds 25 MB. Additional images omitted.`);
          break;
        }

        const validation = assetService.validateImageBytes(bytes, img.mime);
        if (!validation.valid) {
          this.warnings.push(`Image ${i + 1}: ${validation.error}`);
          continue;
        }

        const filename = await assetService.generateAssetFilename(docName, validation.ext, dirPath);
        const fullPath = `${dirPath}/${filename}`;
        const relativePath = `assets/${filename}`;

        this.stagedAssets.push({
          filename,
          fullPath,
          relativePath,
          bytes: validation.bytes,
          size: validation.bytes.byteLength,
          source: 'clipboard',
          status: 'ready',
        });

        mdLines.push(`![pasted-image](${relativePath})`);
      }

      this.finalMarkdown = mdLines.join('\n\n') + '\n';
      this.counts.images = this.stagedAssets.length;
      this._validateMarkdown();
      return;
    }

    // Type is 'html'
    if (type === 'html' && (payload.html || payload.text)) {
      const htmlToConvert = payload.html || `<p>${payload.text}</p>`;
      const converted = htmlToMarkdownService.convert(htmlToConvert);
      this.warnings.push(...converted.warnings);
      this.counts = { ...converted.counts };

      let markdown = converted.markdown;
      let totalBytes = 0;
      const docName = this.activeDoc ? this.activeDoc.name : 'document';

      for (const imgRef of converted.images) {
        const { index, src, alt, title } = imgRef;
        const placeholder = `__MARKFORGE_IMG_${index}__`;

        // Case A: Data URI (base64)
        if (src.startsWith('data:image/')) {
          try {
            const commaIdx = src.indexOf(',');
            if (commaIdx !== -1) {
              const base64 = src.slice(commaIdx + 1);
              const binaryStr = atob(base64);
              const bytes = new Uint8Array(binaryStr.length);
              for (let b = 0; b < binaryStr.length; b++) {
                bytes[b] = binaryStr.charCodeAt(b);
              }

              totalBytes += bytes.byteLength;
              if (totalBytes > MAX_TOTAL_BYTES) {
                this.warnings.push(`Total image payload exceeds 25 MB limit. Data URI image ${index + 1} omitted.`);
                markdown = markdown.replace(placeholder, src);
                continue;
              }

              const validation = assetService.validateImageBytes(bytes);
              if (validation.valid) {
                const filename = await assetService.generateAssetFilename(docName, validation.ext, dirPath);
                const fullPath = `${dirPath}/${filename}`;
                const relativePath = `assets/${filename}`;

                this.stagedAssets.push({
                  filename,
                  fullPath,
                  relativePath,
                  bytes: validation.bytes,
                  size: validation.bytes.byteLength,
                  source: 'data:',
                  status: 'ready',
                });

                markdown = markdown.replace(placeholder, relativePath);
                continue;
              } else {
                this.warnings.push(`Embedded image ${index + 1}: ${validation.error}`);
              }
            }
          } catch (e) {
            this.warnings.push(`Could not decode data URI for image ${index + 1}: ${e.message}`);
          }
          markdown = markdown.replace(placeholder, src);
          continue;
        }

        // Case B: External HTTPS image
        if (src.startsWith('https://')) {
          markdown = markdown.replace(placeholder, src);
          this.stagedAssets.push({
            filename: src.split('/').pop()?.split('?')[0] || 'external-image',
            fullPath: src,
            relativePath: src,
            bytes: null,
            size: 0,
            source: 'https:',
            status: 'kept external URL',
          });
          continue;
        }

        // Case C: Relative reference
        markdown = markdown.replace(placeholder, src);
        this.stagedAssets.push({
          filename: src,
          fullPath: src,
          relativePath: src,
          bytes: null,
          size: 0,
          source: 'other',
          status: 'not copied',
        });
      }

      this.finalMarkdown = markdown;
      this._validateMarkdown();
    }
  }

  _validateMarkdown() {
    const res = documentStructureValidator.validate(this.finalMarkdown);
    this.validationIssues = res.issues;
  }

  render() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay rich-paste-overlay';
    this.overlay = overlay;

    const settings = workspaceStore.getSettings();
    const historyEnabled = settings && settings.clipboardHistoryEnabled;
    const historyEntries = historyEnabled ? clipboardHistoryService.getEntries() : [];

    const formatChips = this.detectedFormats.length > 0
      ? this.detectedFormats.map(f => `<span class="format-chip" style="background: var(--color-surface-sunken); border: 1px solid var(--color-border-subtle); padding: 2px 8px; border-radius: 12px; font-size: 11px; font-family: var(--font-editor);">${f}</span>`).join(' ')
      : '<span style="font-size: 11px; color: var(--color-text-muted);">None detected</span>';

    const confidenceBadge = this.detectionMetadata
      ? `<span class="badge" style="margin-left: auto; font-size: 10.5px; padding: 2px 8px; border-radius: 10px; background: ${this.detectionMetadata.confidence >= 0.85 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'}; color: ${this.detectionMetadata.confidence >= 0.85 ? 'var(--color-accent-emerald, #10b981)' : 'var(--color-accent-amber, #f59e0b)'}; font-weight: 600;">${Math.round(this.detectionMetadata.confidence * 100)}% Confidence (${this.detectionMetadata.confidenceLevel})</span>`
      : '';

    const countsDisplay = `
      <div class="rich-paste-counts" style="display: flex; flex-wrap: wrap; gap: 12px; font-size: 11.5px; color: var(--color-text-secondary); margin: 8px 0; padding: 6px 12px; background: var(--color-surface-sunken); border-radius: 6px; align-items: center;">
        <span><strong>${this.counts.headings}</strong> Headings</span>
        <span><strong>${this.counts.paragraphs}</strong> Paragraphs</span>
        <span><strong>${this.counts.lists}</strong> Lists</span>
        <span><strong>${this.counts.tables}</strong> Tables</span>
        <span><strong>${this.counts.codeBlocks}</strong> Code Blocks</span>
        <span><strong>${this.counts.diagrams}</strong> Diagrams</span>
        <span><strong>${this.counts.images}</strong> Images</span>
        <span><strong>${this.counts.links}</strong> Links</span>
        ${confidenceBadge}
      </div>
    `;

    const warningsHtml = this.warnings.length > 0
      ? `
        <div class="rich-paste-warnings" style="margin-bottom: 10px; padding: 6px 10px; background: rgba(245, 158, 11, 0.1); border-left: 3px solid #f59e0b; border-radius: 4px; font-size: 11.5px; color: var(--color-text-secondary);">
          <strong style="color: #f59e0b;">Import Notices &amp; Warnings (${this.warnings.length}):</strong>
          <ul style="margin: 3px 0 0 16px; padding: 0;">
            ${this.warnings.map(w => `<li>${w}</li>`).join('')}
          </ul>
        </div>
      `
      : '';

    const validationHtml = this.validationIssues.length > 0
      ? `
        <div style="margin-top: 10px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 6px;">Document Structure Validation (${this.validationIssues.length})</div>
          <div style="display: flex; flex-direction: column; gap: 4px; max-height: 140px; overflow-y: auto;">
            ${this.validationIssues.map(iss => `
              <div style="font-size: 11.5px; padding: 4px 8px; border-radius: 4px; background: ${iss.severity === 'error' ? 'rgba(239,68,68,0.1)' : iss.severity === 'warning' ? 'rgba(245,158,11,0.1)' : 'rgba(56,189,248,0.1)'}; border-left: 2px solid ${iss.severity === 'error' ? '#ef4444' : iss.severity === 'warning' ? '#f59e0b' : '#38bdf8'};">
                <span style="font-weight: 600; text-transform: uppercase; font-size: 10px; color: ${iss.severity === 'error' ? '#ef4444' : iss.severity === 'warning' ? '#f59e0b' : '#38bdf8'};">${iss.severity}:</span>
                ${iss.message}
              </div>
            `).join('')}
          </div>
        </div>
      `
      : '';

    const assetsTableHtml = this.stagedAssets.length > 0
      ? `
        <div class="rich-paste-assets" style="margin-top: 10px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 6px;">Assets (${this.stagedAssets.length})</div>
          <table style="width: 100%; font-size: 11.5px; border-collapse: collapse; background: var(--color-surface-sunken); border-radius: 4px; overflow: hidden;">
            <thead>
              <tr style="border-bottom: 1px solid var(--color-border-subtle); text-align: left; opacity: 0.7;">
                <th style="padding: 4px 8px;">File / Target</th>
                <th style="padding: 4px 8px;">Size</th>
                <th style="padding: 4px 8px;">Source</th>
                <th style="padding: 4px 8px;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${this.stagedAssets.map(a => `
                <tr style="border-bottom: 1px solid var(--color-border-subtle);">
                  <td style="padding: 4px 8px; font-family: var(--font-editor);">${a.filename}</td>
                  <td style="padding: 4px 8px;">${a.size > 0 ? (a.size / 1024).toFixed(1) + ' KB' : '-'}</td>
                  <td style="padding: 4px 8px;">${a.source}</td>
                  <td style="padding: 4px 8px;"><span style="color: ${a.status === 'ready' ? 'var(--color-accent-emerald, #10b981)' : 'var(--color-accent-amber, #f59e0b)'}">${a.status}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `
      : '';

    const historyHtml = historyEnabled
      ? `
        <div style="padding: 8px 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-muted);">Local History (${historyEntries.length})</span>
            <button class="btn btn-secondary" id="historyClearBtn" style="font-size: 10.5px; padding: 2px 8px; color: var(--color-accent-rose, #f43f5e);">Clear History</button>
          </div>
          ${historyEntries.length === 0 ? '<div style="font-size: 11.5px; color: var(--color-text-muted); padding: 12px; text-align: center;">No history entries saved yet.</div>' : `
            <div style="display: flex; flex-direction: column; gap: 6px; max-height: 200px; overflow-y: auto;">
              ${historyEntries.map(entry => `
                <div class="history-item" data-id="${entry.id}" style="padding: 6px 10px; background: var(--color-surface-sunken); border: 1px solid var(--color-border-subtle); border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
                  <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11.5px; margin-right: 8px;">
                    <span style="color: var(--color-accent, #38bdf8); font-weight: 600;">[${entry.format}]</span> ${entry.snippet}
                  </div>
                  <div style="display: flex; gap: 6px;">
                    <button class="btn btn-secondary history-load-btn" data-id="${entry.id}" style="font-size: 10.5px; padding: 2px 6px;">Load</button>
                    <button class="btn btn-secondary history-delete-btn" data-id="${entry.id}" style="font-size: 10.5px; padding: 2px 6px; color: var(--color-accent-rose);">✕</button>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      `
      : '';

    overlay.innerHTML = `
      <div class="modal-card rich-paste-modal" style="max-width: 780px; width: 92%; max-height: 88vh; display: flex; flex-direction: column;">
        <div class="modal-header" style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--color-border-subtle); padding: 12px 18px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent, #38bdf8)" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
            <span style="font-weight: 600; font-size: 14px;">Clipboard Import &amp; Document Structure Recovery</span>
          </div>
          <button class="modal-close-btn" id="richPasteCloseX" aria-label="Close" style="background: transparent; border: none; color: var(--color-text-muted); cursor: pointer; font-size: 16px;">✕</button>
        </div>

        <div class="modal-body" style="flex: 1; overflow-y: auto; padding: 12px 18px;">
          <!-- Format Mode Selection Bar -->
          <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 10px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 11px; text-transform: uppercase; color: var(--color-text-muted); font-weight: 600;">Format:</span>
              <div class="format-selector" style="display: inline-flex; background: var(--color-surface-sunken); border: 1px solid var(--color-border-subtle); border-radius: 4px; padding: 2px;">
                <button type="button" class="format-pill-btn ${this.currentFormat === 'auto' ? 'active' : ''}" data-format="auto" style="border: none; background: ${this.currentFormat === 'auto' ? 'var(--color-accent)' : 'transparent'}; color: ${this.currentFormat === 'auto' ? '#000' : 'var(--color-text-secondary)'}; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 3px; cursor: pointer;">Auto</button>
                <button type="button" class="format-pill-btn ${this.currentFormat === 'html' ? 'active' : ''}" data-format="html" style="border: none; background: ${this.currentFormat === 'html' ? 'var(--color-accent)' : 'transparent'}; color: ${this.currentFormat === 'html' ? '#000' : 'var(--color-text-secondary)'}; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 3px; cursor: pointer;">HTML Recovery</button>
                <button type="button" class="format-pill-btn ${this.currentFormat === 'markdown' ? 'active' : ''}" data-format="markdown" style="border: none; background: ${this.currentFormat === 'markdown' ? 'var(--color-accent)' : 'transparent'}; color: ${this.currentFormat === 'markdown' ? '#000' : 'var(--color-text-secondary)'}; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 3px; cursor: pointer;">Raw Markdown</button>
                <button type="button" class="format-pill-btn ${this.currentFormat === 'text' ? 'active' : ''}" data-format="text" style="border: none; background: ${this.currentFormat === 'text' ? 'var(--color-accent)' : 'transparent'}; color: ${this.currentFormat === 'text' ? '#000' : 'var(--color-text-secondary)'}; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 3px; cursor: pointer;">Plain Text</button>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 6px;">
              <button class="btn btn-secondary" id="captureClipboardBtn" style="font-size: 11px; padding: 3px 8px;">↻ Capture from Clipboard</button>
              <button class="btn btn-secondary" id="toggleManualPasteBtn" style="font-size: 11px; padding: 3px 8px;">📋 Paste Box</button>
            </div>
          </div>

          <!-- Manual Paste Area (collapsible) -->
          <div id="manualPasteContainer" style="display: none; margin-bottom: 12px; padding: 8px 10px; background: var(--color-surface-sunken); border: 1px dashed var(--color-border-subtle); border-radius: 4px;">
            <div style="font-size: 11px; color: var(--color-text-muted); margin-bottom: 4px;">Paste raw HTML, markdown, or text here (e.g. if browser permissions block direct reading):</div>
            <textarea id="manualPasteInput" placeholder="Paste content here..." style="width: 100%; height: 75px; background: rgba(0,0,0,0.3); border: 1px solid var(--color-border-default); border-radius: 3px; color: #fff; font-family: var(--font-editor); font-size: 11.5px; padding: 6px; box-sizing: border-box; resize: vertical;"></textarea>
            <div style="display: flex; justify-content: flex-end; gap: 6px; margin-top: 6px;">
              <button class="btn btn-primary" id="convertManualPasteBtn" style="font-size: 11px; padding: 3px 10px;">Convert to Markdown</button>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
            <span style="font-size: 11px; text-transform: uppercase; color: var(--color-text-muted); font-weight: 600;">Detected Formats:</span>
            ${formatChips}
          </div>

          ${countsDisplay}
          ${warningsHtml}

          <!-- Tabs -->
          <div class="rich-paste-tabs" style="display: flex; gap: 8px; border-bottom: 1px solid var(--color-border-subtle); margin-bottom: 8px;">
            <button class="rich-tab-btn active" id="tabMarkdown" style="background: transparent; border: none; border-bottom: 2px solid var(--color-accent); color: #fff; padding: 6px 12px; cursor: pointer; font-size: 12px; font-weight: 600;">Recovered Markdown</button>
            <button class="rich-tab-btn" id="tabRendered" style="background: transparent; border: none; border-bottom: 2px solid transparent; color: var(--color-text-muted); padding: 6px 12px; cursor: pointer; font-size: 12px; font-weight: 600;">Rendered Preview</button>
            <button class="rich-tab-btn" id="tabOriginal" style="background: transparent; border: none; border-bottom: 2px solid transparent; color: var(--color-text-muted); padding: 6px 12px; cursor: pointer; font-size: 12px; font-weight: 600;">Original Content</button>
            <button class="rich-tab-btn" id="tabValidation" style="background: transparent; border: none; border-bottom: 2px solid transparent; color: var(--color-text-muted); padding: 6px 12px; cursor: pointer; font-size: 12px; font-weight: 600;">Validation (${this.validationIssues.length})</button>
            ${historyEnabled ? '<button class="rich-tab-btn" id="tabHistory" style="background: transparent; border: none; border-bottom: 2px solid transparent; color: var(--color-text-muted); padding: 6px 12px; cursor: pointer; font-size: 12px; font-weight: 600;">History</button>' : ''}
          </div>

          <div id="tabContentMarkdown" class="tab-pane active">
            <textarea id="richPasteMarkdownPreview" style="width: 100%; height: 210px; background: var(--color-surface-sunken); border: 1px solid var(--color-border-subtle); border-radius: 4px; color: var(--color-text-primary); font-family: var(--font-editor); font-size: 12px; padding: 10px; resize: vertical; outline: none; box-sizing: border-box;"></textarea>
          </div>

          <div id="tabContentRendered" class="tab-pane" style="display: none; height: 210px; overflow-y: auto; padding: 10px; background: var(--color-surface-sunken); border: 1px solid var(--color-border-subtle); border-radius: 4px;">
            <div id="richPasteRenderedPreview" class="preview-content"></div>
          </div>

          <div id="tabContentOriginal" class="tab-pane" style="display: none;">
            <textarea id="richPasteOriginalSource" readonly style="width: 100%; height: 210px; background: var(--color-surface-sunken); border: 1px solid var(--color-border-subtle); border-radius: 4px; color: var(--color-text-secondary); font-family: var(--font-editor); font-size: 11px; padding: 10px; resize: vertical; outline: none; box-sizing: border-box;"></textarea>
          </div>

          <div id="tabContentValidation" class="tab-pane" style="display: none; height: 210px; overflow-y: auto; padding: 10px; background: var(--color-surface-sunken); border: 1px solid var(--color-border-subtle); border-radius: 4px;">
            ${validationHtml || '<div style="color: var(--color-accent-emerald); font-size: 12px;">✅ No structural validation issues found. Document hierarchy is clean.</div>'}
          </div>

          ${historyEnabled ? `
            <div id="tabContentHistory" class="tab-pane" style="display: none; height: 210px; overflow-y: auto; padding: 10px; background: var(--color-surface-sunken); border: 1px solid var(--color-border-subtle); border-radius: 4px;">
              ${historyHtml}
            </div>
          ` : ''}

          ${assetsTableHtml}
        </div>

        <div class="modal-actions" style="padding: 10px 18px; border-top: 1px solid var(--color-border-subtle); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-secondary" id="richPasteCopyBtn" style="font-size: 11.5px;">📋 Copy Markdown</button>
            <button class="btn btn-secondary" id="richPasteNewDocBtn" style="font-size: 11.5px;">📄 Create New Document</button>
            <button class="btn btn-secondary" id="richPasteExportBtn" style="font-size: 11.5px;">💾 Export .md</button>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-secondary" id="richPasteCancelBtn">Cancel</button>
            <button class="btn btn-primary" id="richPasteImportBtn" ${this.finalMarkdown.trim().length === 0 ? 'disabled' : ''}>Insert into Document</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const textarea = overlay.querySelector('#richPasteMarkdownPreview');
    if (textarea) {
      textarea.value = this.finalMarkdown;
      textarea.addEventListener('input', (e) => {
        this.finalMarkdown = e.target.value;
        const importBtn = overlay.querySelector('#richPasteImportBtn');
        if (importBtn) importBtn.disabled = this.finalMarkdown.trim().length === 0;
      });
    }

    const origTextarea = overlay.querySelector('#richPasteOriginalSource');
    if (origTextarea) {
      origTextarea.value = this.originalContent;
    }

    // Format selection pills
    overlay.querySelectorAll('.format-pill-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const fmt = btn.getAttribute('data-format');
        if (fmt && this.rawPayload) {
          await this.processClipboardPayload(this.rawPayload, fmt);
          this.render();
        }
      });
    });

    // Capture from clipboard button
    overlay.querySelector('#captureClipboardBtn')?.addEventListener('click', async () => {
      const inspectResult = await clipboardCaptureService.capture();
      await this.processClipboardPayload(inspectResult, 'auto');
      this.render();
    });

    // Toggle manual paste area
    overlay.querySelector('#toggleManualPasteBtn')?.addEventListener('click', () => {
      const container = overlay.querySelector('#manualPasteContainer');
      if (container) {
        container.style.display = container.style.display === 'none' ? 'block' : 'none';
      }
    });

    // Convert manual paste button
    overlay.querySelector('#convertManualPasteBtn')?.addEventListener('click', async () => {
      const input = overlay.querySelector('#manualPasteInput');
      const val = input ? input.value : '';
      if (!val.trim()) return;

      const isHtml = /<[a-z][\s\S]*>/i.test(val);
      const syntheticPayload = {
        formats: isHtml ? ['text/html'] : ['text/plain'],
        text: val,
        html: isHtml ? val : null,
        markdown: !isHtml ? val : null,
        images: [],
      };
      await this.processClipboardPayload(syntheticPayload, 'auto');
      this.render();
    });

    // Copy Markdown button
    overlay.querySelector('#richPasteCopyBtn')?.addEventListener('click', async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(this.finalMarkdown);
        }
        eventBus.emit(AppEvents.NOTIFICATION, {
          type: 'success',
          message: 'Recovered Markdown copied to clipboard.',
        });
      } catch (err) {
        eventBus.emit(AppEvents.NOTIFICATION, {
          type: 'error',
          message: `Failed to copy: ${err.message}`,
        });
      }
    });

    // Create New Document button
    overlay.querySelector('#richPasteNewDocBtn')?.addEventListener('click', () => {
      const newDoc = documentStateManager.createDocument('Imported Document.md', this.finalMarkdown);
      eventBus.emit(AppEvents.NOTIFICATION, {
        type: 'success',
        message: `Created new document "${newDoc.name}".`,
      });
      this.close();
    });

    // Export Recovered Content button
    overlay.querySelector('#richPasteExportBtn')?.addEventListener('click', () => {
      const blob = new Blob([this.finalMarkdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recovered-${Date.now()}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      eventBus.emit(AppEvents.NOTIFICATION, {
        type: 'success',
        message: 'Recovered Markdown downloaded.',
      });
    });

    // Tab switching
    const tabs = [
      { btn: '#tabMarkdown', pane: '#tabContentMarkdown' },
      { btn: '#tabRendered', pane: '#tabContentRendered', onActivate: () => {
        const renderedContainer = overlay.querySelector('#richPasteRenderedPreview');
        const { html } = markdownPipeline.process({ content: this.finalMarkdown, id: 'preview-snippet' });
        if (renderedContainer) renderedContainer.innerHTML = html;
      }},
      { btn: '#tabOriginal', pane: '#tabContentOriginal' },
      { btn: '#tabValidation', pane: '#tabContentValidation' },
      { btn: '#tabHistory', pane: '#tabContentHistory' },
    ];

    tabs.forEach(({ btn, pane, onActivate }) => {
      const btnEl = overlay.querySelector(btn);
      const paneEl = overlay.querySelector(pane);
      if (!btnEl || !paneEl) return;

      btnEl.addEventListener('click', () => {
        // Deactivate all
        tabs.forEach(t => {
          const b = overlay.querySelector(t.btn);
          const p = overlay.querySelector(t.pane);
          if (b) {
            b.classList.remove('active');
            b.style.borderBottomColor = 'transparent';
            b.style.color = 'var(--color-text-muted)';
          }
          if (p) p.style.display = 'none';
        });

        // Activate current
        btnEl.classList.add('active');
        btnEl.style.borderBottomColor = 'var(--color-accent)';
        btnEl.style.color = '#fff';
        paneEl.style.display = 'block';

        if (onActivate) onActivate();
      });
    });

    // History items interaction
    overlay.querySelectorAll('.history-load-btn').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-id');
        const entry = clipboardHistoryService.getEntries().find(e => e.id === id);
        if (entry) {
          this.finalMarkdown = entry.markdown;
          if (textarea) textarea.value = this.finalMarkdown;
          tabs[0].btn && overlay.querySelector(tabs[0].btn)?.click();
        }
      });
    });

    overlay.querySelectorAll('.history-delete-btn').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-id');
        clipboardHistoryService.deleteEntry(id);
        this.render();
      });
    });

    overlay.querySelector('#historyClearBtn')?.addEventListener('click', () => {
      clipboardHistoryService.clear();
      this.render();
    });

    // Close handlers
    overlay.querySelector('#richPasteCloseX')?.addEventListener('click', () => this.close());
    overlay.querySelector('#richPasteCancelBtn')?.addEventListener('click', () => this.close());

    // Import action
    overlay.querySelector('#richPasteImportBtn')?.addEventListener('click', async () => {
      await this.commitImport();
    });

    // Keyboard ESC to cancel
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
  }

  /**
   * Commits staged assets to storage and inserts markdown into document via single transaction.
   */
  async commitImport() {
    if (!this.finalMarkdown) {
      this.close();
      return;
    }

    const importBtn = this.overlay?.querySelector('#richPasteImportBtn');
    if (importBtn) {
      importBtn.disabled = true;
      importBtn.textContent = 'Importing...';
    }

    // 1. Commit staged binary assets
    if (this.stagedAssets.length > 0) {
      const toWrite = this.stagedAssets.filter(a => a.bytes && a.bytes.byteLength > 0);
      if (toWrite.length > 0) {
        const commitResult = await assetService.commitStagedAssets(
          toWrite.map(a => ({ path: a.fullPath, bytes: a.bytes }))
        );

        if (!commitResult.success) {
          eventBus.emit(AppEvents.NOTIFICATION, {
            type: 'error',
            message: `Asset import failed: ${commitResult.error}. Operation cancelled with zero changes.`,
          });
          this.close();
          return;
        }
      }
    }

    const targetDoc = this.activeDoc || documentStateManager.getActiveDocument();
    // 2. Insert Markdown into CodeMirror via single transaction (one undo step)
    if (this.editorView) {
      try {
        const selection = this.savedSelection || this.editorView.state.selection.main;
        const from = selection.from;
        const to = selection.to;

        this.editorView.dispatch({
          changes: { from, to, insert: this.finalMarkdown },
          selection: { anchor: from + this.finalMarkdown.length },
          userEvent: 'input.paste.rich',
        });
        this.editorView.focus();
      } catch (err) {
        // Fallback to document state manager directly
        if (targetDoc) {
          const currentContent = targetDoc.content || '';
          documentStateManager.updateContent(targetDoc.id, currentContent + '\n' + this.finalMarkdown);
        }
      }
    } else if (targetDoc) {
      const currentContent = targetDoc.content || '';
      documentStateManager.updateContent(targetDoc.id, currentContent + '\n' + this.finalMarkdown);
    }

    // 3. Record to clipboard history if enabled
    const settings = workspaceStore.getSettings();
    if (settings && settings.clipboardHistoryEnabled) {
      clipboardHistoryService.addEntry({
        source: 'clipboard-import',
        format: this.currentFormat,
        snippet: this.finalMarkdown.slice(0, 100),
        markdown: this.finalMarkdown,
        counts: this.counts,
      }, { enabled: true, limit: settings.clipboardHistoryLimit });
    }

    eventBus.emit(AppEvents.NOTIFICATION, {
      type: 'success',
      message: `Content imported (${this.stagedAssets.length} asset(s)).`,
    });

    this.close();
  }

  close() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    this.stagedAssets = [];
    this.finalMarkdown = '';
  }
}

export const richPasteModalComponent = new RichPasteModalComponent();
export const clipboardImportModalComponent = richPasteModalComponent;
export { RichPasteModalComponent as ClipboardImportModalComponent };
