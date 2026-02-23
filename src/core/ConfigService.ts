import * as vscode from 'vscode';
import { IConnectionConfig, IAgentConfig, IAdvancedConfig } from '../types';

const SECTION = 'zerog';

/**
 * Centralised, singleton configuration service for Zero-G.
 * Reads from `zerog.*` VS Code settings and exposes typed accessors.
 */
export class ConfigService implements vscode.Disposable {
  private static _instance: ConfigService | undefined;
  private _disposables: vscode.Disposable[] = [];

  private constructor() {}

  /** Lazy singleton accessor. */
  static instance(): ConfigService {
    if (!ConfigService._instance) {
      ConfigService._instance = new ConfigService();
    }
    return ConfigService._instance;
  }

  /** Read any `zerog.<key>` with a typed fallback. */
  get<T>(key: string, fallback: T): T {
    return vscode.workspace.getConfiguration(SECTION).get<T>(key, fallback);
  }

  getConnectionConfig(): IConnectionConfig {
    const cfg = vscode.workspace.getConfiguration(SECTION);
    return {
      provider: cfg.get<string>('connection.provider', 'antigravity'),
      baseUrl: cfg.get<string>('connection.baseUrl', 'http://localhost:8080'),
      apiKey: cfg.get<string>('connection.apiKey', 'test'),
      model: cfg.get<string>('connection.model', 'claude-opus-4-6-thinking'),
    };
  }

  getAgentConfig(): IAgentConfig {
    const cfg = vscode.workspace.getConfiguration(SECTION);
    return {
      allowTerminal: cfg.get<boolean>('agent.allowTerminal', false),
      autoApplyDiff: cfg.get<boolean>('agent.autoApplyDiff', false),
      maxIterations: cfg.get<number>('agent.maxIterations', 5),
    };
  }

  getAdvancedConfig(): IAdvancedConfig {
    const cfg = vscode.workspace.getConfiguration(SECTION);
    return {
      temperature: cfg.get<number>('advanced.temperature', 0.7),
      systemPrompt: cfg.get<string>('advanced.systemPrompt', ''),
      contextLimit: cfg.get<number>('advanced.contextLimit', 4096),
      debugMode: cfg.get<boolean>('advanced.debugMode', false),
    };
  }

  /** Subscribe to changes scoped to `zerog.*`. */
  onDidChange(callback: () => void): vscode.Disposable {
    const d = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(SECTION)) {
        callback();
      }
    });
    this._disposables.push(d);
    return d;
  }

  dispose(): void {
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables = [];
    ConfigService._instance = undefined;
  }
}
