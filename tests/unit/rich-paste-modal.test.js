import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RichPasteModalComponent } from '../../src/components/import/rich-paste-modal.js';
import { documentStateManager } from '../../src/core/document-state-manager.js';
import { fileSystemAdapter } from '../../src/services/filesystem-adapter.js';

describe('RichPasteModalComponent (Slice 2)', () => {
  let modal;
  let doc;

  beforeEach(() => {
    doc = documentStateManager.createDocument('Test Doc.md', '# Initial Content\n\n');
    modal = new RichPasteModalComponent();
  });

  afterEach(() => {
    modal.close();
  });

  it('populates element counts from converted HTML payload', async () => {
    const payload = {
      formats: ['text/html'],
      text: 'Heading\nParagraph',
      html: '<h1>Heading</h1><p>Paragraph</p><table><tr><th>A</th></tr><tr><td>B</td></tr></table>',
      images: [],
    };

    await modal.processClipboardPayload(payload);
    expect(modal.counts.headings).toBe(1);
    expect(modal.counts.paragraphs).toBe(1);
    expect(modal.counts.tables).toBe(1);
    expect(modal.finalMarkdown).toContain('# Heading');
    expect(modal.finalMarkdown).toContain('Paragraph');
  });

  it('cancel performs zero file writes and leaves document untouched', async () => {
    const writeSpy = vi.spyOn(fileSystemAdapter, 'writeBinaryFile');
    const updateSpy = vi.spyOn(documentStateManager, 'updateContent');

    await modal.processClipboardPayload({
      formats: ['text/html'],
      text: 'Test',
      html: '<p>New Content</p>',
      images: [],
    });

    modal.render();
    const cancelBtn = modal.overlay.querySelector('#richPasteCancelBtn');
    cancelBtn.click();

    expect(writeSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(doc.content).toBe('# Initial Content\n\n');
    expect(modal.overlay).toBeNull();
  });

  it('import commits markdown and staged assets once', async () => {
    const fakeBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const mockBlob = new Blob([fakeBytes], { type: 'image/png' });
    mockBlob.arrayBuffer = async () => fakeBytes.buffer;

    await modal.processClipboardPayload({
      formats: ['image/png'],
      text: null,
      html: null,
      images: [{ blob: mockBlob, mime: 'image/png' }],
    });

    expect(modal.stagedAssets.length).toBe(1);

    const commitSpy = vi.spyOn(fileSystemAdapter, 'writeBinaryFile').mockResolvedValue(true);

    modal.render();
    const importBtn = modal.overlay.querySelector('#richPasteImportBtn');
    await modal.commitImport();

    expect(commitSpy).toHaveBeenCalled();
    expect(doc.content).toContain('![pasted-image](assets/');
    expect(modal.overlay).toBeNull();
  });
});
