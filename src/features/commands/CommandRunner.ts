import * as vscode from 'vscode';
import { exec } from 'child_process';
import { LogService } from '../../core/LogService';

export interface ICommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
}

/**
 * Executes shell commands via child_process.exec and captures output.
 * Replaces TerminalService.executeCommand() for cases where output is needed.
 */
export class CommandRunner {
  private static readonly TIMEOUT = 30_000; // 30 seconds
  private static readonly MAX_BUFFER = 1024 * 1024; // 1MB

  /**
   * Run a command and return captured stdout/stderr.
   */
  public run(command: string): Promise<ICommandResult> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const log = LogService.instance();

    log.logCommand(command);

    return new Promise(resolve => {
      exec(
        command,
        {
          cwd: workspaceRoot || undefined,
          timeout: CommandRunner.TIMEOUT,
          maxBuffer: CommandRunner.MAX_BUFFER,
        },
        (error, stdout, stderr) => {
          if (stdout.trim()) {
            log.logOutput(stdout.trim());
          }
          if (stderr.trim()) {
            log.logOutput('ERROR: ' + stderr.trim());
          }
          if (error) {
            log.logOutput(`Exit code: ${error.code ?? 1}`);
          }

          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: error?.code ?? (error ? 1 : 0),
            success: !error,
          });
        }
      );
    });
  }
}
