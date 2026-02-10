import * as vscode from 'vscode';
import axios from 'axios';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

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

export function deactivate() {}

class SidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _messages: Message[] = [];
  private _md: MarkdownIt;

  constructor(private readonly _extensionUri: vscode.Uri) {
    // Initialize markdown-it with syntax highlighting
    this._md = new MarkdownIt({
      html: true,
      linkify: true,
      typographer: true,
      highlight: (str: string, lang: string) => {
        if (lang && hljs.getLanguage(lang)) {
          try {
            return '<pre class="hljs"><code>' +
                   hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
                   '</code></pre>';
          } catch (err) {
            console.error('Highlight error:', err);
          }
        }
        return '<pre class="hljs"><code>' + this._md.utils.escapeHtml(str) + '</code></pre>';
      }
    });
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

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
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
      }
    });

    // Send initial context
    this._sendContextInfo();
  }

  private _sendContextInfo() {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const fileName = editor.document.fileName.split('/').pop() || 'Unknown';
      const languageId = editor.document.languageId;
      this._view?.webview.postMessage({
        type: 'updateContext',
        fileName: fileName,
        languageId: languageId
      });
    } else {
      this._view?.webview.postMessage({
        type: 'updateContext',
        fileName: null,
        languageId: null
      });
    }
  }

  private _handleClearContext() {
    this._messages = [];
    this._view?.webview.postMessage({
      type: 'contextCleared'
    });
    vscode.window.showInformationMessage('Chat context cleared');
  }

  private _gatherContext(): { contextInfo: string; metadata: any } {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return {
        contextInfo: '',
        metadata: {
          hasContext: false
        }
      };
    }

    const document = editor.document;
    const selection = editor.selection;
    const fileName = document.fileName.split('/').pop() || 'Unknown';
    const languageId = document.languageId;
    const selectedText = document.getText(selection);
    
    let contextInfo = '';
    const metadata: any = {
      hasContext: true,
      fileName: fileName,
      languageId: languageId
    };

    // Add file context
    contextInfo += `[Context File: ${fileName}]\n`;
    contextInfo += `[Language: ${languageId}]\n`;

    // Add selection or full file context
    if (selectedText && !selection.isEmpty) {
      const startLine = selection.start.line + 1;
      const endLine = selection.end.line + 1;
      contextInfo += `[Code Selection: lines ${startLine}-${endLine}]\n\n`;
      contextInfo += '```' + languageId + '\n';
      contextInfo += selectedText + '\n';
      contextInfo += '```\n\n';
      metadata.selectionLines = `${startLine}-${endLine}`;
      metadata.hasSelection = true;
    } else {
      // If no selection, include relevant file content (limited to avoid token overflow)
      const fullText = document.getText();
      const lineCount = document.lineCount;
      
      if (lineCount <= 100) {
        // Include entire file if small
        contextInfo += `[Full File Content: ${lineCount} lines]\n\n`;
        contextInfo += '```' + languageId + '\n';
        contextInfo += fullText + '\n';
        contextInfo += '```\n\n';
        metadata.fullFile = true;
      } else {
        // Include cursor context for large files
        const cursorLine = selection.active.line;
        const startLine = Math.max(0, cursorLine - 25);
        const endLine = Math.min(lineCount - 1, cursorLine + 25);
        const contextText = document.getText(
          new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length)
        );
        
        contextInfo += `[File Context: lines ${startLine + 1}-${endLine + 1} of ${lineCount}]\n\n`;
        contextInfo += '```' + languageId + '\n';
        contextInfo += contextText + '\n';
        contextInfo += '```\n\n';
        metadata.contextLines = `${startLine + 1}-${endLine + 1}`;
        metadata.totalLines = lineCount;
      }
    }

    return { contextInfo, metadata };
  }

  private async _handleSendMessage(userMessage: string) {
    if (!userMessage.trim()) {
      return;
    }

    const config = vscode.workspace.getConfiguration('zerog');
    const baseUrl = config.get<string>('baseUrl', 'http://localhost:8080');
    const authToken = config.get<string>('authToken', 'test');
    const model = config.get<string>('model', 'claude-opus-4-6-thinking');
    const systemPrompt = config.get<string>('systemPrompt', 'You are a helpful coding assistant.');

    // Handle slash commands
    let processedMessage = userMessage;
    let displayMessage = userMessage;
    
    if (userMessage.startsWith('/')) {
      const command = userMessage.split(' ')[0].toLowerCase();
      const args = userMessage.slice(command.length).trim();
      
      switch (command) {
        case '/fix':
          processedMessage = 'Fix the bugs in this code and explain what was wrong and how you fixed it.';
          displayMessage = '🔧 /fix';
          break;
        case '/explain':
          processedMessage = 'Explain what this code does in simple terms. Break down the logic step by step.';
          displayMessage = '📖 /explain';
          break;
        case '/refactor':
          processedMessage = 'Refactor this code for better readability, performance, and maintainability. Explain the improvements you made.';
          displayMessage = '⚡ /refactor';
          break;
        case '/optimize':
          processedMessage = 'Optimize this code for better performance. Identify bottlenecks and suggest improvements.';
          displayMessage = '🚀 /optimize';
          break;
        case '/document':
          processedMessage = 'Add comprehensive documentation to this code including docstrings, comments, and usage examples.';
          displayMessage = '📝 /document';
          break;
        case '/test':
          processedMessage = 'Generate unit tests for this code. Include edge cases and error handling.';
          displayMessage = '🧪 /test';
          break;
        default:
          // Unknown command, use as is
          processedMessage = userMessage;
          displayMessage = userMessage;
      }
      
      // Append any additional args if provided
      if (args) {
        processedMessage += ' ' + args;
      }
    }

    // Gather structured context
    const { contextInfo, metadata } = this._gatherContext();

    // Construct enhanced user message with structured context
    let fullMessage = '';
    if (metadata.hasContext) {
      fullMessage = contextInfo + 'User Query: ' + processedMessage;
    } else {
      fullMessage = processedMessage;
    }

    // Add user message to history
    this._messages.push({ role: 'user', content: fullMessage });

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

    let assistantMessage = '';

    try {
      const response = await axios.post(
        baseUrl + '/v1/messages',
        {
          model: model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: this._messages,
          stream: true
        },
        {
          headers: {
            'x-api-key': authToken,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          responseType: 'stream'
        }
      );

      // Handle streaming response
      response.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
          // Skip empty lines and comments
          if (!line.trim() || line.startsWith(':')) {
            continue;
          }

          // Parse SSE format: "data: {...}"
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            
            // Handle stream end
            if (data === '[DONE]') {
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              
              // Handle Anthropic format
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                const textChunk = parsed.delta.text;
                assistantMessage += textChunk;
                
                // Send partial update to webview
                this._view?.webview.postMessage({
                  type: 'streamChunk',
                  content: textChunk
                });
              }
              // Handle standard format with delta
              else if (parsed.delta?.content) {
                const textChunk = parsed.delta.content;
                assistantMessage += textChunk;
                
                this._view?.webview.postMessage({
                  type: 'streamChunk',
                  content: textChunk
                });
              }
              // Handle message_delta format
              else if (parsed.type === 'message_delta' && parsed.delta?.content) {
                const textChunk = parsed.delta.content;
                assistantMessage += textChunk;
                
                this._view?.webview.postMessage({
                  type: 'streamChunk',
                  content: textChunk
                });
              }
              // Handle simple text chunks
              else if (parsed.text) {
                const textChunk = parsed.text;
                assistantMessage += textChunk;
                
                this._view?.webview.postMessage({
                  type: 'streamChunk',
                  content: textChunk
                });
              }
            } catch (parseError) {
              console.error('Error parsing SSE data:', parseError);
            }
          }
        }
      });

      // Wait for stream to complete
      await new Promise<void>((resolve, reject) => {
        response.data.on('end', () => resolve());
        response.data.on('error', (err: Error) => reject(err));
      });

      // Add assistant message to history
      this._messages.push({ role: 'assistant', content: assistantMessage });

      // Render markdown and finalize
      const renderedHtml = this._md.render(assistantMessage);
      
      this._view?.webview.postMessage({
        type: 'streamDone',
        content: renderedHtml
      });

    } catch (error: any) {
      let errorMessage = 'Failed to get response from AI';
      
      if (error.response) {
        errorMessage = 'Error ' + error.response.status + ': ' + (error.response.data?.error?.message || error.response.statusText);
      } else if (error.request) {
        errorMessage = 'Cannot connect to AI proxy at ' + baseUrl + '. Please check your settings.';
      } else {
        errorMessage = error.message;
      }

      this._view?.webview.postMessage({
        type: 'streamError',
        content: '❌ **Error:** ' + errorMessage
      });

      vscode.window.showErrorMessage('Zero-G: ' + errorMessage);
    }
  }

  private async _handleApplyCode(code: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor to insert code');
      return;
    }

    await editor.edit((editBuilder) => {
      editBuilder.insert(editor.selection.active, code);
    });

    vscode.window.showInformationMessage('Code applied successfully!');
  }

  private async _handleCopyCode(code: string) {
    await vscode.env.clipboard.writeText(code);
    vscode.window.showInformationMessage('Code copied to clipboard!');
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    return '<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'  <meta charset="UTF-8">\n' +
'  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'  <meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\' https://cdnjs.cloudflare.com; script-src \'unsafe-inline\';">\n' +
'  <title>Zero-G AI Chat</title>\n' +
'  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">\n' +
'  <style>\n' +
'    * {\n' +
'      box-sizing: border-box;\n' +
'      margin: 0;\n' +
'      padding: 0;\n' +
'    }\n' +
'    body {\n' +
'      font-family: var(--vscode-font-family);\n' +
'      font-size: var(--vscode-font-size);\n' +
'      color: var(--vscode-foreground);\n' +
'      background-color: var(--vscode-editor-background);\n' +
'      padding: 10px;\n' +
'      height: 100vh;\n' +
'      display: flex;\n' +
'      flex-direction: column;\n' +
'    }\n' +
'    #chat-container {\n' +
'      flex: 1;\n' +
'      overflow-y: auto;\n' +
'      margin-bottom: 10px;\n' +
'      padding: 10px;\n' +
'      background-color: var(--vscode-editor-background);\n' +
'    }\n' +
'    .message {\n' +
'      margin-bottom: 15px;\n' +
'      display: flex;\n' +
'      align-items: flex-start;\n' +
'    }\n' +
'    .message.user {\n' +
'      justify-content: flex-end;\n' +
'    }\n' +
'    .message.assistant {\n' +
'      justify-content: flex-start;\n' +
'    }\n' +
'    .message-bubble {\n' +
'      max-width: 85%;\n' +
'      padding: 12px 16px;\n' +
'      border-radius: 12px;\n' +
'      line-height: 1.5;\n' +
'      word-wrap: break-word;\n' +
'    }\n' +
'    .message.user .message-bubble {\n' +
'      background-color: var(--vscode-button-background);\n' +
'      color: var(--vscode-button-foreground);\n' +
'      border-bottom-right-radius: 4px;\n' +
'    }\n' +
'    .message.assistant .message-bubble {\n' +
'      background-color: var(--vscode-input-background);\n' +
'      color: var(--vscode-foreground);\n' +
'      border-bottom-left-radius: 4px;\n' +
'      border-left: 3px solid var(--vscode-focusBorder);\n' +
'    }\n' +
'    .message-header {\n' +
'      font-size: 11px;\n' +
'      font-weight: bold;\n' +
'      margin-bottom: 6px;\n' +
'      opacity: 0.8;\n' +
'    }\n' +
'    .message-content {\n' +
'      word-wrap: break-word;\n' +
'    }\n' +
'    .message-content p {\n' +
'      margin: 8px 0;\n' +
'    }\n' +
'    .message-content p:first-child {\n' +
'      margin-top: 0;\n' +
'    }\n' +
'    .message-content p:last-child {\n' +
'      margin-bottom: 0;\n' +
'    }\n' +
'    .message-content ul, .message-content ol {\n' +
'      margin: 8px 0;\n' +
'      padding-left: 24px;\n' +
'    }\n' +
'    .message-content li {\n' +
'      margin: 4px 0;\n' +
'    }\n' +
'    .message-content pre {\n' +
'      position: relative;\n' +
'      margin: 12px 0;\n' +
'      border-radius: 6px;\n' +
'      overflow: hidden;\n' +
'    }\n' +
'    .message-content pre.hljs {\n' +
'      padding: 32px 12px 12px 12px;\n' +
'      background-color: var(--vscode-textCodeBlock-background);\n' +
'      border: 1px solid var(--vscode-widget-border);\n' +
'      overflow-x: auto;\n' +
'    }\n' +
'    .message-content code:not(.hljs) {\n' +
'      background-color: var(--vscode-textCodeBlock-background);\n' +
'      padding: 2px 6px;\n' +
'      border-radius: 3px;\n' +
'      font-family: var(--vscode-editor-font-family);\n' +
'      font-size: 0.9em;\n' +
'    }\n' +
'    .code-actions {\n' +
'      position: absolute;\n' +
'      top: 4px;\n' +
'      right: 4px;\n' +
'      display: flex;\n' +
'      gap: 4px;\n' +
'      opacity: 0;\n' +
'      transition: opacity 0.2s;\n' +
'    }\n' +
'    .message-content pre:hover .code-actions {\n' +
'      opacity: 1;\n' +
'    }\n' +
'    .code-action-btn {\n' +
'      background-color: var(--vscode-button-background);\n' +
'      color: var(--vscode-button-foreground);\n' +
'      border: none;\n' +
'      padding: 4px 8px;\n' +
'      border-radius: 3px;\n' +
'      cursor: pointer;\n' +
'      font-size: 11px;\n' +
'      font-weight: 600;\n' +
'    }\n' +
'    .code-action-btn:hover {\n' +
'      background-color: var(--vscode-button-hoverBackground);\n' +
'    }\n' +
'    .code-action-btn:active {\n' +
'      opacity: 0.8;\n' +
'    }\n' +
'    #input-container {\n' +
'      display: flex;\n' +
'      gap: 8px;\n' +
'      padding: 12px;\n' +
'      background-color: var(--vscode-sideBar-background);\n' +
'      border-top: 1px solid var(--vscode-widget-border);\n' +
'    }\n' +
'    #message-input {\n' +
'      flex: 1;\n' +
'      padding: 10px 12px;\n' +
'      background-color: var(--vscode-input-background);\n' +
'      color: var(--vscode-input-foreground);\n' +
'      border: 1px solid var(--vscode-input-border);\n' +
'      border-radius: 6px;\n' +
'      outline: none;\n' +
'      font-family: var(--vscode-font-family);\n' +
'      font-size: var(--vscode-font-size);\n' +
'    }\n' +
'    #message-input:focus {\n' +
'      border-color: var(--vscode-focusBorder);\n' +
'    }\n' +
'    #send-button {\n' +
'      padding: 10px 20px;\n' +
'      background-color: var(--vscode-button-background);\n' +
'      color: var(--vscode-button-foreground);\n' +
'      border: none;\n' +
'      border-radius: 6px;\n' +
'      cursor: pointer;\n' +
'      font-weight: 600;\n' +
'    }\n' +
'    #send-button:hover {\n' +
'      background-color: var(--vscode-button-hoverBackground);\n' +
'    }\n' +
'    #send-button:disabled {\n' +
'      opacity: 0.5;\n' +
'      cursor: not-allowed;\n' +
'    }\n' +
'    .loading {\n' +
'      display: none;\n' +
'      padding: 12px;\n' +
'      text-align: center;\n' +
'      color: var(--vscode-descriptionForeground);\n' +
'      font-style: italic;\n' +
'    }\n' +
'    .loading.active {\n' +
'      display: block;\n' +
'    }\n' +
'    .loading::after {\n' +
'      content: \'\';\n' +
'      animation: dots 1.5s steps(4, end) infinite;\n' +
'    }\n' +
'    @keyframes dots {\n' +
'      0%, 20% { content: \'.\'; }\n' +
'      40% { content: \'..\'; }\n' +
'      60%, 100% { content: \'...\'; }\n' +
'    }\n' +
'    .context-bar {\n' +
'      padding: 8px 12px;\n' +
'      background-color: var(--vscode-editorWidget-background);\n' +
'      border-top: 1px solid var(--vscode-widget-border);\n' +
'      display: flex;\n' +
'      justify-content: space-between;\n' +
'      align-items: center;\n' +
'      font-size: 11px;\n' +
'    }\n' +
'    .context-info {\n' +
'      display: flex;\n' +
'      align-items: center;\n' +
'      gap: 8px;\n' +
'      color: var(--vscode-descriptionForeground);\n' +
'    }\n' +
'    .context-badge {\n' +
'      background-color: var(--vscode-badge-background);\n' +
'      color: var(--vscode-badge-foreground);\n' +
'      padding: 2px 8px;\n' +
'      border-radius: 10px;\n' +
'      font-weight: 600;\n' +
'    }\n' +
'    .clear-context-btn {\n' +
'      background-color: transparent;\n' +
'      color: var(--vscode-descriptionForeground);\n' +
'      border: 1px solid var(--vscode-widget-border);\n' +
'      padding: 4px 10px;\n' +
'      border-radius: 4px;\n' +
'      cursor: pointer;\n' +
'      font-size: 11px;\n' +
'      font-weight: 600;\n' +
'    }\n' +
'    .clear-context-btn:hover {\n' +
'      background-color: var(--vscode-button-hoverBackground);\n' +
'      color: var(--vscode-button-foreground);\n' +
'    }\n' +
'    .command-hints {\n' +
'      position: absolute;\n' +
'      bottom: 100%;\n' +
'      left: 0;\n' +
'      right: 0;\n' +
'      background-color: var(--vscode-editorWidget-background);\n' +
'      border: 1px solid var(--vscode-widget-border);\n' +
'      border-radius: 4px;\n' +
'      margin-bottom: 4px;\n' +
'      display: none;\n' +
'      max-height: 200px;\n' +
'      overflow-y: auto;\n' +
'    }\n' +
'    .command-hints.active {\n' +
'      display: block;\n' +
'    }\n' +
'    .command-hint-item {\n' +
'      padding: 8px 12px;\n' +
'      cursor: pointer;\n' +
'      border-bottom: 1px solid var(--vscode-widget-border);\n' +
'    }\n' +
'    .command-hint-item:last-child {\n' +
'      border-bottom: none;\n' +
'    }\n' +
'    .command-hint-item:hover {\n' +
'      background-color: var(--vscode-list-hoverBackground);\n' +
'    }\n' +
'    .command-hint-name {\n' +
'      font-weight: 600;\n' +
'      color: var(--vscode-textLink-foreground);\n' +
'      font-size: 13px;\n' +
'    }\n' +
'    .command-hint-desc {\n' +
'      font-size: 11px;\n' +
'      color: var(--vscode-descriptionForeground);\n' +
'      margin-top: 2px;\n' +
'    }\n' +
'    #input-container {\n' +
'      position: relative;\n' +
'    }\n' +
'  </style>\n' +
'</head>\n' +
'<body>\n' +
'  <div id="chat-container"></div>\n' +
'  <div class="loading" id="loading">AI is thinking</div>\n' +
'  <div class="context-bar">\n' +
'    <div class="context-info">\n' +
'      <span id="context-text">No active file</span>\n' +
'    </div>\n' +
'    <button class="clear-context-btn" id="clear-context-btn">Clear Context</button>\n' +
'  </div>\n' +
'  <div id="input-container">\n' +
'    <div class="command-hints" id="command-hints"></div>\n' +
'    <input type="text" id="message-input" placeholder="Ask me anything or type / for commands..." />\n' +
'    <button id="send-button">Send</button>\n' +
'  </div>\n' +
'  <script>\n' +
'    const vscode = acquireVsCodeApi();\n' +
'    const chatContainer = document.getElementById(\'chat-container\');\n' +
'    const messageInput = document.getElementById(\'message-input\');\n' +
'    const sendButton = document.getElementById(\'send-button\');\n' +
'    const loading = document.getElementById(\'loading\');\n' +
'    const contextText = document.getElementById(\'context-text\');\n' +
'    const clearContextBtn = document.getElementById(\'clear-context-btn\');\n' +
'    const commandHints = document.getElementById(\'command-hints\');\n' +
'    const commands = [\n' +
'      { name: \'/fix\', icon: \'🔧\', desc: \'Fix bugs in the selected code\' },\n' +
'      { name: \'/explain\', icon: \'📖\', desc: \'Explain code in simple terms\' },\n' +
'      { name: \'/refactor\', icon: \'⚡\', desc: \'Improve code readability and performance\' },\n' +
'      { name: \'/optimize\', icon: \'🚀\', desc: \'Optimize code for better performance\' },\n' +
'      { name: \'/document\', icon: \'📝\', desc: \'Add documentation and comments\' },\n' +
'      { name: \'/test\', icon: \'🧪\', desc: \'Generate unit tests\' }\n' +
'    ];\n' +
'    function sendMessage() {\n' +
'      const message = messageInput.value.trim();\n' +
'      if (!message) return;\n' +
'      vscode.postMessage({ type: \'sendMessage\', value: message });\n' +
'      messageInput.value = \'\';\n' +
'    }\n' +
'    sendButton.addEventListener(\'click\', sendMessage);\n' +
'    clearContextBtn.addEventListener(\'click\', () => {\n' +
'      vscode.postMessage({ type: \'clearContext\' });\n' +
'    });\n' +
'    messageInput.addEventListener(\'input\', (e) => {\n' +
'      const value = e.target.value;\n' +
'      if (value.startsWith(\'/\') && value.length > 0) {\n' +
'        showCommandHints(value);\n' +
'      } else {\n' +
'        hideCommandHints();\n' +
'      }\n' +
'    });\n' +
'    messageInput.addEventListener(\'keypress\', (e) => {\n' +
'      if (e.key === \'Enter\' && !e.shiftKey) {\n' +
'        e.preventDefault();\n' +
'        hideCommandHints();\n' +
'        sendMessage();\n' +
'      }\n' +
'    });\n' +
'    messageInput.addEventListener(\'blur\', () => {\n' +
'      setTimeout(() => hideCommandHints(), 200);\n' +
'    });\n' +
'    function showCommandHints(input) {\n' +
'      const searchTerm = input.toLowerCase();\n' +
'      const filtered = commands.filter(cmd => cmd.name.startsWith(searchTerm));\n' +
'      if (filtered.length === 0) {\n' +
'        hideCommandHints();\n' +
'        return;\n' +
'      }\n' +
'      commandHints.innerHTML = filtered.map(cmd => \n' +
'        \'<div class="command-hint-item" data-command="\' + cmd.name + \'">\' +\n' +
'          \'<div class="command-hint-name">\' + cmd.icon + \' \' + cmd.name + \'</div>\' +\n' +
'          \'<div class="command-hint-desc">\' + cmd.desc + \'</div>\' +\n' +
'        \'</div>\'\n' +
'      ).join(\'\');\n' +
'      commandHints.querySelectorAll(\'.command-hint-item\').forEach(item => {\n' +
'        item.addEventListener(\'click\', () => {\n' +
'          messageInput.value = item.dataset.command + \' \';\n' +
'          messageInput.focus();\n' +
'          hideCommandHints();\n' +
'        });\n' +
'      });\n' +
'      commandHints.classList.add(\'active\');\n' +
'    }\n' +
'    function hideCommandHints() {\n' +
'      commandHints.classList.remove(\'active\');\n' +
'    }\n' +
'    vscode.postMessage({ type: \'requestContext\' });\n' +
'    let currentStreamingMessage = null;\n' +
'    let currentStreamingContent = null;\n' +
'    window.addEventListener(\'message\', (event) => {\n' +
'      const message = event.data;\n' +
'      switch (message.type) {\n' +
'        case \'addMessage\':\n' +
'          addMessage(message.role, message.content, message.html);\n' +
'          break;\n' +
'        case \'startStream\':\n' +
'          startStreamingMessage(message.role);\n' +
'          sendButton.disabled = true;\n' +
'          break;\n' +
'        case \'streamChunk\':\n' +
'          appendStreamChunk(message.content);\n' +
'          break;\n' +
'        case \'streamDone\':\n' +
'          finalizeStream(message.content);\n' +
'          sendButton.disabled = false;\n' +
'          break;\n' +
'        case \'streamError\':\n' +
'          handleStreamError(message.content);\n' +
'          sendButton.disabled = false;\n' +
'          break;\n' +
'        case \'setLoading\':\n' +
'          if (message.value) {\n' +
'            loading.classList.add(\'active\');\n' +
'            sendButton.disabled = true;\n' +
'          } else {\n' +
'            loading.classList.remove(\'active\');\n' +
'            sendButton.disabled = false;\n' +
'          }\n' +
'          break;\n' +
'        case \'updateContext\':\n' +
'          updateContextDisplay(message.fileName, message.languageId);\n' +
'          break;\n' +
'        case \'contextCleared\':\n' +
'          chatContainer.innerHTML = \'\';\n' +
'          break;\n' +
'      }\n' +
'    });\n' +
'    function updateContextDisplay(fileName, languageId) {\n' +
'      if (fileName && languageId) {\n' +
'        contextText.innerHTML = \'Reading: <span class="context-badge">\' + fileName + \'</span> (\' + languageId + \')\';\n' +
'      } else {\n' +
'        contextText.textContent = \'No active file\';\n' +
'      }\n' +
'    }\n' +
'    function startStreamingMessage(role) {\n' +
'      const messageDiv = document.createElement(\'div\');\n' +
'      messageDiv.className = \'message \' + role;\n' +
'      const bubbleDiv = document.createElement(\'div\');\n' +
'      bubbleDiv.className = \'message-bubble\';\n' +
'      const headerDiv = document.createElement(\'div\');\n' +
'      headerDiv.className = \'message-header\';\n' +
'      headerDiv.textContent = role === \'user\' ? \'You\' : \'Zero-G AI\';\n' +
'      const contentDiv = document.createElement(\'div\');\n' +
'      contentDiv.className = \'message-content\';\n' +
'      contentDiv.textContent = \'\';\n' +
'      bubbleDiv.appendChild(headerDiv);\n' +
'      bubbleDiv.appendChild(contentDiv);\n' +
'      messageDiv.appendChild(bubbleDiv);\n' +
'      chatContainer.appendChild(messageDiv);\n' +
'      currentStreamingMessage = messageDiv;\n' +
'      currentStreamingContent = contentDiv;\n' +
'      chatContainer.scrollTop = chatContainer.scrollHeight;\n' +
'    }\n' +
'    function appendStreamChunk(chunk) {\n' +
'      if (currentStreamingContent) {\n' +
'        currentStreamingContent.textContent += chunk;\n' +
'        chatContainer.scrollTop = chatContainer.scrollHeight;\n' +
'      }\n' +
'    }\n' +
'    function finalizeStream(renderedHtml) {\n' +
'      if (currentStreamingContent) {\n' +
'        currentStreamingContent.innerHTML = renderedHtml;\n' +
'        enhanceCodeBlocks(currentStreamingContent);\n' +
'        currentStreamingMessage = null;\n' +
'        currentStreamingContent = null;\n' +
'        chatContainer.scrollTop = chatContainer.scrollHeight;\n' +
'      }\n' +
'    }\n' +
'    function handleStreamError(errorMessage) {\n' +
'      if (currentStreamingContent) {\n' +
'        currentStreamingContent.textContent = errorMessage;\n' +
'      } else {\n' +
'        addMessage(\'assistant\', errorMessage, false);\n' +
'      }\n' +
'      currentStreamingMessage = null;\n' +
'      currentStreamingContent = null;\n' +
'    }\n' +
'    function addMessage(role, content, isHtml) {\n' +
'      const messageDiv = document.createElement(\'div\');\n' +
'      messageDiv.className = \'message \' + role;\n' +
'      const bubbleDiv = document.createElement(\'div\');\n' +
'      bubbleDiv.className = \'message-bubble\';\n' +
'      const headerDiv = document.createElement(\'div\');\n' +
'      headerDiv.className = \'message-header\';\n' +
'      headerDiv.textContent = role === \'user\' ? \'You\' : \'Zero-G AI\';\n' +
'      const contentDiv = document.createElement(\'div\');\n' +
'      contentDiv.className = \'message-content\';\n' +
'      if (isHtml) {\n' +
'        contentDiv.innerHTML = content;\n' +
'        enhanceCodeBlocks(contentDiv);\n' +
'      } else {\n' +
'        contentDiv.textContent = content;\n' +
'      }\n' +
'      bubbleDiv.appendChild(headerDiv);\n' +
'      bubbleDiv.appendChild(contentDiv);\n' +
'      messageDiv.appendChild(bubbleDiv);\n' +
'      chatContainer.appendChild(messageDiv);\n' +
'      chatContainer.scrollTop = chatContainer.scrollHeight;\n' +
'    }\n' +
'    function enhanceCodeBlocks(container) {\n' +
'      const codeBlocks = container.querySelectorAll(\'pre.hljs\');\n' +
'      codeBlocks.forEach(pre => {\n' +
'        const code = pre.querySelector(\'code\');\n' +
'        if (!code) return;\n' +
'        const codeText = code.textContent;\n' +
'        const actionsDiv = document.createElement(\'div\');\n' +
'        actionsDiv.className = \'code-actions\';\n' +
'        const copyBtn = document.createElement(\'button\');\n' +
'        copyBtn.className = \'code-action-btn\';\n' +
'        copyBtn.textContent = \'Copy\';\n' +
'        copyBtn.addEventListener(\'click\', () => {\n' +
'          vscode.postMessage({ type: \'copyCode\', value: codeText });\n' +
'          copyBtn.textContent = \'Copied!\';\n' +
'          setTimeout(() => { copyBtn.textContent = \'Copy\'; }, 2000);\n' +
'        });\n' +
'        const applyBtn = document.createElement(\'button\');\n' +
'        applyBtn.className = \'code-action-btn\';\n' +
'        applyBtn.textContent = \'Apply\';\n' +
'        applyBtn.addEventListener(\'click\', () => {\n' +
'          vscode.postMessage({ type: \'applyCode\', value: codeText });\n' +
'        });\n' +
'        actionsDiv.appendChild(copyBtn);\n' +
'        actionsDiv.appendChild(applyBtn);\n' +
'        pre.insertBefore(actionsDiv, pre.firstChild);\n' +
'      });\n' +
'    }\n' +
'  </script>\n' +
'</body>\n' +
'</html>';
  }
}
