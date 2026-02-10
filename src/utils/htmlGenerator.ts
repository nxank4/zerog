import * as vscode from 'vscode';

/**
 * Generate the complete HTML content for the webview
 */
export function getWebviewContent(webview: vscode.Webview): string {
  return '<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'  <meta charset="UTF-8">\n' +
'  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'  <meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\' https://cdnjs.cloudflare.com; script-src \'unsafe-inline\';">\n' +
'  <title>Zero-G AI Chat</title>\n' +
'  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">\n' +
'  <style>\n' +
getStyles() +
'  </style>\n' +
'</head>\n' +
'<body>\n' +
getBodyContent() +
'  <script>\n' +
getScript() +
'  </script>\n' +
'</body>\n' +
'</html>';
}

/**
 * Get CSS styles for the webview
 */
function getStyles(): string {
  return '    * {\n' +
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
'    .code-action-btn-run {\n' +
'      background-color: var(--vscode-testing-runAction);\n' +
'      color: var(--vscode-button-foreground);\n' +
'    }\n' +
'    .code-action-btn-run:hover {\n' +
'      background-color: var(--vscode-button-hoverBackground);\n' +
'    }\n' +
'    #input-container {\n' +
'      display: flex;\n' +
'      gap: 8px;\n' +
'      padding: 12px;\n' +
'      background-color: var(--vscode-sideBar-background);\n' +
'      border-top: 1px solid var(--vscode-widget-border);\n' +
'      position: relative;\n' +
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
'    #attach-button {\n' +
'      padding: 10px 12px;\n' +
'      background-color: var(--vscode-input-background);\n' +
'      color: var(--vscode-input-foreground);\n' +
'      border: 1px solid var(--vscode-input-border);\n' +
'      border-radius: 6px;\n' +
'      cursor: pointer;\n' +
'      font-size: 16px;\n' +
'      display: flex;\n' +
'      align-items: center;\n' +
'      justify-content: center;\n' +
'    }\n' +
'    #attach-button:hover {\n' +
'      background-color: var(--vscode-list-hoverBackground);\n' +
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
'    .drop-zone-overlay {\n' +
'      position: fixed;\n' +
'      top: 0;\n' +
'      left: 0;\n' +
'      right: 0;\n' +
'      bottom: 0;\n' +
'      background-color: rgba(0, 122, 204, 0.1);\n' +
'      border: 3px dashed var(--vscode-focusBorder);\n' +
'      display: none;\n' +
'      align-items: center;\n' +
'      justify-content: center;\n' +
'      z-index: 1000;\n' +
'      pointer-events: none;\n' +
'    }\n' +
'    .drop-zone-overlay.active {\n' +
'      display: flex;\n' +
'    }\n' +
'    .drop-zone-text {\n' +
'      font-size: 24px;\n' +
'      font-weight: 600;\n' +
'      color: var(--vscode-focusBorder);\n' +
'    }\n' +
'    .dropped-files-container {\n' +
'      padding: 8px 12px;\n' +
'      display: flex;\n' +
'      flex-wrap: wrap;\n' +
'      gap: 6px;\n' +
'      background-color: var(--vscode-editor-background);\n' +
'      border-bottom: 1px solid var(--vscode-widget-border);\n' +
'      min-height: 0;\n' +
'      max-height: 100px;\n' +
'      overflow-y: auto;\n' +
'    }\n' +
'    .dropped-files-container:empty {\n' +
'      display: none;\n' +
'    }\n' +
'    .file-chip {\n' +
'      display: inline-flex;\n' +
'      align-items: center;\n' +
'      gap: 6px;\n' +
'      background-color: var(--vscode-badge-background);\n' +
'      color: var(--vscode-badge-foreground);\n' +
'      padding: 4px 8px;\n' +
'      border-radius: 12px;\n' +
'      font-size: 12px;\n' +
'      font-weight: 500;\n' +
'    }\n' +
'    .file-chip-remove {\n' +
'      cursor: pointer;\n' +
'      font-weight: bold;\n' +
'      opacity: 0.7;\n' +
'    }\n' +
'    .file-chip-remove:hover {\n' +
'      opacity: 1;\n' +
'    }\n';
}

/**
 * Get HTML body content
 */
function getBodyContent(): string {
  return '  <div class="drop-zone-overlay" id="drop-zone-overlay">\n' +
'    <div class="drop-zone-text">📁 Drop files here</div>\n' +
'  </div>\n' +
'  <div id="chat-container"></div>\n' +
'  <div class="loading" id="loading">AI is thinking</div>\n' +
'  <div class="context-bar">\n' +
'    <div class="context-info">\n' +
'      <span id="context-text">No active file</span>\n' +
'    </div>\n' +
'    <button class="clear-context-btn" id="clear-context-btn">Clear Context</button>\n' +
'  </div>\n' +
'  <div class="dropped-files-container" id="dropped-files-container"></div>\n' +
'  <div id="input-container">\n' +
'    <div class="command-hints" id="command-hints"></div>\n' +
'    <button id="attach-button" title="Attach files">📎</button>\n' +
'    <input type="text" id="message-input" placeholder="Ask me anything or type / for commands..." />\n' +
'    <button id="send-button">Send</button>\n' +
'  </div>\n';
}

/**
 * Get JavaScript for webview interactivity
 */
