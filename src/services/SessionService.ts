import * as vscode from 'vscode';
import { IChatMessage, ISessionMeta, ZeroGMode } from '../types';

/**
 * Service for managing chat session persistence using globalStorageUri.
 * Sessions are stored as individual JSON files with a lightweight index.
 */
export class SessionService {
  private _storageUri: vscode.Uri;
  private _sessionsDir: vscode.Uri;
  private _indexUri: vscode.Uri;
  private _saveTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(globalStorageUri: vscode.Uri) {
    this._storageUri = globalStorageUri;
    this._sessionsDir = vscode.Uri.joinPath(globalStorageUri, 'sessions');
    this._indexUri = vscode.Uri.joinPath(globalStorageUri, 'session_index.json');
  }

  /**
   * Ensure storage directories exist.
   */
  async initialize(): Promise<void> {
    try {
      await vscode.workspace.fs.createDirectory(this._storageUri);
    } catch {
      // May already exist
    }
    try {
      await vscode.workspace.fs.createDirectory(this._sessionsDir);
    } catch {
      // May already exist
    }
  }

  /**
   * List all sessions sorted by lastModified (newest first).
   */
  async listSessions(): Promise<ISessionMeta[]> {
    try {
      const data = await vscode.workspace.fs.readFile(this._indexUri);
      const index: ISessionMeta[] = JSON.parse(Buffer.from(data).toString('utf8'));
      return index.sort((a, b) => b.lastModified - a.lastModified);
    } catch {
      return [];
    }
  }

  /**
   * Load a session's full message history.
   */
  async loadSession(id: string): Promise<{ messages: IChatMessage[]; mode: ZeroGMode } | null> {
    try {
      const uri = vscode.Uri.joinPath(this._sessionsDir, `${id}.json`);
      const data = await vscode.workspace.fs.readFile(uri);
      return JSON.parse(Buffer.from(data).toString('utf8'));
    } catch {
      return null;
    }
  }

  /**
   * Save a session (debounced — writes after 1s of inactivity).
   */
  saveSession(id: string, messages: IChatMessage[], mode: ZeroGMode, name?: string): void {
    const existing = this._saveTimers.get(id);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(async () => {
      this._saveTimers.delete(id);
      await this._doSave(id, messages, mode, name);
    }, 1000);
    this._saveTimers.set(id, timer);
  }

  /**
   * Immediately save a session (bypasses debounce).
   */
  async saveSessionImmediate(id: string, messages: IChatMessage[], mode: ZeroGMode, name?: string): Promise<void> {
    const existing = this._saveTimers.get(id);
    if (existing) {
      clearTimeout(existing);
      this._saveTimers.delete(id);
    }
    await this._doSave(id, messages, mode, name);
  }

  private async _doSave(id: string, messages: IChatMessage[], mode: ZeroGMode, name?: string): Promise<void> {
    try {
      // Write session data
      const uri = vscode.Uri.joinPath(this._sessionsDir, `${id}.json`);
      const content = JSON.stringify({ messages, mode }, null, 2);
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));

      // Update index
      const sessions = await this.listSessions();
      const entry = sessions.find(s => s.id === id);
      if (entry) {
        entry.lastModified = Date.now();
        if (name) {
          entry.name = name;
        }
      } else {
        sessions.push({
          id,
          name: name || 'New Chat',
          lastModified: Date.now()
        });
      }
      await vscode.workspace.fs.writeFile(
        this._indexUri,
        Buffer.from(JSON.stringify(sessions, null, 2), 'utf8')
      );
    } catch (err: any) {
      console.error('[SessionService] Save failed:', err);
    }
  }

  /**
   * Delete a session file and remove from index.
   */
  async deleteSession(id: string): Promise<void> {
    try {
      const uri = vscode.Uri.joinPath(this._sessionsDir, `${id}.json`);
      await vscode.workspace.fs.delete(uri);
    } catch {
      // File may not exist
    }

    const sessions = await this.listSessions();
    const filtered = sessions.filter(s => s.id !== id);
    await vscode.workspace.fs.writeFile(
      this._indexUri,
      Buffer.from(JSON.stringify(filtered, null, 2), 'utf8')
    );
  }

  /**
   * Rename a session (index-only update).
   */
  async renameSession(id: string, newName: string): Promise<void> {
    const sessions = await this.listSessions();
    const session = sessions.find(s => s.id === id);
    if (session) {
      session.name = newName;
      await vscode.workspace.fs.writeFile(
        this._indexUri,
        Buffer.from(JSON.stringify(sessions, null, 2), 'utf8')
      );
    }
  }

  /**
   * Generate a unique session ID.
   */
  generateSessionId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  }

  /**
   * Flush all pending debounced saves. Call on extension deactivation.
   */
  async flush(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [, timer] of this._saveTimers) {
      clearTimeout(timer);
    }
    this._saveTimers.clear();
  }
}
