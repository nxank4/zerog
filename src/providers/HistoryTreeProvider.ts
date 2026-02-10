import * as vscode from 'vscode';
import { ISessionMeta } from '../types';
import { SessionService } from '../services/SessionService';

/**
 * Tree item representing a single chat session in the History view.
 */
class SessionItem extends vscode.TreeItem {
  constructor(
    public readonly sessionMeta: ISessionMeta
  ) {
    super(sessionMeta.name, vscode.TreeItemCollapsibleState.None);
    this.tooltip = `${sessionMeta.name}\nLast modified: ${new Date(sessionMeta.lastModified).toLocaleString()}`;
    this.description = this._formatDate(sessionMeta.lastModified);
    this.contextValue = 'session';
    this.iconPath = new vscode.ThemeIcon('comment-discussion');
    this.command = {
      command: 'zerog.openSession',
      title: 'Open Session',
      arguments: [sessionMeta.id]
    };
  }

  private _formatDate(timestamp: number): string {
    const d = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) { return 'Just now'; }
    if (diffMins < 60) { return `${diffMins}m ago`; }
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) { return `${diffHours}h ago`; }
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) { return `${diffDays}d ago`; }
    return d.toLocaleDateString();
  }
}

/**
 * Tree data provider for the chat session history sidebar view.
 */
export class HistoryTreeProvider implements vscode.TreeDataProvider<SessionItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SessionItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private _sessionService: SessionService) {}

  /**
   * Refresh the tree view.
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SessionItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: SessionItem): Promise<SessionItem[]> {
    if (element) {
      return []; // Flat list, no children
    }
    const sessions = await this._sessionService.listSessions();
    return sessions.map(s => new SessionItem(s));
  }
}
