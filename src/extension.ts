import * as vscode from 'vscode';
import { SidebarProvider } from './chat/SidebarProvider';
import { InlineEditController } from './editor/InlineEditController';
import { GhostTextProvider } from './autocomplete/GhostTextProvider';
import { TerminalLinkProvider } from './terminal/TerminalLinkProvider';
import { SessionService } from './core/SessionService';
import { HistoryTreeProvider } from './chat/HistoryTreeProvider';

let sessionService: SessionService;

/**
 * Extension activation entry point
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Zero-G extension is now active!');

  // Initialize session service
  sessionService = new SessionService(context.globalStorageUri);
  sessionService.initialize().catch(err => {
    console.error('[Extension] Failed to initialize session service:', err);
  });

  const provider = new SidebarProvider(context.extensionUri, context, sessionService);
  const inlineEditController = new InlineEditController();
  const ghostTextProvider = new GhostTextProvider();
  const terminalLinkProvider = new TerminalLinkProvider();
  const historyTreeProvider = new HistoryTreeProvider(sessionService);

  // Register webview provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('zerog.chatView', provider)
  );

  // Register history tree view
  const historyView = vscode.window.createTreeView('zerog.historyView', {
    treeDataProvider: historyTreeProvider,
    showCollapseAll: false
  });
  context.subscriptions.push(historyView);

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

  // Session management commands
  context.subscriptions.push(
    vscode.commands.registerCommand('zerog.newChat', () => {
      provider.startNewSession();
      historyTreeProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('zerog.openSession', async (sessionId: string) => {
      await provider.switchToSession(sessionId);
      vscode.commands.executeCommand('zerog.chatView.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('zerog.deleteSession', async (item: any) => {
      const sessionId = item?.sessionMeta?.id;
      if (!sessionId) { return; }
      const confirm = await vscode.window.showWarningMessage(
        `Delete session "${item.sessionMeta.name}"?`,
        { modal: true },
        'Delete'
      );
      if (confirm === 'Delete') {
        await sessionService.deleteSession(sessionId);
        provider.onSessionDeleted(sessionId);
        historyTreeProvider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('zerog.renameSession', async (item: any) => {
      const sessionId = item?.sessionMeta?.id;
      if (!sessionId) { return; }
      const newName = await vscode.window.showInputBox({
        prompt: 'Enter new session name',
        value: item.sessionMeta.name
      });
      if (newName) {
        await sessionService.renameSession(sessionId, newName);
        historyTreeProvider.refresh();
      }
    })
  );

  // Expose history refresh for SidebarProvider
  provider.onSessionChanged = () => historyTreeProvider.refresh();

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
