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
      }
    });
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

    // Get selected code from active editor
    const editor = vscode.window.activeTextEditor;
    let selectedCode = '';
    if (editor) {
      const selection = editor.selection;
      selectedCode = editor.document.getText(selection);
    }

    // Construct user message with context
    let fullMessage = userMessage;
    if (selectedCode) {
      fullMessage = userMessage + '\n\nSelected Code Context:\n```\n' + selectedCode + '\n```';
    }

    // Add user message to history
    this._messages.push({ role: 'user', content: fullMessage });

    // Update UI with user message (render as plain text for user messages)
    this._view?.webview.postMessage({
      type: 'addMessage',
      role: 'user',
      content: userMessage,
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
'  </style>\n' +
'</head>\n' +
'<body>\n' +
'  <div id="chat-container"></div>\n' +
'  <div class="loading" id="loading">AI is thinking</div>\n' +
'  <div id="input-container">\n' +
'    <input type="text" id="message-input" placeholder="Ask me anything..." />\n' +
'    <button id="send-button">Send</button>\n' +
'  </div>\n' +
'  <script>\n' +
'    const vscode = acquireVsCodeApi();\n' +
'    const chatContainer = document.getElementById(\'chat-container\');\n' +
'    const messageInput = document.getElementById(\'message-input\');\n' +
'    const sendButton = document.getElementById(\'send-button\');\n' +
'    const loading = document.getElementById(\'loading\');\n' +
'    function sendMessage() {\n' +
'      const message = messageInput.value.trim();\n' +
'      if (!message) return;\n' +
'      vscode.postMessage({ type: \'sendMessage\', value: message });\n' +
'      messageInput.value = \'\';\n' +
'    }\n' +
'    sendButton.addEventListener(\'click\', sendMessage);\n' +
'    messageInput.addEventListener(\'keypress\', (e) => {\n' +
'      if (e.key === \'Enter\' && !e.shiftKey) {\n' +
'        e.preventDefault();\n' +
'        sendMessage();\n' +
'      }\n' +
'    });\n' +
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
'      }\n' +
'    });\n' +
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
