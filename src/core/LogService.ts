import * as vscode from 'vscode';

/**
 * Singleton output-channel logger for command executions.
 * Writes to the "Zero-G Console" output channel so users can inspect
 * what ran and what it returned.
 */
export class LogService implements vscode.Disposable {
  private static _instance: LogService | null = null;
  private _channel: vscode.OutputChannel;

  private constructor() {
    this._channel = vscode.window.createOutputChannel('Zero-G Console');
  }

  public static instance(): LogService {
    if (!LogService._instance) {
      LogService._instance = new LogService();
    }
    return LogService._instance;
  }

  /** Log a command about to be executed. */
  public logCommand(command: string): void {
    const ts = new Date().toLocaleTimeString();
    this._channel.appendLine(`> [${ts}] Executing: ${command}`);
  }

  /** Log arbitrary output (stdout, stderr, etc.). */
  public logOutput(data: string): void {
    if (data) {
      this._channel.appendLine(data);
    }
  }

  /** Focus the output channel panel. */
  public show(): void {
    this._channel.show(true);
  }

  public dispose(): void {
    this._channel.dispose();
    LogService._instance = null;
  }
}
