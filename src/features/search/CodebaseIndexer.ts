import * as vscode from 'vscode';
import MiniSearch from 'minisearch';

export interface ICodebaseSearchResult {
  filePath: string;
  filename: string;
  content: string;
  score: number;
}

export class CodebaseIndexer implements vscode.Disposable {
  private _index: MiniSearch;
  private _status: 'idle' | 'indexing' | 'ready' = 'idle';
  private _onStatusChange = new vscode.EventEmitter<string>();
  readonly onStatusChange: vscode.Event<string> = this._onStatusChange.event;
  private _debounceTimer: NodeJS.Timeout | null = null;
  private _disposables: vscode.Disposable[] = [];

  private static readonly EXCLUDE_PATTERN =
    '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/build/**,**/coverage/**,**/*.lock,**/*.png,**/*.jpg,**/*.jpeg,**/*.gif,**/*.svg,**/*.ico,**/*.woff,**/*.woff2,**/*.ttf,**/*.eot,**/*.map,**/*.min.js}';

  private static readonly MAX_FILE_SIZE = 10240; // 10KB

  constructor() {
    this._index = new MiniSearch({
      fields: ['filename', 'content'],
      storeFields: ['filename'],
      searchOptions: {
        boost: { filename: 2 },
        prefix: true,
        fuzzy: 0.2,
      },
    });

    this._setupWatchers();
  }

  public get status(): string {
    return this._status;
  }

  public async buildIndex(): Promise<void> {
    this._status = 'indexing';
    this._onStatusChange.fire('indexing');

    try {
      const files = await vscode.workspace.findFiles('**/*', CodebaseIndexer.EXCLUDE_PATTERN);

      const documents: { id: string; filename: string; content: string }[] = [];

      for (const file of files) {
        try {
          const data = await vscode.workspace.fs.readFile(file);
          const content = Buffer.from(data).toString('utf8').substring(0, CodebaseIndexer.MAX_FILE_SIZE);
          const relativePath = vscode.workspace.asRelativePath(file);
          const filename = file.path.split('/').pop() || relativePath;

          documents.push({ id: relativePath, filename, content });
        } catch {
          // Skip files that can't be read
        }
      }

      this._index.removeAll();
      this._index.addAll(documents);

      this._status = 'ready';
      this._onStatusChange.fire('ready');
      console.log(`[CodebaseIndexer] Indexed ${documents.length} files`);
    } catch (error) {
      console.error('[CodebaseIndexer] Build index failed:', error);
      this._status = 'idle';
      this._onStatusChange.fire('idle');
    }
  }

  public async search(query: string, maxResults = 5): Promise<ICodebaseSearchResult[]> {
    if (this._status !== 'ready') {
      return [];
    }

    const results = this._index.search(query, {
      prefix: true,
      fuzzy: 0.2,
      boost: { filename: 2 },
    });

    const topResults = results.slice(0, maxResults);
    const searchResults: ICodebaseSearchResult[] = [];

    for (const result of topResults) {
      try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) { continue; }

        const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, result.id);
        const data = await vscode.workspace.fs.readFile(fileUri);
        const content = Buffer.from(data).toString('utf8').substring(0, CodebaseIndexer.MAX_FILE_SIZE);

        searchResults.push({
          filePath: result.id,
          filename: result.filename as string,
          content,
          score: result.score,
        });
      } catch {
        // Skip files that can't be read at search time
      }
    }

    return searchResults;
  }

  private _setupWatchers(): void {
    const createWatcher = vscode.workspace.onDidCreateFiles(() => this._scheduleReindex());
    const deleteWatcher = vscode.workspace.onDidDeleteFiles(() => this._scheduleReindex());
    const changeWatcher = vscode.workspace.onDidChangeTextDocument(() => this._scheduleReindex());

    this._disposables.push(createWatcher, deleteWatcher, changeWatcher);
  }

  private _scheduleReindex(): void {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }
    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null;
      this.buildIndex();
    }, 5000);
  }

  public dispose(): void {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    this._disposables.forEach(d => d.dispose());
    this._disposables = [];
    this._onStatusChange.dispose();
  }
}
