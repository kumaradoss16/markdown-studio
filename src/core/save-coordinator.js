import { fileSystemService } from '../services/filesystem-service.js';
import { documentStateManager, DocumentState } from './document-state-manager.js';
import { ErrorCode, StudioError, normalizeError } from '../services/error-service.js';
import { AppEvents, eventBus } from '../app/events.js';

/**
 * SaveCoordinator coordinates atomic, revision-aware file persistence.
 */
export class SaveCoordinator {
  constructor(stateManager = documentStateManager, fsService = fileSystemService) {
    this.stateManager = stateManager;
    this.fsService = fsService;
    this.inFlightSaves = new Set();
  }

  /**
   * Saves the specified document.
   * @param {string} documentId
   * @param {string} [targetPath] - Optional override path (Save As)
   * @returns {Promise<{ success: boolean, path: string, revision: number }>}
   */
  async save(documentId, targetPath = null) {
    const doc = this.stateManager.documents.get(documentId);
    if (!doc) {
      throw new StudioError(ErrorCode.NOT_FOUND, `Cannot save unknown document ${documentId}`);
    }

    const path = targetPath || doc.path;
    if (!path) {
      throw new StudioError(ErrorCode.INVALID_INPUT, 'Document requires a file path to save. Use Save As.');
    }

    if (this.inFlightSaves.has(documentId)) {
      throw new StudioError(ErrorCode.SAVE_ABORTED, 'A save operation is already in progress for this document.');
    }

    this.inFlightSaves.add(documentId);

    // Snapshot revision and content at this exact moment
    const capturedRevision = this.stateManager.markSaving(documentId);
    const contentSnapshot = doc.content;
    const expectedHash = doc.diskHash;

    try {
      const result = await this.fsService.saveFile(path, contentSnapshot, expectedHash);
      
      this.stateManager.markSaved(
        documentId,
        capturedRevision,
        result.hash,
        targetPath ? path : null
      );

      eventBus.emit(AppEvents.NOTIFICATION, {
        type: 'success',
        message: `Saved "${doc.name}" successfully.`,
      });

      return {
        success: true,
        path: result.path,
        revision: capturedRevision,
      };
    } catch (rawErr) {
      const error = normalizeError(rawErr);
      this.stateManager.markSaveError(documentId, error);

      eventBus.emit(AppEvents.NOTIFICATION, {
        type: 'error',
        message: `Failed to save "${doc.name}": ${error.message}`,
      });

      throw error;
    } finally {
      this.inFlightSaves.delete(documentId);
    }
  }

  /**
   * Saves document to a new target path (Save As).
   * @param {string} documentId
   * @param {string} newPath
   * @returns {Promise<{ success: boolean, path: string, revision: number }>}
   */
  async saveAs(documentId, newPath) {
    return await this.save(documentId, newPath);
  }
}

export const saveCoordinator = new SaveCoordinator();
