import * as vscode from 'vscode';
import { SidebarProvider } from './providers/SidebarProvider';
import { InlineEditController } from './services/InlineEditController';
import { GhostTextProvider } from './providers/GhostTextProvider';
import { TerminalLinkProvider } from './providers/TerminalLinkProvider';

/**
 * Extension activation entry point
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Zero-G extension is now active!');

  const provider = new SidebarProvider(context.extensionUri);
  const inlineEditController = new InlineEditController();
  const ghostTextProvider = new GhostTextProvider();
  const terminalLinkProvider = new TerminalLinkProvider();

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

  // Register controllers for disposal
  context.subscriptions.push(inlineEditController);
  context.subscriptions.push(terminalLinkProvider);
}

/**
 * Extension deactivation
 */
export function deactivate() {}
