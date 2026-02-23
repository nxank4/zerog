import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { PromptFactory } from '../../core/PromptFactory';
import { LogService } from '../../core/LogService';

export interface IToolResult {
  output: string;
  status: 'success' | 'error';
}

export class ToolHandler {
  private static readonly COMMAND_TIMEOUT = 30_000; // 30 seconds

  /**
   * Execute a tool call and return the result.
   */
  public async execute(toolName: string, args: Record<string, any>): Promise<IToolResult> {
    switch (toolName) {
      case 'read_file':
        return this._readFile(args.file_path);
      case 'write_file':
        return this._writeFile(args.file_path, args.content);
      case 'run_command':
        return this._runCommand(args.command);
      default:
        return { output: `Unknown tool: ${toolName}`, status: 'error' };
    }
  }

  private async _readFile(filePath: string): Promise<IToolResult> {
    try {
      const absolutePath = this._resolveFilePath(filePath);
      const uri = vscode.Uri.file(absolutePath);
      const data = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(data).toString('utf8');
      return { output: content, status: 'success' };
    } catch (error: any) {
      return { output: `Failed to read file: ${error.message}`, status: 'error' };
    }
  }

  private async _writeFile(filePath: string, content: string): Promise<IToolResult> {
    try {
      const absolutePath = this._resolveFilePath(filePath);
      const cleanContent = PromptFactory.stripFilePathComment(content);
      const uri = vscode.Uri.file(absolutePath);

      // Ensure parent directory exists
      const dirUri = vscode.Uri.file(path.dirname(absolutePath));
      try {
        await vscode.workspace.fs.stat(dirUri);
      } catch {
        await vscode.workspace.fs.createDirectory(dirUri);
      }

      await vscode.workspace.fs.writeFile(uri, Buffer.from(cleanContent, 'utf8'));
      return { output: `File written: ${filePath}`, status: 'success' };
    } catch (error: any) {
      return { output: `Failed to write file: ${error.message}`, status: 'error' };
    }
  }

  private _runCommand(command: string): Promise<IToolResult> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const log = LogService.instance();

    log.logCommand(command);

    return new Promise(resolve => {
      exec(
        command,
        {
          cwd: workspaceRoot || undefined,
          timeout: ToolHandler.COMMAND_TIMEOUT,
          maxBuffer: 1024 * 1024, // 1MB
        },
        (error, stdout, stderr) => {
          const parts: string[] = [];
          if (stdout.trim()) {
            parts.push(stdout.trim());
            log.logOutput(stdout.trim());
          }
          if (stderr.trim()) {
            parts.push(`stderr: ${stderr.trim()}`);
            log.logOutput('ERROR: ' + stderr.trim());
          }
          const output = parts.join('\n') || '(no output)';

          if (error) {
            log.logOutput(`Exit code: ${error.code ?? 1}`);
            resolve({
              output: `${output}\nExit code: ${error.code ?? 1}`,
              status: 'error',
            });
          } else {
            resolve({ output, status: 'success' });
          }
        }
      );
    });
  }

  private _resolveFilePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    return path.join(workspaceRoot, filePath);
  }
}
