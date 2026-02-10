import * as vscode from 'vscode';
import { SidebarProvider } from './providers/SidebarProvider';

/**
 * Extension activation entry point
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Zero-G extension is now active!');

  const provider = new SidebarProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('zerog.chatView', provider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('zerog.openChat', () => {
      vscode.commands.executeCommand('zerog.chatView.focus');
    })
  );
}

/**
 * Extension deactivation
 */
export function deactivate() {}
