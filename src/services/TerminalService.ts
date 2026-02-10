import * as vscode from 'vscode';

/**
 * Service responsible for terminal operations and command execution
 */
export class TerminalService {
  private static readonly TERMINAL_NAME = 'Zero-G';
  private _terminal: vscode.Terminal | undefined;

  /**
   * Get or create the Zero-G terminal
   * @returns The Zero-G terminal instance
   */
  private _getTerminal(): vscode.Terminal {
    // Check if terminal still exists
    if (this._terminal) {
      // Verify it's still in the terminals list
      const existingTerminal = vscode.window.terminals.find(
        t => t.name === TerminalService.TERMINAL_NAME
      );
      
      if (existingTerminal) {
        this._terminal = existingTerminal;
        return this._terminal;
      }
    }

    // Create new terminal
    this._terminal = vscode.window.createTerminal({
      name: TerminalService.TERMINAL_NAME,
      iconPath: new vscode.ThemeIcon('rocket')
    });

    return this._terminal;
  }

  /**
   * Execute a command in the Zero-G terminal with user confirmation
   * @param command - Command to execute
   * @param skipConfirmation - Skip confirmation dialog (default: false)
   * @returns Promise<boolean> - True if executed, false if cancelled
   */
  public async executeCommand(command: string, skipConfirmation: boolean = false): Promise<boolean> {
    if (!command.trim()) {
      vscode.window.showWarningMessage('No command to execute');
      return false;
    }

    // Show confirmation dialog (unless skipped)
    if (!skipConfirmation) {
      const confirmation = await vscode.window.showWarningMessage(
        `Do you want to run this command?\n\n${command}`,
        { modal: true },
        'Run',
        'Copy Only'
      );

      if (confirmation === 'Copy Only') {
        await vscode.env.clipboard.writeText(command);
        vscode.window.showInformationMessage('Command copied to clipboard');
        return false;
      }

      if (confirmation !== 'Run') {
        return false; // User cancelled
      }
    }

    // Get or create terminal
    const terminal = this._getTerminal();

    // Show the terminal
    terminal.show(true); // true = preserve focus on editor

    // Send command
    terminal.sendText(command);

    vscode.window.showInformationMessage(`Command sent to ${TerminalService.TERMINAL_NAME} terminal`);
    return true;
  }

  /**
   * Execute multiple commands sequentially
   * @param commands - Array of commands to execute
   * @param skipConfirmation - Skip confirmation dialog
   * @returns Promise<boolean> - True if all executed, false if any cancelled
   */
  public async executeCommands(commands: string[], skipConfirmation: boolean = false): Promise<boolean> {
    if (commands.length === 0) {
      return false;
    }

    // If multiple commands, show them all in confirmation
    if (!skipConfirmation) {
      const commandList = commands.map((cmd, i) => `${i + 1}. ${cmd}`).join('\n');
      const confirmation = await vscode.window.showWarningMessage(
        `Do you want to run these ${commands.length} commands?\n\n${commandList}`,
        { modal: true },
        'Run All',
        'Copy All'
      );

      if (confirmation === 'Copy All') {
        await vscode.env.clipboard.writeText(commands.join('\n'));
        vscode.window.showInformationMessage('Commands copied to clipboard');
        return false;
      }

      if (confirmation !== 'Run All') {
        return false;
      }
    }

    // Get or create terminal
    const terminal = this._getTerminal();
    terminal.show(true);

    // Execute commands sequentially
    for (const command of commands) {
      terminal.sendText(command);
      // Small delay between commands to avoid overwhelming the terminal
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    vscode.window.showInformationMessage(`${commands.length} commands sent to ${TerminalService.TERMINAL_NAME} terminal`);
    return true;
  }

  /**
   * Check if a command is potentially dangerous
   * @param command - Command to check
   * @returns True if command might be dangerous
   */
  public isDangerousCommand(command: string): boolean {
    const dangerousPatterns = [
      /rm\s+-rf\s+\//,           // rm -rf /
      /rm\s+-rf\s+\*/,           // rm -rf *
      /:\(\)\{.*\|.*&\s*\};:/,   // Fork bomb
      /dd\s+if=/,                // dd command (disk operations)
      /mkfs\./,                  // Format filesystem
      />\s*\/dev\/sd/,           // Write to disk device
      /curl.*\|\s*bash/,         // Pipe curl to bash
      /wget.*\|\s*sh/,           // Pipe wget to sh
      /sudo\s+rm/,               // sudo rm
      /chmod\s+-R\s+777/,        // chmod 777 (security risk)
    ];

    return dangerousPatterns.some(pattern => pattern.test(command));
  }

  /**
   * Extract shell commands from text
   * @param text - Text that might contain commands
   * @returns Array of detected commands
   */
  public extractCommands(text: string): string[] {
    const commands: string[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines, comments
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
        continue;
      }

      // Skip shell prompts
      if (trimmed.startsWith('$') || trimmed.startsWith('>')) {
        commands.push(trimmed.substring(1).trim());
      } else if (!trimmed.includes(' ') && trimmed.length > 30) {
        // Skip long single-word lines (likely not commands)
        continue;
      } else {
        commands.push(trimmed);
      }
    }

    return commands;
  }

  /**
   * Clear the terminal
   */
  public clearTerminal(): void {
    const terminal = this._getTerminal();
    terminal.sendText('clear');
  }

  /**
   * Dispose of the terminal
   */
  public disposeTerminal(): void {
    if (this._terminal) {
      this._terminal.dispose();
      this._terminal = undefined;
    }
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    // Don't dispose terminal on service disposal
    // Let user close it manually
  }
}