function getScript(): string {
  return '    const vscode = acquireVsCodeApi();\n' +
'    const chatContainer = document.getElementById(\'chat-container\');\n' +
'    const messageInput = document.getElementById(\'message-input\');\n' +
'    const sendButton = document.getElementById(\'send-button\');\n' +
'    const attachButton = document.getElementById(\'attach-button\');\n' +
'    const loading = document.getElementById(\'loading\');\n' +
'    const contextText = document.getElementById(\'context-text\');\n' +
'    const clearContextBtn = document.getElementById(\'clear-context-btn\');\n' +
'    const commandHints = document.getElementById(\'command-hints\');\n' +
'    const dropZoneOverlay = document.getElementById(\'drop-zone-overlay\');\n' +
'    const droppedFilesContainer = document.getElementById(\'dropped-files-container\');\n' +
'    const droppedFiles = new Map();\n' +
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
'    attachButton.addEventListener(\'click\', () => {\n' +
'      vscode.postMessage({ type: \'selectFile\' });\n' +
'    });\n' +
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
'    document.body.addEventListener(\'dragover\', (e) => {\n' +
'      e.preventDefault();\n' +
'      dropZoneOverlay.classList.add(\'active\');\n' +
'    });\n' +
'    document.body.addEventListener(\'dragleave\', (e) => {\n' +
'      if (e.target === document.body) {\n' +
'        dropZoneOverlay.classList.remove(\'active\');\n' +
'      }\n' +
'    });\n' +
'    document.body.addEventListener(\'drop\', async (e) => {\n' +
'      e.preventDefault();\n' +
'      e.stopPropagation();\n' +
'      dropZoneOverlay.classList.remove(\'active\');\n' +
'      const items = e.dataTransfer.items;\n' +
'      if (items) {\n' +
'        for (let i = 0; i < items.length; i++) {\n' +
'          if (items[i].kind === \'file\') {\n' +
'            const file = items[i].getAsFile();\n' +
'            if (file) {\n' +
'              vscode.postMessage({ type: \'fileDropped\', filePath: file.path || file.name, fileName: file.name });\n' +
'            }\n' +
'          } else if (items[i].kind === \'string\' && items[i].type === \'text/uri-list\') {\n' +
'            items[i].getAsString((uri) => {\n' +
'              vscode.postMessage({ type: \'fileDropped\', filePath: uri, fileName: uri.split(\'/\').pop() });\n' +
'            });\n' +
'          }\n' +
'        }\n' +
'      }\n' +
'    });\n' +
'    function addFileChip(filePath, fileName) {\n' +
'      if (droppedFiles.has(filePath)) return;\n' +
'      droppedFiles.set(filePath, fileName);\n' +
'      const chip = document.createElement(\'div\');\n' +
'      chip.className = \'file-chip\';\n' +
'      chip.dataset.filepath = filePath;\n' +
'      chip.innerHTML = \'📄 \' + fileName + \' <span class="file-chip-remove">✕</span>\';\n' +
'      chip.querySelector(\'.file-chip-remove\').addEventListener(\'click\', () => {\n' +
'        removeFileChip(filePath);\n' +
'      });\n' +
'      droppedFilesContainer.appendChild(chip);\n' +
'    }\n' +
'    function removeFileChip(filePath) {\n' +
'      droppedFiles.delete(filePath);\n' +
'      const chip = droppedFilesContainer.querySelector(\'[data-filepath="\' + filePath + \'"]\');\n' +
'      if (chip) chip.remove();\n' +
'      vscode.postMessage({ type: \'removeFile\', filePath: filePath });\n' +
'    }\n' +
'    function clearAllFileChips() {\n' +
'      droppedFiles.clear();\n' +
'      droppedFilesContainer.innerHTML = \'\';\n' +
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
'          clearAllFileChips();\n' +
'          break;\n' +
'        case \'fileAdded\':\n' +
'          addFileChip(message.filePath, message.fileName);\n' +
'          break;\n' +
'        case \'fileRemoved\':\n' +
'          const chipToRemove = droppedFilesContainer.querySelector(\'[data-filepath="\' + message.filePath + \'"]\');\n' +
'          if (chipToRemove) chipToRemove.remove();\n' +
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
'        const codeLanguage = code.className.match(/language-(\\w+)/)?.[1] || \'\';\n' +
'        const isShellCommand = [\'bash\', \'sh\', \'shell\', \'zsh\', \'fish\', \'powershell\', \'cmd\'].includes(codeLanguage.toLowerCase());\n' +
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
'        if (isShellCommand) {\n' +
'          const runBtn = document.createElement(\'button\');\n' +
'          runBtn.className = \'code-action-btn code-action-btn-run\';\n' +
'          runBtn.textContent = \'▶ Run\';\n' +
'          runBtn.addEventListener(\'click\', () => {\n' +
'            vscode.postMessage({ type: \'runTerminalCommand\', value: codeText });\n' +
'          });\n' +
'          actionsDiv.appendChild(copyBtn);\n' +
'          actionsDiv.appendChild(runBtn);\n' +
'        } else {\n' +
'          const applyBtn = document.createElement(\'button\');\n' +
'          applyBtn.className = \'code-action-btn\';\n' +
'          applyBtn.textContent = \'Apply\';\n' +
'          applyBtn.addEventListener(\'mouseenter\', () => {\n' +
'            vscode.postMessage({ type: \'previewCode\', code: codeText });\n' +
'          });\n' +
'          applyBtn.addEventListener(\'mouseleave\', () => {\n' +
'            vscode.postMessage({ type: \'clearPreview\' });\n' +
'          });\n' +
'          applyBtn.addEventListener(\'click\', () => {\n' +
'            vscode.postMessage({ type: \'applyCode\', value: codeText });\n' +
'          });\n' +
'          actionsDiv.appendChild(copyBtn);\n' +
'          actionsDiv.appendChild(applyBtn);\n' +
'        }\n' +
'        pre.insertBefore(actionsDiv, pre.firstChild);\n' +
'      });\n' +
'    }\n';
}
