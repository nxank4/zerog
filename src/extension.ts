import * as vscode from 'vscode';
import { SidebarProvider } from './chat/SidebarProvider';
import { InlineEditController } from './editor/InlineEditController';
import { GhostTextProvider } from './autocomplete/GhostTextProvider';
import { TerminalLinkProvider } from './terminal/TerminalLinkProvider';
import { SessionService } from './core/SessionService';
import { ConfigService } from './core/ConfigService';
import { CodebaseIndexer } from './features/search/CodebaseIndexer';
import { LogService } from './core/LogService';
import { ZeroGMode } from './types';

let sessionService: SessionService;

/**
 * Cycle through Zero-G modes (ask -> planner -> agent -> debug -> ask)
 */
async function cycleMode(): Promise<void> {
  const configService = ConfigService.instance();
  const currentMode = configService.get<string>('general.mode', 'ask');
  
  const modes: ZeroGMode[] = ['ask', 'planner', 'agent', 'debug'];
  const currentIndex = modes.indexOf(currentMode as ZeroGMode);
  const nextIndex = (currentIndex + 1) % modes.length;
  const nextMode = modes[nextIndex];
  
  const settingsConfig = vscode.workspace.getConfiguration('zerog');
  await settingsConfig.update('general.mode', nextMode, vscode.ConfigurationTarget.Global);
  
  // Show notification to user
  vscode.window.showInformationMessage(`Zero-G mode changed to: ${nextMode}`);
}

/**
 * Extension activation entry point
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Zero-G extension is now active!');

  // Initialize ConfigService singleton
  const configService = ConfigService.instance();
  context.subscriptions.push(configService);

  // Initialize LogService singleton
  const logService = LogService.instance();
  context.subscriptions.push(logService);

  // Initialize session service
  sessionService = new SessionService(context.globalStorageUri);
  sessionService.initialize().catch(err => {
    console.error('[Extension] Failed to initialize session service:', err);
  });

  const provider = new SidebarProvider(context.extensionUri, context, sessionService);
  const inlineEditController = new InlineEditController();
  const ghostTextProvider = new GhostTextProvider();
  const terminalLinkProvider = new TerminalLinkProvider();

  // Initialize codebase indexer
  const codebaseIndexer = new CodebaseIndexer();
  context.subscriptions.push(codebaseIndexer);
  provider.setCodebaseIndexer(codebaseIndexer);
  codebaseIndexer.buildIndex();

  // Register webview provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('zerog.chatView', provider)
  );

  // Register inline completion provider for all languages
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: '**' }, // All files
      ghostTextProvider
    )
  );

  // Register terminal link provider
  context.subscriptions.push(
    vscode.window.registerTerminalLinkProvider(terminalLinkProvider)
  );

  // Listen for terminal link clicks and open chat with error
  terminalLinkProvider.onDidOpenTerminalLink((event) => {
    provider.sendErrorToChat(event.error);
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('zerog.openChat', () => {
      vscode.commands.executeCommand('zerog.chatView.focus');
    })
  );

  // Register inline edit command (Cmd+K / Ctrl+Alt+K)
  context.subscriptions.push(
    vscode.commands.registerCommand('zerog.inlineEdit', async () => {
      await inlineEditController.triggerInlineEdit();
    })
  );

  // Register diff review commands (Accept / Discard AI suggestion)
  context.subscriptions.push(
    vscode.commands.registerCommand('zerog.acceptDiff', async () => {
      await provider.editorService.acceptDiff();
      // Notify agent loop that review was accepted
      provider.agentLoop.notifyReviewAccepted();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('zerog.discardDiff', async () => {
      await provider.editorService.discardDiff();
    })
  );

  // New chat command
  context.subscriptions.push(
    vscode.commands.registerCommand('zerog.newChat', () => {
      provider.startNewSession();
    })
  );

  // Cycle mode command
  context.subscriptions.push(
    vscode.commands.registerCommand('zerog.cycleMode', async () => {
      await cycleMode();
    })
  );

  // Register controllers for disposal
  context.subscriptions.push(inlineEditController);
  context.subscriptions.push(terminalLinkProvider);
}

/**
 * Extension deactivation
 */
export function deactivate() {
  if (sessionService) {
    sessionService.flush();
  }
}
