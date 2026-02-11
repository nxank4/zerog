import * as vscode from 'vscode';
import * as path from 'path';
import { IContextItem, IContextMetadata } from '../types';

/**
 * Service responsible for managing code context (files, selections)
 */
export class ContextService {
  private _projectMapCache: string | null = null;
  private _fileWatcher: vscode.FileSystemWatcher | null = null;
  private _ignorePatterns: string[] = [
    'node_modules',
    '.git',
    'dist',
    'build',
    'out',
    '__pycache__',
    '.vscode',
    '.idea',
    'coverage',
    '.next',
    '.nuxt',
    'vendor',
    'target',
    'bin',
    'obj',
    '.DS_Store',
    '*.log',
    '*.lock',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml'
  ];
  
  /**
   * Gather context from the currently active editor
   * @returns Context item and metadata
   */
  public gatherActiveEditorContext(): { contextItem: IContextItem | null; metadata: IContextMetadata } {
    const editor = vscode.window.activeTextEditor;
    
    if (!editor) {
      return {
        contextItem: null,
        metadata: { hasContext: false }
      };
    }

    const document = editor.document;
    const selection = editor.selection;
    const fileName = document.fileName.split('/').pop() || 'Unknown';
    const languageId = document.languageId;
    const selectedText = document.getText(selection);
    
    const metadata: IContextMetadata = {
      hasContext: true,
      fileName: fileName,
      languageId: languageId
    };

    let contextItem: IContextItem;

    // Handle selection
    if (selectedText && !selection.isEmpty) {
      const startLine = selection.start.line + 1;
      const endLine = selection.end.line + 1;
      
      contextItem = {
        path: document.fileName,
        content: selectedText,
        type: 'selection',
        fileName: fileName,
        languageId: languageId,
        lineRange: {
          start: startLine,
          end: endLine
        }
      };
      
      metadata.selectionLines = `${startLine}-${endLine}`;
    } 
    // Handle full file or cursor context
    else {
      const fullText = document.getText();
      const lineCount = document.lineCount;
      
      if (lineCount <= 100) {
        // Include entire file if small
        contextItem = {
          path: document.fileName,
          content: fullText,
          type: 'file',
          fileName: fileName,
          languageId: languageId,
          lineRange: {
            start: 1,
            end: lineCount
          }
        };
      } else {
        // Include cursor context for large files (±25 lines)
        const cursorLine = selection.active.line;
        const startLine = Math.max(0, cursorLine - 25);
        const endLine = Math.min(lineCount - 1, cursorLine + 25);
        const contextText = document.getText(
          new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length)
        );
        
        contextItem = {
          path: document.fileName,
          content: contextText,
          type: 'file',
          fileName: fileName,
          languageId: languageId,
          lineRange: {
            start: startLine + 1,
            end: endLine + 1
          }
        };
        
        metadata.selectionLines = `${startLine + 1}-${endLine + 1} of ${lineCount}`;
      }
    }

