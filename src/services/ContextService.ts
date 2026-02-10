import * as vscode from 'vscode';
import { IContextItem, IContextMetadata } from '../types';

/**
 * Service responsible for managing code context (files, selections)
 */
export class ContextService {
  
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
}
