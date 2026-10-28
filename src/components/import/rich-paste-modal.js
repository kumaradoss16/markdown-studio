import { clipboardImportService } from '../../services/clipboard-import-service.js';
import { htmlToMarkdownService } from '../../services/html-to-markdown-service.js';
import { assetService, MAX_TOTAL_BYTES, MAX_IMAGE_COUNT } from '../../services/asset-service.js';
import { markdownPipeline } from '../../services/markdown-pipeline.js';
import { documentStateManager } from '../../core/document-state-manager.js';
import { AppEvents, eventBus } from '../../app/events.js';

export class RichPasteModalComponent {
  constructor() {
    this.overlay = null;
    this.activeDoc = null;
    this.editorView = null;
    this.stagedAssets = [];
    this.finalMarkdown = '';
    this.warnings = [];
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
  }

  /**
   * Opens the Rich Paste modal.
   * @param {{ view?: any, clipboardData?: any }} [options]
   */
  async show(options = {}) {
    this.editorView = options.view || null;
    this.activeDoc = documentStateManager.getActiveDocument();

    if (!this.activeDoc) {
      eventBus.emit(AppEvents.NOTIFICATION, {
        type: 'warning',
        message: 'Please open or create a document before using Rich Paste.',
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
      inspectResult = await clipboardImportService.inspect();
    }

    await this.processClipboardPayload(inspectResult);
    this.render();
  }

  /**
   * Processes the inspected clipboard payload into Markdown and staged assets.
   * @param {{ formats: string[], text: string | null, html: string | null, images: any[], unavailableReason?: string }} payload
   */
  async processClipboardPayload(payload) {
    if (!this.activeDoc) {
      this.activeDoc = documentStateManager.getActiveDocument();
    }
    this.detectedFormats = payload.formats || [];
    this.warnings = [];
    this.stagedAssets = [];

    if (payload.unavailableReason) {
      this.warnings.push(payload.unavailableReason);
    }

    const { dirPath, isWorkspaceDefault } = assetService.resolveAssetDirectory(this.activeDoc);
    if (isWorkspaceDefault) {
      this.warnings.push('Document is unsaved. Assets will be saved to the workspace default "assets/" folder.');
    }

    const type = clipboardImportService.determineContentType(payload);

    if (type === 'empty') {
      this.finalMarkdown = '';
      this.warnings.push('No usable text, HTML, or image content was detected on the clipboard.');
      return;
    }

    if (type === 'markdown' || type === 'text') {
      this.finalMarkdown = payload.text || '';
      this.counts.paragraphs = this.finalMarkdown.split(/\n\s*\n/).filter(Boolean).length;
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
      return;
    }

    // Type is 'html'
    if (type === 'html' && payload.html) {
      const converted = htmlToMarkdownService.convert(payload.html);
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
          // Default: keep external URL untouched
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

        // Case C: Unhandled or local relative reference
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
    }
  }

  render() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay rich-paste-overlay';
    this.overlay = overlay;

    const formatChips = this.detectedFormats.length > 0
      ? this.detectedFormats.map(f => `<span class="format-chip" style="background: var(--color-surface-sunken); border: 1px solid var(--color-border-subtle); padding: 2px 8px; border-radius: 12px; font-size: 11px; font-family: var(--font-editor);">${f}</span>`).join(' ')
      : '<span style="font-size: 11px; color: var(--color-text-muted);">None detected</span>';

    const countsDisplay = `
      <div class="rich-paste-counts" style="display: flex; flex-wrap: wrap; gap: 12px; font-size: 11.5px; color: var(--color-text-secondary); margin: 10px 0; padding: 8px 12px; background: var(--color-surface-sunken); border-radius: 6px;">
        <span><strong>${this.counts.headings}</strong> Headings</span>
        <span><strong>${this.counts.paragraphs}</strong> Paragraphs</span>
        <span><strong>${this.counts.lists}</strong> Lists</span>
        <span><strong>${this.counts.tables}</strong> Tables</span>
        <span><strong>${this.counts.codeBlocks}</strong> Code Blocks</span>
        <span><strong>${this.counts.diagrams}</strong> Diagrams</span>
        <span><strong>${this.counts.images}</strong> Images</span>
        <span><strong>${this.counts.links}</strong> Links</span>
      </div>
    `;

    const warningsHtml = this.warnings.length > 0
      ? `
        <div class="rich-paste-warnings" style="margin-bottom: 12px; padding: 8px 12px; background: rgba(245, 158, 11, 0.1); border-left: 3px solid #f59e0b; border-radius: 4px; font-size: 11.5px; color: var(--color-text-secondary);">
          <strong style="color: #f59e0b;">Import Notices &amp; Warnings:</strong>
          <ul style="margin: 4px 0 0 16px; padding: 0;">
            ${this.warnings.map(w => `<li>${w}</li>`).join('')}
          </ul>
        </div>
      `
      : '';

    const assetsTableHtml = this.stagedAssets.length > 0
      ? `
        <div class="rich-paste-assets" style="margin-top: 12px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 6px;">Assets (${this.stagedAssets.length})</div>
          <table style="width: 100%; font-size: 11.5px; border-collapse: collapse; background: var(--color-surface-sunken); border-radius: 4px; overflow: hidden;">
            <thead>
              <tr style="border-bottom: 1px solid var(--color-border-subtle); text-align: left; opacity: 0.7;">
                <th style="padding: 6px 10px;">File / Target</th>
                <th style="padding: 6px 10px;">Size</th>
                <th style="padding: 6px 10px;">Source</th>
                <th style="padding: 6px 10px;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${this.stagedAssets.map(a => `
                <tr style="border-bottom: 1px solid var(--color-border-subtle);">
                  <td style="padding: 6px 10px; font-family: var(--font-editor);">${a.filename}</td>
                  <td style="padding: 6px 10px;">${a.size > 0 ? (a.size / 1024).toFixed(1) + ' KB' : '-'}</td>
                  <td style="padding: 6px 10px;">${a.source}</td>
                  <td style="padding: 6px 10px;"><span style="color: ${a.status === 'ready' ? 'var(--color-accent-emerald, #10b981)' : 'var(--color-accent-amber, #f59e0b)'}">${a.status}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `
      : '';

    overlay.innerHTML = `
      <div class="modal-card rich-paste-modal" style="max-width: 720px; width: 90%; max-height: 85vh; display: flex; flex-direction: column;">
        <div class="modal-header" style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent, #38bdf8)" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
            <span style="font-weight: 600;">Rich Paste &amp; Visual Import</span>
          </div>
          <button class="modal-close-btn" id="richPasteCloseX" aria-label="Close" style="background: transparent; border: none; color: var(--color-text-muted); cursor: pointer; font-size: 16px;">✕</button>
        </div>

        <div class="modal-body" style="flex: 1; overflow-y: auto; padding: 14px 18px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span style="font-size: 11px; text-transform: uppercase; color: var(--color-text-muted); font-weight: 600;">Detected Formats:</span>
            ${formatChips}
          </div>

          ${countsDisplay}
          ${warningsHtml}

          <!-- Tabs -->
          <div class="rich-paste-tabs" style="display: flex; gap: 8px; border-bottom: 1px solid var(--color-border-subtle); margin-bottom: 10px;">
            <button class="rich-tab-btn active" id="tabMarkdown" style="background: transparent; border: none; border-bottom: 2px solid var(--color-accent); color: #fff; padding: 6px 12px; cursor: pointer; font-size: 12px; font-weight: 600;">Markdown Source</button>
            <button class="rich-tab-btn" id="tabRendered" style="background: transparent; border: none; border-bottom: 2px solid transparent; color: var(--color-text-muted); padding: 6px 12px; cursor: pointer; font-size: 12px; font-weight: 600;">Rendered Preview</button>
          </div>

          <div id="tabContentMarkdown" class="tab-pane active">
            <textarea id="richPasteMarkdownPreview" readonly style="width: 100%; height: 200px; background: var(--color-surface-sunken); border: 1px solid var(--color-border-subtle); border-radius: 4px; color: var(--color-text-primary); font-family: var(--font-editor); font-size: 12px; padding: 10px; resize: vertical; outline: none; box-sizing: border-box;"></textarea>
          </div>

          <div id="tabContentRendered" class="tab-pane" style="display: none; height: 200px; overflow-y: auto; padding: 10px; background: var(--color-surface-sunken); border: 1px solid var(--color-border-subtle); border-radius: 4px;">
            <div id="richPasteRenderedPreview" class="preview-content"></div>
          </div>

          ${assetsTableHtml}
        </div>

        <div class="modal-actions" style="padding: 12px 18px; border-top: 1px solid var(--color-border-subtle); display: flex; justify-content: flex-end; gap: 8px;">
          <button class="btn btn-secondary" id="richPasteCancelBtn">Cancel</button>
          <button class="btn btn-primary" id="richPasteImportBtn" ${this.finalMarkdown.trim().length === 0 ? 'disabled' : ''}>Import Content</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const textarea = overlay.querySelector('#richPasteMarkdownPreview');
    if (textarea) textarea.value = this.finalMarkdown;

    // Tabs logic
    const tabMdBtn = overlay.querySelector('#tabMarkdown');
    const tabRenderedBtn = overlay.querySelector('#tabRendered');
    const paneMd = overlay.querySelector('#tabContentMarkdown');
    const paneRendered = overlay.querySelector('#tabContentRendered');
    const renderedContainer = overlay.querySelector('#richPasteRenderedPreview');

    tabMdBtn?.addEventListener('click', () => {
      tabMdBtn.classList.add('active');
      tabMdBtn.style.borderBottomColor = 'var(--color-accent)';
      tabMdBtn.style.color = '#fff';

      tabRenderedBtn.classList.remove('active');
      tabRenderedBtn.style.borderBottomColor = 'transparent';
      tabRenderedBtn.style.color = 'var(--color-text-muted)';

      paneMd.style.display = 'block';
      paneRendered.style.display = 'none';
    });

    tabRenderedBtn?.addEventListener('click', () => {
      tabRenderedBtn.classList.add('active');
      tabRenderedBtn.style.borderBottomColor = 'var(--color-accent)';
      tabRenderedBtn.style.color = '#fff';

      tabMdBtn.classList.remove('active');
      tabMdBtn.style.borderBottomColor = 'transparent';
      tabMdBtn.style.color = 'var(--color-text-muted)';

      paneMd.style.display = 'none';
      paneRendered.style.display = 'block';

      // Render Markdown preview safely
      const { html } = markdownPipeline.process({ content: this.finalMarkdown, id: 'preview-snippet' });
      if (renderedContainer) renderedContainer.innerHTML = html;
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

    eventBus.emit(AppEvents.NOTIFICATION, {
      type: 'success',
      message: `Rich content imported (${this.stagedAssets.length} asset(s)).`,
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
