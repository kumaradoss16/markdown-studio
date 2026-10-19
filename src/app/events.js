/**
 * Lightweight, typed event emitter for internal studio communication.
 */
export class EventEmitter {
  constructor() {
    this.listeners = new Map();
  }

  /**
   * @param {string} event
   * @param {Function} handler
   */
  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  /**
   * @param {string} event
   * @param {Function} handler
   */
  off(event, handler) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * @param {string} event
   * @param {any} [payload]
   */
  emit(event, payload) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(payload);
        } catch (err) {
          console.error(`Error in event listener for "${event}":`, err);
        }
      }
    }
  }
}

export const AppEvents = {
  DOCUMENT_OPENED: 'doc:opened',
  DOCUMENT_CHANGED: 'doc:changed',
  DOCUMENT_SAVED: 'doc:saved',
  DOCUMENT_CLOSED: 'doc:closed',
  DOCUMENT_ACTIVATED: 'doc:activated',
  DOCUMENT_DIRTY_STATE: 'doc:dirty_state',
  WORKSPACE_CHANGED: 'workspace:changed',
  VIEW_MODE_CHANGED: 'view:mode_changed',
  CURSOR_CHANGED: 'editor:cursor_changed',
  EDITOR_JUMP_TO_LINE: 'editor:jump_to_line',
  DIAGNOSTICS_UPDATED: 'diagnostics:updated',
  NOTIFICATION: 'ui:notification',
  DIALOG_OPEN: 'ui:dialog_open',
  DIALOG_CLOSE: 'ui:dialog_close',
  GITHUB_AUTH_CHANGED: 'github:auth_changed',
  GITHUB_DRAFT_REFRESHED: 'github:draft_refreshed',
  GITHUB_DIFF_REQUESTED: 'github:diff_requested',
  HISTORY_OPEN_REQUESTED: 'history:open_requested',
  HISTORY_SNAPSHOT_RECORDED: 'history:snapshot_recorded',
  RESTORE_PREVIEW_OPENED: 'restore:preview_opened',
  RESTORE_APPLIED: 'restore:applied',
  AUDIT_RECORDED: 'audit:recorded',
  QA_RUN_STARTED: 'qa:run_started',
  QA_RUN_PROGRESS: 'qa:run_progress',
  QA_RUN_COMPLETED: 'qa:run_completed',
  QA_REPORT_EXPORTED: 'qa:report_exported',
  QA_MODAL_OPEN: 'qa:modal_open',
  SETTINGS_CHANGED: 'settings:changed',
};

export const eventBus = new EventEmitter();
