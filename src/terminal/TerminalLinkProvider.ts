import * as vscode from 'vscode';

/**
 * Custom Terminal Link with additional data
 */
class ZeroGTerminalLink implements vscode.TerminalLink {
  public startIndex: number;
  public length: number;
  public tooltip?: string;
  public data: any;

  constructor(startIndex: number, length: number, tooltip: string, data: any) {
    this.startIndex = startIndex;
    this.length = length;
    this.tooltip = tooltip;
    this.data = data;
  }
}

/**
 * Terminal Link Provider for detecting errors and file paths in terminal output.
 * Provides "Fix with Zero-G" functionality for terminal errors.
 */
export class TerminalLinkProvider implements vscode.TerminalLinkProvider {
  private _onDidOpenTerminalLink = new vscode.EventEmitter<{ error: string }>();
  public readonly onDidOpenTerminalLink = this._onDidOpenTerminalLink.event;

  /**
   * Provide terminal links for error patterns and file paths.
   */
  public provideTerminalLinks(
    context: vscode.TerminalLinkContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.TerminalLink[]> {
    const line = context.line;
    const links: vscode.TerminalLink[] = [];

    // Pattern 1: Error messages (Error:, Exception:, TypeError:, etc.)
    const errorPatterns = [
      /\b(Error|Exception|TypeError|ReferenceError|SyntaxError|ValueError|RuntimeError|AssertionError|AttributeError|KeyError|IndexError|FileNotFoundError):\s*(.+)/gi,
    ];

    for (const pattern of errorPatterns) {
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const startIndex = match.index;
        const length = match[0].length;
        
        links.push(new ZeroGTerminalLink(
          startIndex,
          length,
          '🔧 Fix with Zero-G',
          {
            type: 'error',
            errorType: match[1],
            message: match[0],
            lineNumber: context.line,
            terminal: context.terminal
          }
        ));
      }
    }

    // Pattern 2: File paths with line numbers (e.g., src/main.ts:10:5, /path/to/file.py:42)
    const filePathPattern = /([a-zA-Z0-9_\-./\\]+\.(ts|js|tsx|jsx|py|java|cpp|c|cs|go|rs|php|rb|swift|kt|scala|dart|lua|r|m)):(\d+)(?::(\d+))?/g;
    
    let fileMatch;
    while ((fileMatch = filePathPattern.exec(line)) !== null) {
      const startIndex = fileMatch.index;
      const length = fileMatch[0].length;
      
      links.push(new ZeroGTerminalLink(
        startIndex,
        length,
        '🔧 Fix with Zero-G',
        {
          type: 'file-error',
          filePath: fileMatch[1],
          lineNumber: parseInt(fileMatch[3]),
          column: fileMatch[4] ? parseInt(fileMatch[4]) : undefined,
          fullMatch: fileMatch[0],
          terminal: context.terminal
        }
      ));
    }

    return links;
  }

  /**
   * Handle terminal link activation.
   */
  public handleTerminalLink(link: vscode.TerminalLink): void {
    const data = (link as ZeroGTerminalLink).data;

    if (data.type === 'error') {
      this._handleErrorLink(data);
    } else if (data.type === 'file-error') {
      this._handleFileErrorLink(data);
    }
  }

  /**
   * Handle error pattern link (Error:, Exception:, etc.)
   */
  private async _handleErrorLink(data: any): Promise<void> {
    // Capture terminal context (error line + 5 previous lines)
    const errorContext = await this._captureTerminalContext(data.terminal, 5);
    
    // Format error message
    const errorMessage = `I got this error in the terminal:\n\n${errorContext}\n\nHow do I fix it?`;
    
    // Emit event to open chat and send message
    this._onDidOpenTerminalLink.fire({ error: errorMessage });
  }

  /**
   * Handle file path with line number link
   */
  private async _handleFileErrorLink(data: any): Promise<void> {
    // Try to open the file at the specific line
    try {
      const uri = vscode.Uri.file(data.filePath);
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document);
      
      // Navigate to the specific line
      const position = new vscode.Position(Math.max(0, data.lineNumber - 1), data.column ? data.column - 1 : 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
      
      // Also capture terminal context for AI
      const errorContext = await this._captureTerminalContext(data.terminal, 5);
      const errorMessage = `I got an error pointing to ${data.filePath}:${data.lineNumber}.\n\nTerminal output:\n${errorContext}\n\nHow do I fix this?`;
      
      // Emit event to open chat
      this._onDidOpenTerminalLink.fire({ error: errorMessage });
    } catch (error) {
      // If file can't be opened, just show the error in chat
      const errorContext = await this._captureTerminalContext(data.terminal, 5);
      const errorMessage = `I got an error in the terminal referencing ${data.filePath}:${data.lineNumber}:\n\n${errorContext}\n\nHow do I fix it?`;
      
      this._onDidOpenTerminalLink.fire({ error: errorMessage });
    }
  }

  /**
   * Capture terminal output context (current line + N previous lines)
   * Note: VS Code API doesn't provide direct terminal buffer access,
   * so this is a simplified implementation that returns placeholder text.
   * 
   * @param terminal - Terminal instance
   * @param previousLines - Number of previous lines to capture
   * @returns Terminal context string
   */
  private async _captureTerminalContext(terminal: vscode.Terminal, previousLines: number): Promise<string> {
    // VS Code Terminal API doesn't expose buffer content directly
    // This is a limitation of the current API
    // We'll return a message instructing the user to paste the error
    
    return `[Terminal output - please paste the relevant error details if needed]`;
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    this._onDidOpenTerminalLink.dispose();
  }
}
