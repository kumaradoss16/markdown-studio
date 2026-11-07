/**
 * ClipboardImportService
 * Compatibility wrapper bridging ClipboardCaptureService with legacy import consumers.
 */
import {
  ClipboardCaptureService,
  isMarkdownLooking,
  clipboardCaptureService
} from './clipboard-capture-service.js';

export { isMarkdownLooking, ClipboardCaptureService };

export class ClipboardImportService extends ClipboardCaptureService {
  /**
   * Alias inspect to capture()
   */
  async inspect() {
    return this.capture();
  }

  /**
   * Alias inspectFromDataTransfer to captureFromDataTransfer()
   */
  inspectFromDataTransfer(dataTransfer) {
    return this.captureFromDataTransfer(dataTransfer);
  }
}

export const clipboardImportService = new ClipboardImportService();
