import * as vscode from 'vscode';
import { AIService } from '../services/AIService';
import { ContextService } from '../services/ContextService';
import { EditorService } from '../services/EditorService';
import { TerminalService } from '../services/TerminalService';
import { getWebviewContent } from '../utils/htmlGenerator';
import { IChatMessage, IContextItem, IWebviewMessage } from '../types';

/**
 * Provider for the Zero-G sidebar webview
 */
export class SidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _messages: IChatMessage[] = [];
  private _droppedFiles: Map<string, string> = new Map(); // filepath -> content
  
  // Services
  private _aiService: AIService;
  private _contextService: ContextService;
  private _editorService: EditorService;
  private _terminalService: TerminalService;

  constructor(private readonly _extensionUri: vscode.Uri) {
    this._aiService = new AIService();
    this._contextService = new ContextService();
    this._editorService = new EditorService();
    this._terminalService = new TerminalService();
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = getWebviewContent(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data: IWebviewMessage) => {
      switch (data.type) {
        case 'sendMessage':
          await this._handleSendMessage(data.value);
          break;
        case 'applyCode':
          await this._handleApplyCode(data.value);
          break;
        case 'copyCode':
          await this._handleCopyCode(data.value);
          break;
        case 'clearContext':
          this._handleClearContext();
          break;
        case 'requestContext':
          this._sendContextInfo();
          break;
        case 'fileDropped':
          await this._handleFileDropped(data.filePath!);
          break;
        case 'removeFile':
          this._handleRemoveFile(data.filePath!);
          break;
        case 'selectFile':
          await this._handleSelectFile();
          break;
        case 'previewCode':
          this._handlePreviewCode(data.code!);
          break;
        case 'clearPreview':
          this._handleClearPreview();
          break;
        case 'runTerminalCommand':
          await this._handleRunTerminalCommand(data.value!);
          break;
      }
    });

    // Send initial context
    this._sendContextInfo();
  }

  /**
   * Send current context information to webview
   */
  private _sendContextInfo() {
    const { contextItem, metadata } = this._contextService.gatherActiveEditorContext();
    
    this._view?.webview.postMessage({
      type: 'updateContext',
      fileName: metadata.fileName,
      languageId: metadata.languageId
    });
  }

  /**
   * Handle clear context command
   */
  private _handleClearContext() {
    this._messages = [];
    this._droppedFiles.clear();
    this._view?.webview.postMessage({ type: 'contextCleared' });
  }

  /**
   * Handle file dropped event
   */
  private async _handleFileDropped(filePath: string) {
    try {
      // Normalize file path to VS Code URI
      let uri: vscode.Uri;
      if (filePath.startsWith('file://')) {
        uri = vscode.Uri.parse(filePath);
      } else if (filePath.startsWith('vscode-resource://')) {
        uri = vscode.Uri.parse(filePath.replace('vscode-resource://', 'file://'));
      } else {
        uri = vscode.Uri.file(filePath);
      }

      const fileData = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(fileData).toString('utf8');
      const normalizedPath = uri.fsPath;
      const fileName = uri.path.split('/').pop() || 'unknown';
      
      this._droppedFiles.set(normalizedPath, content);
      
      this._view?.webview.postMessage({
        type: 'fileAdded',
        filePath: normalizedPath,
        fileName: fileName
      });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to read file: ${error.message}`);
    }
  }

  /**
   * Handle remove file event
   */
  private _handleRemoveFile(filePath: string) {
    this._droppedFiles.delete(filePath);
    this._view?.webview.postMessage({
      type: 'fileRemoved',
      filePath: filePath
    });
  }

  /**
   * Handle select file button click
   */
  private async _handleSelectFile() {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: true,
      openLabel: 'Select Files',
      filters: {
        'All Files': ['*']
      }
    });

    if (uris && uris.length > 0) {
      for (const uri of uris) {
        try {
          const fileData = await vscode.workspace.fs.readFile(uri);
          const content = Buffer.from(fileData).toString('utf8');
          const normalizedPath = uri.fsPath;
          const fileName = uri.path.split('/').pop() || 'unknown';
          
          this._droppedFiles.set(normalizedPath, content);
          
          this._view?.webview.postMessage({
            type: 'fileAdded',
            filePath: normalizedPath,
            fileName: fileName
          });
        } catch (error: any) {
          vscode.window.showErrorMessage(`Failed to read file: ${error.message}`);
        }
      }
    }
  }

  /**
   * Handle send message event
   */
  private async _handleSendMessage(userMessage: string) {
    if (!userMessage.trim()) {
      return;
    }

    // Process slash commands
    const { processedMessage, displayMessage } = this._aiService.processSlashCommand(userMessage);

    // Gather context items
    const contextItems: IContextItem[] = [];
    
    // Add active editor context
    const { contextItem } = this._contextService.gatherActiveEditorContext();
    if (contextItem) {
      contextItems.push(contextItem);
    }

    // Add dropped files context
    if (this._droppedFiles.size > 0) {
      const droppedFilePaths = Array.from(this._droppedFiles.keys());
      const droppedFileItems = await this._contextService.resolveContext(droppedFilePaths);
      contextItems.push(...droppedFileItems);
    }

    // Add user message to history
    this._messages.push({ role: 'user', content: processedMessage });

    // Update UI with user message (show display message for commands)
    this._view?.webview.postMessage({
      type: 'addMessage',
      role: 'user',
      content: displayMessage,
      html: false
    });

    // Initialize streaming message
    this._view?.webview.postMessage({
      type: 'startStream',
      role: 'assistant'
    });

    try {
      // Send message to AI with streaming
      const assistantMessage = await this._aiService.sendMessage(
        this._messages,
        contextItems,
        (chunk: string) => {
          // Send streaming chunks to webview
          this._view?.webview.postMessage({
            type: 'streamChunk',
            content: chunk
          });
        }
      );

      // Add assistant message to history
      this._messages.push({ role: 'assistant', content: assistantMessage });

      // Render markdown and finalize
      const renderedHtml = this._aiService.renderMarkdown(assistantMessage);
      
      this._view?.webview.postMessage({
        type: 'streamDone',
        content: renderedHtml
      });
    } catch (error: any) {
      const errorMessage = `Error: ${error.message}`;
      
      this._view?.webview.postMessage({
        type: 'streamError',
        content: errorMessage
      });

      vscode.window.showErrorMessage(errorMessage);
    }
  }

  /**
   * Handle apply code event
   */
  private async _handleApplyCode(code: string) {
    await this._editorService.insertText(code);
  }

  /**
   * Handle copy code event
   */
  private async _handleCopyCode(code: string) {
    await this._editorService.copyToClipboard(code);
  }

  /**
   * Handle code preview event (on hover over Apply button)
   */
  private _handlePreviewCode(code: string) {
    this._editorService.previewCodeApplication(code);
  }

  /**
   * Handle clear preview event (on mouse leave from Apply button)
   */
  private _handleClearPreview() {
    this._editorService.clearCodePreview();
  }

  /**
   * Handle run terminal command event
   */
  private async _handleRunTerminalCommand(command: string) {
    await this._terminalService.executeCommand(command);
  }
}