    return { contextItem, metadata };
  }

  /**
   * Resolve context for multiple file paths
   * @param filePaths - Array of file paths
   * @returns Array of context items
   */
  public async resolveContext(filePaths: string[]): Promise<IContextItem[]> {
    const contextItems: IContextItem[] = [];

    for (const filePath of filePaths) {
      try {
        const uri = vscode.Uri.file(filePath);
        const fileData = await vscode.workspace.fs.readFile(uri);
        const content = Buffer.from(fileData).toString('utf8');
        const fileName = uri.path.split('/').pop() || 'unknown';
        
        // Try to determine language from file extension
        const ext = fileName.split('.').pop() || '';
        const languageId = this._getLanguageFromExtension(ext);

        contextItems.push({
          path: filePath,
          content: content,
          type: 'file',
          fileName: fileName,
          languageId: languageId
        });
      } catch (error: any) {
        console.error(`Failed to read file ${filePath}:`, error.message);
      }
    }

    return contextItems;
  }

  /**
   * Search for files in the workspace
   * @param query - Search query (glob pattern)
   * @returns Array of file URIs
   */
  public async searchFiles(query: string): Promise<vscode.Uri[]> {
    try {
      // Convert query to glob pattern if needed
      const globPattern = query.includes('*') ? query : `**/*${query}*`;
      
      const files = await vscode.workspace.findFiles(
        globPattern,
        '**/node_modules/**', // Exclude node_modules
        100 // Limit to 100 results
      );

      return files;
    } catch (error: any) {
      console.error('File search error:', error.message);
      return [];
    }
  }

  /**
   * Get language ID from file extension
   */
  private _getLanguageFromExtension(ext: string): string {
    const languageMap: { [key: string]: string } = {
      'ts': 'typescript',
      'js': 'javascript',
      'tsx': 'typescriptreact',
      'jsx': 'javascriptreact',
      'py': 'python',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'cs': 'csharp',
      'go': 'go',
      'rs': 'rust',
      'php': 'php',
      'rb': 'ruby',
      'swift': 'swift',
      'kt': 'kotlin',
      'md': 'markdown',
      'json': 'json',
      'xml': 'xml',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'yaml': 'yaml',
      'yml': 'yaml',
      'sh': 'shellscript',
      'sql': 'sql'
    };

    return languageMap[ext.toLowerCase()] || ext;
  }

  /**
   * Generate a project map of the workspace structure.
   * Returns a cached version if available, otherwise scans the workspace.
   *
   * @returns Tree-like string representation of the project structure
   */
  public async generateProjectMap(): Promise<string> {
    // Return cached version if available
    if (this._projectMapCache) {
      return this._projectMapCache;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return 'No workspace folder open';
    }

    let projectMap = '📁 Project Structure:\n\n';

    for (const folder of workspaceFolders) {
      const folderName = folder.name;
      projectMap += `${folderName}/\n`;
      
      const structure = await this._scanDirectory(folder.uri, '', 0);
      projectMap += structure;
    }

    // Cache the result
    this._projectMapCache = projectMap;

    // Set up file watcher if not already done
    if (!this._fileWatcher) {
      this._setupFileWatcher();
    }

    return projectMap;
  }

  /**
   * Recursively scan a directory and build a tree structure.
   *
   * @param uri - Directory URI to scan
   * @param indent - Current indentation level
   * @param depth - Current depth (limits recursion)
   * @returns String representation of directory structure
   */
  private async _scanDirectory(uri: vscode.Uri, indent: string, depth: number): Promise<string> {
    // Limit depth to prevent performance issues
    const MAX_DEPTH = 5;
    if (depth >= MAX_DEPTH) {
      return '';
    }

    let structure = '';

    try {
      const entries = await vscode.workspace.fs.readDirectory(uri);
      
      // Sort: directories first, then files
      const sorted = entries.sort((a, b) => {
        if (a[1] === b[1]) {
          return a[0].localeCompare(b[0]);
        }
        return a[1] === vscode.FileType.Directory ? -1 : 1;
      });

      for (const [name, type] of sorted) {
        // Skip ignored patterns
        if (this._shouldIgnore(name)) {
          continue;
        }

        const entryUri = vscode.Uri.joinPath(uri, name);

        if (type === vscode.FileType.Directory) {
          structure += `${indent}  📂 ${name}/\n`;
          // Recursively scan subdirectory
          structure += await this._scanDirectory(entryUri, indent + '    ', depth + 1);
        } else if (type === vscode.FileType.File) {
          // Only show relevant file types
          if (this._isRelevantFile(name)) {
            structure += `${indent}  📄 ${name}\n`;
          }
        }
      }
    } catch (error: any) {
      console.error(`Failed to scan directory ${uri.fsPath}:`, error.message);
    }

    return structure;
  }

  /**
   * Check if a file/directory should be ignored.
   *
   * @param name - File or directory name
   * @returns True if should be ignored
   */
  private _shouldIgnore(name: string): boolean {
    // Check exact matches
    if (this._ignorePatterns.includes(name)) {
      return true;
    }

    // Check pattern matches (e.g., *.log)
    for (const pattern of this._ignorePatterns) {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        if (regex.test(name)) {
          return true;
        }
      }
    }

    // Ignore hidden files/folders (starting with .)
    if (name.startsWith('.') && name !== '.env') {
      return true;
    }

    return false;
  }

  /**
   * Check if a file is relevant to show in the project map.
   * Filters out binary files, large files, etc.
   *
   * @param fileName - File name
   * @returns True if file is relevant
   */
  private _isRelevantFile(fileName: string): boolean {
    const relevantExtensions = [
      // Code
      '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cpp', '.c', '.h', '.cs', '.go', '.rs',
      '.php', '.rb', '.swift', '.kt', '.scala', '.dart', '.lua', '.r', '.m', '.mm',
      // Web
      '.html', '.css', '.scss', '.sass', '.less', '.vue', '.svelte',
      // Config
      '.json', '.yaml', '.yml', '.toml', '.ini', '.conf', '.config',
      '.xml', '.env', '.properties',
      // Documentation
      '.md', '.mdx', '.txt', '.rst', '.adoc',
      // Scripts
      '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
      // Data
      '.sql', '.graphql', '.proto',
      // Special files
      'Dockerfile', 'Makefile', 'Rakefile', 'Gemfile', 'Podfile'
    ];

    // Check if file has relevant extension
    const ext = path.extname(fileName).toLowerCase();
    if (relevantExtensions.includes(ext)) {
      return true;
    }

    // Check if it's a special file without extension
    const specialFiles = ['Dockerfile', 'Makefile', 'Rakefile', 'Gemfile', 'Podfile', 'LICENSE', 'README'];
    if (specialFiles.some(special => fileName.startsWith(special))) {
      return true;
    }

    return false;
  }

  /**
   * Set up file system watcher to invalidate cache when files change.
   */
  private _setupFileWatcher(): void {
    // Watch for file/folder creation and deletion
    this._fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');

    this._fileWatcher.onDidCreate(() => {
      this._invalidateProjectMapCache();
    });

    this._fileWatcher.onDidDelete(() => {
      this._invalidateProjectMapCache();
    });
  }

  /**
   * Invalidate the project map cache.
   * Forces regeneration on next request.
   */
  private _invalidateProjectMapCache(): void {
    console.log('[ContextService] Project map cache invalidated');
    this._projectMapCache = null;
  }

  /**
   * Get the cached project map (if available).
   *
   * @returns Cached project map or null
   */
  public getCachedProjectMap(): string | null {
    return this._projectMapCache;
  }

  /**
   * Dispose of resources (file watcher).
   */
  public dispose(): void {
    if (this._fileWatcher) {
      this._fileWatcher.dispose();
      this._fileWatcher = null;
    }
  }
}
