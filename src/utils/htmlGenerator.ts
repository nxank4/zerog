import * as vscode from 'vscode';

/**
 * Generate the complete HTML content for the webview
 */
export function getWebviewContent(webview: vscode.Webview): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://cdnjs.cloudflare.com; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; img-src data:;">
  <title>Zero-G AI Chat</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
  <script src="https://cdn.jsdelivr.net/npm/markdown-it@14.1.0/dist/markdown-it.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
  <style>
${getStyles()}
  </style>
</head>
<body>
${getBodyContent()}
  <script>
${getScript()}
  </script>
</body>
</html>`;
}

/**
 * Get CSS styles for the webview
 */
function getStyles(): string {
  return `
    /* ─── Reset & Body ──────────────────────────────────── */
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      margin: 0;
    }

    /* ─── Header ────────────────────────────────────────── */
    #global-controls {
      display: flex;
      align-items: center;
      height: 40px;
      flex-shrink: 0;
      padding: 0 8px;
      background-color: var(--vscode-sideBar-background);
      border-bottom: 1px solid var(--vscode-widget-border);
      gap: 4px;
    }
    .header-left, .header-right {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .header-center {
      flex: 1;
      text-align: center;
      overflow: hidden;
      min-width: 0;
    }
    .header-btn {
      background: transparent;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      padding: 4px 6px;
      border-radius: 4px;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.8;
    }
    .header-btn:hover {
      background-color: var(--vscode-list-hoverBackground);
      opacity: 1;
    }
    #session-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--vscode-foreground);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
      cursor: default;
    }
    #session-title-input {
      font-size: 12px;
      font-weight: 600;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-focusBorder);
      border-radius: 3px;
      padding: 2px 6px;
      text-align: center;
      width: 80%;
      outline: none;
    }

    /* ─── Main Chat Area ────────────────────────────────── */
    #chat-stream {
      flex: 1;
      overflow-y: auto;
      padding: 10px;
      background-color: var(--vscode-editor-background);
    }

    /* ─── Messages ──────────────────────────────────────── */
    .message {
      margin-bottom: 15px;
      display: flex;
      align-items: flex-start;
    }
    .message.user {
      justify-content: flex-end;
    }
    .message.assistant {
      justify-content: flex-start;
    }
    .message-bubble {
      width: 100%;
      padding: 12px 16px;
      border-radius: 8px;
      line-height: 1.5;
      word-wrap: break-word;
      border: 1px solid var(--vscode-widget-border);
    }
    .message.user .message-bubble {
      background-color: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      border-left: 3px solid var(--vscode-button-background);
    }
    .message.assistant .message-bubble {
      background-color: var(--vscode-input-background);
      color: var(--vscode-foreground);
      border-left: 3px solid var(--vscode-focusBorder);
    }
    .message-header {
      font-size: 11px;
      font-weight: bold;
      margin-bottom: 6px;
      opacity: 0.8;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .message.user .message-header {
      color: var(--vscode-button-background);
    }
    .message.assistant .message-header {
      color: var(--vscode-focusBorder);
    }
    .bubble-spinner {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 0;
      color: var(--vscode-descriptionForeground);
      font-family: var(--vscode-editor-font-family), monospace;
      font-size: 13px;
    }
    .bubble-spinner .spinner-char {
      color: var(--vscode-textLink-foreground);
      font-size: 15px;
    }
    .message-content {
      word-wrap: break-word;
    }
    .message-content p {
      margin: 8px 0;
    }
    .message-content p:first-child {
      margin-top: 0;
    }
    .message-content p:last-child {
      margin-bottom: 0;
    }
    .message-content ul, .message-content ol {
      margin: 8px 0;
      padding-left: 24px;
    }
    .message-content li {
      margin: 4px 0;
    }
    .edit-message-btn {
      background: transparent;
      border: none;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
      font-size: 12px;
      padding: 2px 4px;
      opacity: 0;
      transition: opacity 0.2s;
      margin-left: 6px;
    }
    .message.user:hover .edit-message-btn {
      opacity: 1;
    }
    .edit-message-btn:hover {
      color: var(--vscode-foreground);
    }

    /* ─── Code Blocks ───────────────────────────────────── */
    .message-content pre {
      position: relative;
      margin: 12px 0;
      border-radius: 6px;
      overflow: hidden;
    }
    .message-content pre.hljs {
      padding: 32px 12px 12px 12px;
      background-color: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--vscode-widget-border);
      overflow-x: auto;
    }
    .message-content code:not(.hljs) {
      background-color: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
      font-size: 0.9em;
    }
    .code-actions {
      position: absolute;
      top: 4px;
      right: 4px;
      display: flex;
      gap: 4px;
      opacity: 0;
      transition: opacity 0.2s;
    }
    .message-content pre:hover .code-actions {
      opacity: 1;
    }
    .code-action-btn {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 4px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 600;
    }
    .code-action-btn:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
    .code-action-btn:active {
      opacity: 0.8;
    }
    .code-action-btn-run {
      background-color: var(--vscode-testing-runAction);
      color: var(--vscode-button-foreground);
    }
    .code-action-btn-run:hover {
      background-color: var(--vscode-button-hoverBackground);
    }

    /* ─── Loading & Spinner ─────────────────────────────── */
    .loading {
      display: none;
      padding: 10px 14px;
      color: var(--vscode-descriptionForeground);
      font-family: var(--vscode-editor-font-family), monospace;
      font-size: 13px;
      align-items: center;
      gap: 8px;
    }
    .loading.active {
      display: flex;
    }
    .spinner-char {
      display: inline-block;
      width: 1em;
      text-align: center;
      color: var(--vscode-textLink-foreground);
      font-size: 15px;
    }
    .loading-text {
      color: var(--vscode-descriptionForeground);
    }

    /* ─── Plan Container ────────────────────────────────── */
    #plan-container {
      display: none;
      padding: 10px 12px;
      background-color: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-widget-border);
      border-radius: 6px;
      margin-bottom: 10px;
      max-height: 250px;
      overflow-y: auto;
    }
    #plan-container.active {
      display: block;
    }
    .plan-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .plan-title {
      font-weight: 600;
      font-size: 12px;
      color: var(--vscode-foreground);
    }
    .plan-progress {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    .plan-task {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    }
    .plan-task:hover {
      background-color: var(--vscode-list-hoverBackground);
    }
    .plan-task.done {
      opacity: 0.6;
    }
    .plan-task.done .plan-task-text {
      text-decoration: line-through;
    }
    .plan-task.in_progress {
      background-color: var(--vscode-inputValidation-infoBackground);
    }
    .plan-task-checkbox {
      width: 14px;
      height: 14px;
      accent-color: var(--vscode-button-background);
      cursor: pointer;
    }
    .plan-task-id {
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      min-width: 20px;
    }
    .plan-task-text {
      flex: 1;
    }
    .plan-task-status {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 8px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .plan-task-status.pending {
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
    .plan-task-status.in_progress {
      background-color: var(--vscode-inputValidation-warningBackground);
      color: var(--vscode-inputValidation-warningForeground);
    }
    .plan-task-status.done {
      background-color: var(--vscode-testing-iconPassed);
      color: var(--vscode-button-foreground);
    }

    /* ─── Changes Container ─────────────────────────────── */
    #changes-container {
      display: none;
      padding: 10px 12px;
      background-color: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-widget-border);
      border-radius: 6px;
      margin-bottom: 10px;
    }
    #changes-container.active {
      display: block;
    }
    .changes-header {
      font-weight: 600;
      font-size: 12px;
      margin-bottom: 8px;
      color: var(--vscode-foreground);
    }
    .change-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    .change-item:hover {
      background-color: var(--vscode-list-hoverBackground);
    }
    .change-action {
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 6px;
      font-weight: 600;
    }
    .change-action.modified {
      background-color: var(--vscode-inputValidation-warningBackground);
      color: var(--vscode-inputValidation-warningForeground);
    }
    .change-action.created {
      background-color: var(--vscode-testing-iconPassed);
      color: var(--vscode-button-foreground);
    }
    .changes-actions {
      display: flex;
      gap: 6px;
      margin-top: 8px;
    }
    .changes-actions button {
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      font-weight: 600;
    }
    .btn-accept-all {
      background-color: var(--vscode-testing-iconPassed);
      color: var(--vscode-button-foreground);
    }
    .btn-reject {
      background-color: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-inputValidation-errorForeground);
    }
    .btn-apply-selected {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    /* ─── Thinking Accordion ────────────────────────────── */
    .thinking-accordion {
      margin: 8px 0;
      border: 1px solid var(--vscode-widget-border);
      border-radius: 6px;
      overflow: hidden;
    }
    .thinking-toggle {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background-color: var(--vscode-editorWidget-background);
      cursor: pointer;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      font-weight: 600;
      user-select: none;
    }
    .thinking-toggle:hover {
      background-color: var(--vscode-list-hoverBackground);
    }
    .thinking-toggle .arrow {
      transition: transform 0.2s;
      font-size: 10px;
    }
    .thinking-accordion.open .thinking-toggle .arrow {
      transform: rotate(90deg);
    }
    .thinking-body {
      display: none;
      padding: 8px 10px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      white-space: pre-wrap;
      max-height: 200px;
      overflow-y: auto;
      background-color: var(--vscode-editor-background);
    }
    .thinking-accordion.open .thinking-body {
      display: block;
    }

    /* ─── File Change Card ──────────────────────────────── */
    .file-change-card {
      margin: 8px 0;
      border: 1px solid var(--vscode-widget-border);
      border-radius: 6px;
      overflow: hidden;
      background-color: var(--vscode-editorWidget-background);
    }
    .file-change-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background-color: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-widget-border);
    }
    .file-change-name {
      flex: 1;
      font-size: 12px;
      font-weight: 600;
      color: var(--vscode-foreground);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .file-change-badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 6px;
      font-weight: 600;
      text-transform: uppercase;
      background-color: var(--vscode-testing-iconPassed);
      color: var(--vscode-button-foreground);
    }
    .file-change-actions {
      display: flex;
      gap: 6px;
      padding: 6px 12px;
    }
    .file-change-actions button {
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      font-weight: 600;
    }
    .file-change-btn-diff {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .file-change-btn-diff:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
    .file-change-btn-reject {
      background-color: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-inputValidation-errorForeground);
    }
    .file-change-btn-reject:hover {
      opacity: 0.8;
    }

    /* ─── Tool Call Widget ──────────────────────────────── */
    .tool-call-widget {
      margin: 8px 0;
      border: 1px solid var(--vscode-widget-border);
      border-radius: 6px;
      overflow: hidden;
      background-color: var(--vscode-editorWidget-background);
    }
    .tool-call-header {
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      background-color: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-widget-border);
    }
    .tool-call-command {
      padding: 8px 10px;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      color: var(--vscode-foreground);
    }
    .tool-call-actions {
      display: flex;
      gap: 6px;
      padding: 6px 10px;
    }
    .tool-call-btn {
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      font-weight: 600;
    }
    .tool-call-btn-run {
      background-color: var(--vscode-testing-runAction);
      color: var(--vscode-button-foreground);
    }
    .tool-call-btn-copy {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    /* ─── Footer (Input Zone) ───────────────────────────── */
    #input-zone {
      flex-shrink: 0;
      border-top: 1px solid var(--vscode-widget-border);
      padding: 10px;
      background-color: var(--vscode-sideBar-background);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .input-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .input-row-1 {
      min-height: 28px;
    }
    #mode-select {
      background-color: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 4px;
      padding: 3px 8px;
      font-size: 11px;
      font-family: var(--vscode-font-family);
      outline: none;
      cursor: pointer;
      flex-shrink: 0;
    }
    #mode-select:focus {
      border-color: var(--vscode-focusBorder);
    }
    .context-area {
      display: flex;
      align-items: center;
      gap: 6px;
      flex: 1;
      justify-content: flex-end;
      overflow: hidden;
      min-width: 0;
      flex-wrap: wrap;
      max-height: 48px;
    }
    .context-badge {
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 150px;
    }
    .context-badge:empty {
      display: none;
    }
    .context-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      align-items: center;
    }
    .context-chips:empty {
      display: none;
    }
    .input-row-2 {
      position: relative;
    }
    #message-input {
      width: 100%;
      padding: 8px 12px;
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 6px;
      outline: none;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      resize: none;
      min-height: 36px;
      max-height: 150px;
      overflow-y: auto;
      line-height: 1.4;
    }
    #message-input:focus {
      border-color: var(--vscode-focusBorder);
    }
    .input-row-3 {
      justify-content: space-between;
    }
    .input-row-3-right {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .footer-btn {
      padding: 6px 12px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .footer-btn:hover {
      opacity: 0.9;
    }
    #attach-button {
      background-color: transparent;
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-widget-border);
      font-size: 14px;
      padding: 4px 8px;
    }
    #attach-button:hover {
      background-color: var(--vscode-list-hoverBackground);
    }
    #send-button {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    #send-button:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
    #send-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    #stop-button {
      background-color: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-inputValidation-errorForeground);
      display: none;
    }

    /* ─── Command Hints ─────────────────────────────────── */
    .command-hints {
      position: absolute;
      bottom: 100%;
      left: 0;
      right: 0;
      background-color: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-widget-border);
      border-radius: 4px;
      margin-bottom: 4px;
      display: none;
      max-height: 200px;
      overflow-y: auto;
      z-index: 10;
    }
    .command-hints.active {
      display: block;
    }
    .command-hint-item {
      padding: 8px 12px;
      cursor: pointer;
      border-bottom: 1px solid var(--vscode-widget-border);
    }
    .command-hint-item:last-child {
      border-bottom: none;
    }
    .command-hint-item:hover {
      background-color: var(--vscode-list-hoverBackground);
    }
    .command-hint-name {
      font-weight: 600;
      color: var(--vscode-textLink-foreground);
      font-size: 13px;
    }
    .command-hint-desc {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-top: 2px;
    }

    /* ─── Drop Zone ─────────────────────────────────────── */
    .drop-zone-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 122, 204, 0.1);
      border: 3px dashed var(--vscode-focusBorder);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      pointer-events: none;
    }
    .drop-zone-overlay.active {
      display: flex;
    }
    .drop-zone-text {
      font-size: 24px;
      font-weight: 600;
      color: var(--vscode-focusBorder);
    }

    /* ─── File & Image Chips ────────────────────────────── */
    .file-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
    }
    .file-chip-remove {
      cursor: pointer;
      font-weight: bold;
      opacity: 0.7;
    }
    .file-chip-remove:hover {
      opacity: 1;
    }
    .image-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
    }
    .image-chip img {
      width: 24px;
      height: 24px;
      object-fit: cover;
      border-radius: 4px;
    }
    .image-chip-remove {
      cursor: pointer;
      font-weight: bold;
      opacity: 0.7;
    }
    .image-chip-remove:hover {
      opacity: 1;
    }
  `;
}

/**
 * Get HTML body content
 */
function getBodyContent(): string {
  return `
  <div class="drop-zone-overlay" id="drop-zone-overlay">
    <div class="drop-zone-text">Drop files here</div>
  </div>

  <header id="global-controls">
    <div class="header-left">
      <button class="header-btn" id="history-btn" title="History">&#9776;</button>
      <button class="header-btn" id="undo-btn" title="Undo last turn">&#x21A9;</button>
    </div>
    <div class="header-center">
      <span id="session-title">New Chat</span>
      <input id="session-title-input" type="text" style="display:none;">
    </div>
    <div class="header-right">
      <button class="header-btn" id="new-chat-btn" title="New Chat">+</button>
      <button class="header-btn" id="settings-btn" title="Settings">&#9881;</button>
    </div>
  </header>

  <main id="chat-stream">
    <div id="plan-container">
      <div class="plan-header">
        <span class="plan-title">Plan</span>
        <span class="plan-progress" id="plan-progress"></span>
        <button class="code-action-btn" id="run-agent-btn" style="font-size:11px;padding:3px 10px;">Run Agent</button>
      </div>
      <div id="plan-tasks"></div>
    </div>
    <div id="changes-container">
      <div class="changes-header">Pending Changes</div>
      <div id="changes-list"></div>
      <div class="changes-actions">
        <button class="btn-accept-all" id="btn-accept-all">Accept All</button>
        <button class="btn-apply-selected" id="btn-apply-selected">Apply Selected</button>
        <button class="btn-reject" id="btn-reject">Reject</button>
      </div>
    </div>
    <div id="chat-container"></div>
    <div class="loading" id="loading"><span class="spinner-char" id="spinner-char"></span><span class="loading-text">Generating</span></div>
  </main>

  <footer id="input-zone">
    <div class="input-row input-row-1">
      <select id="mode-select">
        <option value="ask">Ask</option>
        <option value="planner">Planner</option>
        <option value="agent">Agent</option>
        <option value="debug">Debug</option>
      </select>
      <div class="context-area" id="context-area">
        <span id="context-text" class="context-badge"></span>
        <div class="context-chips" id="dropped-files-container"></div>
      </div>
    </div>
    <div class="input-row input-row-2">
      <textarea id="message-input" rows="1" placeholder="Ask me anything or type / for commands..."></textarea>
      <div class="command-hints" id="command-hints"></div>
    </div>
    <div class="input-row input-row-3">
      <button class="footer-btn" id="attach-button" title="Attach files">&#128206;</button>
      <div class="input-row-3-right">
        <button class="footer-btn" id="send-button">Send</button>
        <button class="footer-btn" id="stop-button">Stop</button>
      </div>
    </div>
  </footer>
  `;
}

/**
 * Get JavaScript for webview interactivity
 */
function getScript(): string {
  return `
    var vscode = acquireVsCodeApi();
    var chatStream = document.getElementById('chat-stream');
    var chatContainer = document.getElementById('chat-container');
    var messageInput = document.getElementById('message-input');
    var sendButton = document.getElementById('send-button');
    var stopButton = document.getElementById('stop-button');
    var attachButton = document.getElementById('attach-button');
    var loading = document.getElementById('loading');
    var contextText = document.getElementById('context-text');
    var commandHints = document.getElementById('command-hints');
    var dropZoneOverlay = document.getElementById('drop-zone-overlay');
    var droppedFilesContainer = document.getElementById('dropped-files-container');
    var modeSelect = document.getElementById('mode-select');
    var planContainer = document.getElementById('plan-container');
    var planTasksEl = document.getElementById('plan-tasks');
    var planProgressEl = document.getElementById('plan-progress');
    var changesContainer = document.getElementById('changes-container');
    var changesListEl = document.getElementById('changes-list');
    var sessionTitle = document.getElementById('session-title');
    var sessionTitleInput = document.getElementById('session-title-input');
    var droppedFiles = new Map();
    var pendingImages = [];
    var currentPlan = [];
    var spinnerFrames = ['\\u280B', '\\u2819', '\\u2839', '\\u2838', '\\u283C', '\\u2834', '\\u2826', '\\u2827', '\\u2807', '\\u280F'];
    var spinnerIndex = 0;
    var spinnerInterval = null;
    var spinnerEl = document.getElementById('spinner-char');
    var isStreaming = false;

    function scrollToBottom() {
      chatStream.scrollTop = chatStream.scrollHeight;
    }

    function startSpinner() {
      if (spinnerInterval) return;
      spinnerIndex = 0;
      spinnerEl.textContent = spinnerFrames[0];
      spinnerInterval = setInterval(function() {
        spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
        spinnerEl.textContent = spinnerFrames[spinnerIndex];
      }, 80);
    }
    function stopSpinner() {
      if (spinnerInterval) {
        clearInterval(spinnerInterval);
        spinnerInterval = null;
      }
    }
    var bubbleSpinnerInterval = null;
    function startBubbleSpinner() {
      stopBubbleSpinner();
      var bIdx = 0;
      var el = document.getElementById('bubble-spinner-char');
      if (!el) return;
      el.textContent = spinnerFrames[0];
      bubbleSpinnerInterval = setInterval(function() {
        bIdx = (bIdx + 1) % spinnerFrames.length;
        var bel = document.getElementById('bubble-spinner-char');
        if (bel) bel.textContent = spinnerFrames[bIdx];
      }, 80);
    }
    function stopBubbleSpinner() {
      if (bubbleSpinnerInterval) {
        clearInterval(bubbleSpinnerInterval);
        bubbleSpinnerInterval = null;
      }
      var bs = document.getElementById('bubble-spinner');
      if (bs) bs.remove();
    }

    function setStreamingState(streaming) {
      isStreaming = streaming;
      if (streaming) {
        sendButton.style.display = 'none';
        stopButton.style.display = 'flex';
        loading.classList.add('active');
        startSpinner();
      } else {
        sendButton.style.display = 'flex';
        stopButton.style.display = 'none';
        sendButton.disabled = false;
        loading.classList.remove('active');
        stopSpinner();
      }
    }

    var commands = [
      { name: '/fix', icon: '\\uD83D\\uDD27', desc: 'Fix bugs in the selected code' },
      { name: '/explain', icon: '\\uD83D\\uDCD6', desc: 'Explain code in simple terms' },
      { name: '/refactor', icon: '\\u26A1', desc: 'Improve code readability and performance' },
      { name: '/optimize', icon: '\\uD83D\\uDE80', desc: 'Optimize code for better performance' },
      { name: '/document', icon: '\\uD83D\\uDCDD', desc: 'Add documentation and comments' },
      { name: '/test', icon: '\\uD83E\\uDDEA', desc: 'Generate unit tests' }
    ];

    function sendMessage() {
      var message = messageInput.value.trim();
      if (!message && pendingImages.length === 0) return;
      var images = pendingImages.map(function(img) { return { base64: img.base64, media_type: img.media_type }; });
      vscode.postMessage({ type: 'sendMessage', value: message, images: images.length > 0 ? images : undefined });
      messageInput.value = '';
      messageInput.style.height = 'auto';
      clearAllImageChips();
    }

    sendButton.addEventListener('click', sendMessage);
    stopButton.addEventListener('click', function() {
      vscode.postMessage({ type: 'stopStream' });
    });
    attachButton.addEventListener('click', function() {
      vscode.postMessage({ type: 'selectFile' });
    });
    modeSelect.addEventListener('change', function(e) {
      var mode = e.target.value;
      vscode.postMessage({ type: 'setMode', mode: mode });
      if ((mode === 'planner' || mode === 'agent') && currentPlan.length > 0) {
        planContainer.classList.add('active');
      } else if (mode !== 'planner' && mode !== 'agent') {
        planContainer.classList.remove('active');
      }
    });
    document.getElementById('run-agent-btn').addEventListener('click', function() {
      vscode.postMessage({ type: 'startAgent' });
    });
    document.getElementById('undo-btn').addEventListener('click', function() {
      vscode.postMessage({ type: 'undoLastTurn' });
    });
    document.getElementById('new-chat-btn').addEventListener('click', function() {
      vscode.postMessage({ type: 'newChat' });
    });
    document.getElementById('history-btn').addEventListener('click', function() {
      vscode.postMessage({ type: 'toggleHistory' });
    });
    document.getElementById('settings-btn').addEventListener('click', function() {
      vscode.postMessage({ type: 'openSettings' });
    });

    /* ── Session Title Editing ───────────────────────── */
    sessionTitle.addEventListener('dblclick', function() {
      sessionTitleInput.value = sessionTitle.textContent;
      sessionTitle.style.display = 'none';
      sessionTitleInput.style.display = 'inline-block';
      sessionTitleInput.focus();
      sessionTitleInput.select();
    });
    sessionTitleInput.addEventListener('blur', commitTitleEdit);
    sessionTitleInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); commitTitleEdit(); }
      if (e.key === 'Escape') { cancelTitleEdit(); }
    });
    function commitTitleEdit() {
      var newTitle = sessionTitleInput.value.trim() || 'New Chat';
      sessionTitle.textContent = newTitle;
      sessionTitle.style.display = '';
      sessionTitleInput.style.display = 'none';
      vscode.postMessage({ type: 'updateSessionTitle', value: newTitle });
    }
    function cancelTitleEdit() {
      sessionTitle.style.display = '';
      sessionTitleInput.style.display = 'none';
    }

    /* ── Textarea Auto-resize & Input Handling ────────── */
    messageInput.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 150) + 'px';
      var value = this.value;
      if (value.startsWith('/') && value.length > 0) {
        showCommandHints(value);
      } else {
        hideCommandHints();
      }
    });
    messageInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        hideCommandHints();
        sendMessage();
      }
    });
    messageInput.addEventListener('blur', function() {
      setTimeout(function() { hideCommandHints(); }, 200);
    });

    function showCommandHints(input) {
      var searchTerm = input.toLowerCase();
      var filtered = commands.filter(function(cmd) { return cmd.name.startsWith(searchTerm); });
      if (filtered.length === 0) {
        hideCommandHints();
        return;
      }
      commandHints.innerHTML = filtered.map(function(cmd) {
        return '<div class="command-hint-item" data-command="' + cmd.name + '">' +
          '<div class="command-hint-name">' + cmd.icon + ' ' + cmd.name + '</div>' +
          '<div class="command-hint-desc">' + cmd.desc + '</div>' +
        '</div>';
      }).join('');
      commandHints.querySelectorAll('.command-hint-item').forEach(function(item) {
        item.addEventListener('click', function() {
          messageInput.value = item.dataset.command + ' ';
          messageInput.focus();
          hideCommandHints();
        });
      });
      commandHints.classList.add('active');
    }
    function hideCommandHints() {
      commandHints.classList.remove('active');
    }

    /* ── Drag & Drop ──────────────────────────────────── */
    document.body.addEventListener('dragover', function(e) {
      e.preventDefault();
      dropZoneOverlay.classList.add('active');
    });
    document.body.addEventListener('dragleave', function(e) {
      if (e.target === document.body) {
        dropZoneOverlay.classList.remove('active');
      }
    });
    document.body.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      dropZoneOverlay.classList.remove('active');
      var items = e.dataTransfer.items;
      if (items) {
        for (var i = 0; i < items.length; i++) {
          if (items[i].kind === 'file') {
            var file = items[i].getAsFile();
            if (file) {
              vscode.postMessage({ type: 'fileDropped', filePath: file.path || file.name, fileName: file.name });
            }
          } else if (items[i].kind === 'string' && items[i].type === 'text/uri-list') {
            items[i].getAsString(function(uri) {
              vscode.postMessage({ type: 'fileDropped', filePath: uri, fileName: uri.split('/').pop() });
            });
          }
        }
      }
    });

    /* ── File & Image Chip Functions ──────────────────── */
    function addFileChip(filePath, fileName) {
      if (droppedFiles.has(filePath)) return;
      droppedFiles.set(filePath, fileName);
      var chip = document.createElement('div');
      chip.className = 'file-chip';
      chip.dataset.filepath = filePath;
      chip.innerHTML = fileName + ' <span class="file-chip-remove">\\u2715</span>';
      chip.querySelector('.file-chip-remove').addEventListener('click', function() {
        removeFileChip(filePath);
      });
      droppedFilesContainer.appendChild(chip);
    }
    function removeFileChip(filePath) {
      droppedFiles.delete(filePath);
      var chip = droppedFilesContainer.querySelector('[data-filepath="' + filePath + '"]');
      if (chip) chip.remove();
      vscode.postMessage({ type: 'removeFile', filePath: filePath });
    }
    function clearAllFileChips() {
      droppedFiles.clear();
      droppedFilesContainer.innerHTML = '';
    }

    /* ── Image Paste ──────────────────────────────────── */
    messageInput.addEventListener('paste', function(e) {
      var items = e.clipboardData ? e.clipboardData.items : null;
      if (!items) return;
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          var blob = item.getAsFile();
          if (!blob) continue;
          var reader = new FileReader();
          reader.onload = function(ev) {
            var dataUrl = ev.target.result;
            var base64 = dataUrl.split(',')[1];
            var media_type = item.type;
            var id = Date.now() + '_' + Math.random().toString(36).slice(2);
            pendingImages.push({ id: id, base64: base64, media_type: media_type, dataUrl: dataUrl });
            addImageChip(id, dataUrl);
          };
          reader.readAsDataURL(blob);
          break;
        }
      }
    });
    function addImageChip(id, dataUrl) {
      var chip = document.createElement('div');
      chip.className = 'image-chip';
      chip.dataset.imageId = id;
      var img = document.createElement('img');
      img.src = dataUrl;
      img.alt = 'Pasted image';
      chip.appendChild(img);
      var removeBtn = document.createElement('span');
      removeBtn.className = 'image-chip-remove';
      removeBtn.textContent = '\\u2715';
      removeBtn.addEventListener('click', function() { removeImageChip(id); });
      chip.appendChild(removeBtn);
      droppedFilesContainer.appendChild(chip);
    }
    function removeImageChip(id) {
      var idx = pendingImages.findIndex(function(img) { return img.id === id; });
      if (idx !== -1) pendingImages.splice(idx, 1);
      var chip = droppedFilesContainer.querySelector('[data-image-id="' + id + '"]');
      if (chip) chip.remove();
    }
    function clearAllImageChips() {
      pendingImages.length = 0;
      droppedFilesContainer.querySelectorAll('.image-chip').forEach(function(c) { c.remove(); });
    }

    /* ── Plan Rendering ───────────────────────────────── */
    function renderPlan(tasks) {
      currentPlan = tasks;
      planTasksEl.innerHTML = '';
      if (!tasks || tasks.length === 0) {
        planContainer.classList.remove('active');
        return;
      }
      planContainer.classList.add('active');
      var done = tasks.filter(function(t) { return t.status === 'done'; }).length;
      planProgressEl.textContent = done + '/' + tasks.length + ' done';
      tasks.forEach(function(task) {
        var row = document.createElement('div');
        row.className = 'plan-task' + (task.status === 'done' ? ' done' : '') + (task.status === 'in_progress' ? ' in_progress' : '');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'plan-task-checkbox';
        cb.checked = task.status === 'done';
        cb.addEventListener('change', function() {
          var newStatus = cb.checked ? 'done' : 'pending';
          vscode.postMessage({ type: 'updatePlanTask', value: { id: task.id, status: newStatus } });
        });
        var idSpan = document.createElement('span');
        idSpan.className = 'plan-task-id';
        idSpan.textContent = task.id + '.';
        var textSpan = document.createElement('span');
        textSpan.className = 'plan-task-text';
        textSpan.textContent = task.task;
        var statusSpan = document.createElement('span');
        statusSpan.className = 'plan-task-status ' + task.status;
        statusSpan.textContent = task.status;
        row.appendChild(cb);
        row.appendChild(idSpan);
        row.appendChild(textSpan);
        row.appendChild(statusSpan);
        planTasksEl.appendChild(row);
      });
    }

    /* ── Changes Rendering ────────────────────────────── */
    function renderChanges(changes) {
      changesListEl.innerHTML = '';
      if (!changes || changes.length === 0) {
        changesContainer.classList.remove('active');
        return;
      }
      changesContainer.classList.add('active');
      changes.forEach(function(change) {
        var row = document.createElement('div');
        row.className = 'change-item';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = change.selected !== false;
        cb.addEventListener('change', function() {
          vscode.postMessage({ type: 'toggleChangeSelection', filePath: change.filePath });
        });
        var nameSpan = document.createElement('span');
        nameSpan.textContent = change.fileName;
        nameSpan.style.flex = '1';
        nameSpan.style.cursor = 'pointer';
        nameSpan.addEventListener('click', function() {
          vscode.postMessage({ type: 'openChangeDiff', filePath: change.filePath });
        });
        var actionSpan = document.createElement('span');
        actionSpan.className = 'change-action ' + change.action;
        actionSpan.textContent = change.action;
        row.appendChild(cb);
        row.appendChild(nameSpan);
        row.appendChild(actionSpan);
        changesListEl.appendChild(row);
      });
    }
    document.getElementById('btn-accept-all').addEventListener('click', function() {
      vscode.postMessage({ type: 'acceptAllChanges' });
    });
    document.getElementById('btn-apply-selected').addEventListener('click', function() {
      vscode.postMessage({ type: 'applySelectedChanges' });
    });
    document.getElementById('btn-reject').addEventListener('click', function() {
      vscode.postMessage({ type: 'discardAllChanges' });
    });

    /* ── Request Initial Context ──────────────────────── */
    vscode.postMessage({ type: 'requestContext' });

    /* ── Streaming State ──────────────────────────────── */
    var currentStreamingMessage = null;
    var currentStreamingContent = null;
    var currentMessageBuffer = '';
    var renderPending = false;
    var currentStreamMode = 'ask';
    var agentParserState = 'idle';
    var agentRawBuffer = '';
    var agentContentBuffer = '';
    var agentThinkingBodyEl = null;
    var agentMessageEl = null;
    var agentMessageBuffer = '';

    /* ── Markdown Setup ───────────────────────────────── */
    var md = window.markdownit({
      html: true,
      linkify: true,
      typographer: true,
      highlight: function(str, lang) {
        if (lang && hljs.getLanguage(lang)) {
          try {
            return '<pre class="hljs"><code>' + hljs.highlight(str, { language: lang, ignoreIllegals: true }).value + '</code></pre>';
          } catch (__) {}
        }
        return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>';
      }
    });

    function renderStreamingMarkdown() {
      if (!currentStreamingContent || !currentMessageBuffer) return;
      var textToRender = currentMessageBuffer;
      var backtickCount = (textToRender.match(/\\\`\\\`\\\`/g) || []).length;
      if (backtickCount % 2 !== 0) {
        textToRender += '\\n\\\`\\\`\\\`';
      }
      currentStreamingContent.innerHTML = md.render(textToRender);
      scrollToBottom();
      renderPending = false;
    }

    /* ── Message Handler ──────────────────────────────── */
    window.addEventListener('message', function(event) {
      var message = event.data;
      switch (message.type) {
        case 'addMessage':
          addMessage(message.role, message.content, message.html);
          break;
        case 'startStream':
          startStreamingMessage(message.role, message.mode || 'ask');
          setStreamingState(true);
          break;
        case 'streamChunk':
          appendStreamChunk(message.content);
          break;
        case 'streamDone':
          finalizeStream(message.content, message.parsedContent);
          setStreamingState(false);
          break;
        case 'streamError':
          handleStreamError(message.content);
          setStreamingState(false);
          break;
        case 'setLoading':
          if (message.value) {
            setStreamingState(true);
          } else {
            setStreamingState(false);
          }
          break;
        case 'updateContext':
          updateContextDisplay(message.fileName, message.languageId);
          break;
        case 'contextCleared':
          chatContainer.innerHTML = '';
          planContainer.classList.remove('active');
          changesContainer.classList.remove('active');
          clearAllFileChips();
          clearAllImageChips();
          break;
        case 'fileAdded':
          addFileChip(message.filePath, message.fileName);
          break;
        case 'fileRemoved':
          var chipToRemove = droppedFilesContainer.querySelector('[data-filepath="' + message.filePath + '"]');
          if (chipToRemove) chipToRemove.remove();
          break;
        case 'updatePlan':
          renderPlan(message.plan);
          break;
        case 'updateChanges':
          renderChanges(message.changes);
          break;
        case 'undoComplete':
          var msgs = chatContainer.querySelectorAll('.message');
          if (msgs.length >= 2) {
            msgs[msgs.length - 1].remove();
            msgs[msgs.length - 2].remove();
          }
          break;
        case 'editComplete':
          var editMsgs = chatContainer.querySelectorAll('.message');
          if (editMsgs.length >= 2) {
            editMsgs[editMsgs.length - 1].remove();
            editMsgs[editMsgs.length - 2].remove();
          } else if (editMsgs.length === 1) {
            editMsgs[editMsgs.length - 1].remove();
          }
          if (message.value) {
            messageInput.value = message.value;
            messageInput.style.height = 'auto';
            messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + 'px';
            messageInput.focus();
          }
          break;
        case 'updateSessionTitle':
          sessionTitle.textContent = message.value || 'New Chat';
          break;
        case 'clearChat':
          chatContainer.innerHTML = '';
          sessionTitle.textContent = 'New Chat';
          planContainer.classList.remove('active');
          changesContainer.classList.remove('active');
          clearAllFileChips();
          clearAllImageChips();
          break;
      }
    });

    function updateContextDisplay(fileName, languageId) {
      if (fileName && languageId) {
        contextText.textContent = fileName + ' (' + languageId + ')';
      } else {
        contextText.textContent = '';
      }
    }

    /* ── Streaming Functions ──────────────────────────── */
    function startStreamingMessage(role, mode) {
      currentMessageBuffer = '';
      currentStreamMode = mode || 'ask';
      agentParserState = 'idle';
      agentRawBuffer = '';
      agentContentBuffer = '';
      agentThinkingBodyEl = null;
      agentMessageEl = null;
      agentMessageBuffer = '';
      var messageDiv = document.createElement('div');
      messageDiv.className = 'message ' + role;
      var bubbleDiv = document.createElement('div');
      bubbleDiv.className = 'message-bubble';
      var headerDiv = document.createElement('div');
      headerDiv.className = 'message-header';
      headerDiv.textContent = role === 'user' ? 'You' : 'Zero-G AI';
      var contentDiv = document.createElement('div');
      contentDiv.className = 'message-content';
      var bubbleSpinner = document.createElement('div');
      bubbleSpinner.className = 'bubble-spinner';
      bubbleSpinner.id = 'bubble-spinner';
      bubbleSpinner.innerHTML = '<span class="spinner-char" id="bubble-spinner-char"></span> Generating...';
      contentDiv.appendChild(bubbleSpinner);
      bubbleDiv.appendChild(headerDiv);
      bubbleDiv.appendChild(contentDiv);
      messageDiv.appendChild(bubbleDiv);
      chatContainer.appendChild(messageDiv);
      currentStreamingMessage = messageDiv;
      currentStreamingContent = contentDiv;
      scrollToBottom();
      startBubbleSpinner();
    }

    function appendStreamChunk(chunk) {
      if (!currentStreamingContent) return;
      stopBubbleSpinner();
      currentMessageBuffer += chunk;
      if (currentStreamMode === 'agent') {
        appendAgentChunk(chunk);
        return;
      }
      if (!renderPending) {
        renderPending = true;
        requestAnimationFrame(renderStreamingMarkdown);
      }
    }

    function appendAgentChunk(chunk) {
      agentRawBuffer += chunk;
      processAgentBuffer();
    }

    function processAgentBuffer() {
      while (agentRawBuffer.length > 0) {
        if (agentParserState === 'idle') {
          var openIdx = agentRawBuffer.indexOf('<');
          if (openIdx === -1) { agentRawBuffer = ''; return; }
          agentRawBuffer = agentRawBuffer.substring(openIdx);
          var closeIdx = agentRawBuffer.indexOf('>');
          if (closeIdx === -1) { return; }
          var tagContent = agentRawBuffer.substring(1, closeIdx).trim();
          agentRawBuffer = agentRawBuffer.substring(closeIdx + 1);
          if (tagContent === 'thinking') {
            agentParserState = 'thinking';
            agentContentBuffer = '';
            var acc = createThinkingAccordion();
            currentStreamingContent.appendChild(acc);
            agentThinkingBodyEl = acc.querySelector('.thinking-body');
          } else if (tagContent === 'tool_call') {
            agentParserState = 'tool_call';
            agentContentBuffer = '';
          } else if (tagContent === 'message') {
            agentParserState = 'message';
            agentContentBuffer = '';
            agentMessageBuffer = '';
            agentMessageEl = document.createElement('div');
            agentMessageEl.className = 'agent-message-content';
            currentStreamingContent.appendChild(agentMessageEl);
          }
        } else {
          var closingTag = '</' + agentParserState + '>';
          var cIdx = agentRawBuffer.indexOf(closingTag);
          if (cIdx === -1) {
            var safeContent = agentRawBuffer;
            var holdBack = '';
            for (var pLen = closingTag.length - 1; pLen >= 1; pLen--) {
              if (agentRawBuffer.length >= pLen && agentRawBuffer.endsWith(closingTag.substring(0, pLen))) {
                safeContent = agentRawBuffer.substring(0, agentRawBuffer.length - pLen);
                holdBack = agentRawBuffer.substring(agentRawBuffer.length - pLen);
                break;
              }
            }
            if (safeContent.length > 0) {
              agentContentBuffer += safeContent;
              renderAgentContent(agentParserState, safeContent);
            }
            agentRawBuffer = holdBack;
            return;
          } else {
            var content = agentRawBuffer.substring(0, cIdx);
            if (content.length > 0) {
              agentContentBuffer += content;
              renderAgentContent(agentParserState, content);
            }
            finalizeAgentTag(agentParserState, agentContentBuffer);
            agentRawBuffer = agentRawBuffer.substring(cIdx + closingTag.length);
            agentParserState = 'idle';
            agentContentBuffer = '';
          }
        }
      }
    }

    function renderAgentContent(state, newContent) {
      if (!currentStreamingContent) return;
      if (state === 'thinking' && agentThinkingBodyEl) {
        agentThinkingBodyEl.textContent += newContent;
      } else if (state === 'message' && agentMessageEl) {
        agentMessageBuffer += newContent;
        if (!renderPending) {
          renderPending = true;
          requestAnimationFrame(function() {
            var text = agentMessageBuffer;
            var bCount = (text.match(/\\\`\\\`\\\`/g) || []).length;
            if (bCount % 2 !== 0) text += '\\n\\\`\\\`\\\`';
            agentMessageEl.innerHTML = md.render(text);
            renderPending = false;
            scrollToBottom();
          });
        }
      }
      scrollToBottom();
    }

    function finalizeAgentTag(state, fullContent) {
      if (!currentStreamingContent) return;
      if (state === 'thinking') {
        agentThinkingBodyEl = null;
      } else if (state === 'message' && agentMessageEl) {
        agentMessageEl.innerHTML = md.render(fullContent);
        enhanceCodeBlocks(agentMessageEl);
        agentMessageEl = null;
        agentMessageBuffer = '';
      } else if (state === 'tool_call') {
        try {
          var tc = JSON.parse(fullContent.trim());
          if (tc.name === 'write_file') {
            var card = createFileChangeCard(tc);
            currentStreamingContent.appendChild(card);
          } else if (tc.name === 'run_command') {
            var widget = createToolCallWidget(tc);
            currentStreamingContent.appendChild(widget);
          }
        } catch (e) {
          console.error('Failed to parse agent tool call:', e);
        }
      }
      scrollToBottom();
    }

    /* ── Widget Factories ─────────────────────────────── */
    function createThinkingAccordion() {
      var accordion = document.createElement('div');
      accordion.className = 'thinking-accordion';
      var toggle = document.createElement('div');
      toggle.className = 'thinking-toggle';
      toggle.innerHTML = '<span class="arrow">&#9654;</span> Thinking...';
      toggle.addEventListener('click', function() {
        accordion.classList.toggle('open');
      });
      var body = document.createElement('div');
      body.className = 'thinking-body';
      accordion.appendChild(toggle);
      accordion.appendChild(body);
      return accordion;
    }

    function createFileChangeCard(toolCall) {
      var filePath = toolCall.arguments ? toolCall.arguments.file_path : 'unknown';
      if (!filePath) filePath = 'unknown';
      var fileName = filePath.split('/').pop() || filePath;
      var card = document.createElement('div');
      card.className = 'file-change-card';
      var header = document.createElement('div');
      header.className = 'file-change-header';
      var nameSpan = document.createElement('span');
      nameSpan.className = 'file-change-name';
      nameSpan.textContent = filePath;
      nameSpan.title = filePath;
      var badge = document.createElement('span');
      badge.className = 'file-change-badge';
      badge.textContent = 'WRITE';
      header.appendChild(nameSpan);
      header.appendChild(badge);
      var actions = document.createElement('div');
      actions.className = 'file-change-actions';
      var diffBtn = document.createElement('button');
      diffBtn.className = 'file-change-btn-diff';
      diffBtn.textContent = 'Show Diff';
      diffBtn.addEventListener('click', function() {
        vscode.postMessage({ type: 'openChangeDiff', filePath: filePath });
      });
      var applyBtn = document.createElement('button');
      applyBtn.className = 'file-change-btn-diff';
      applyBtn.textContent = 'Apply';
      applyBtn.addEventListener('click', function() {
        vscode.postMessage({ type: 'applyFileChange', filePath: filePath, value: (toolCall.arguments ? toolCall.arguments.content : '') || '' });
      });
      var rejectBtn = document.createElement('button');
      rejectBtn.className = 'file-change-btn-reject';
      rejectBtn.textContent = 'Reject';
      rejectBtn.addEventListener('click', function() {
        vscode.postMessage({ type: 'rejectFileChange', filePath: filePath, fileName: fileName });
        card.style.opacity = '0.5';
        rejectBtn.disabled = true;
        rejectBtn.textContent = 'Rejected';
      });
      actions.appendChild(diffBtn);
      actions.appendChild(applyBtn);
      actions.appendChild(rejectBtn);
      card.appendChild(header);
      card.appendChild(actions);
      return card;
    }

    function createToolCallWidget(toolCall) {
      var widget = document.createElement('div');
      widget.className = 'tool-call-widget';
      var header = document.createElement('div');
      header.className = 'tool-call-header';
      header.textContent = '\\u26A1 Command';
      var commandDiv = document.createElement('div');
      commandDiv.className = 'tool-call-command';
      var command = (toolCall.arguments ? toolCall.arguments.command : null) || JSON.stringify(toolCall.arguments);
      commandDiv.textContent = '> ' + command;
      var actionsDiv = document.createElement('div');
      actionsDiv.className = 'tool-call-actions';
      var runBtn = document.createElement('button');
      runBtn.className = 'tool-call-btn tool-call-btn-run';
      runBtn.innerHTML = '\\u25B6 Run';
      runBtn.addEventListener('click', function() {
        vscode.postMessage({ type: 'runCommand', value: command });
      });
      var copyBtn = document.createElement('button');
      copyBtn.className = 'tool-call-btn tool-call-btn-copy';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', function() {
        vscode.postMessage({ type: 'copyCode', value: command });
        copyBtn.textContent = 'Copied!';
        setTimeout(function() { copyBtn.textContent = 'Copy'; }, 2000);
      });
      actionsDiv.appendChild(runBtn);
      actionsDiv.appendChild(copyBtn);
      widget.appendChild(header);
      widget.appendChild(commandDiv);
      widget.appendChild(actionsDiv);
      return widget;
    }

    /* ── Finalize & Error Handling ─────────────────────── */
    function finalizeStream(renderedHtml, parsedContent) {
      if (!currentStreamingContent) return;
      stopBubbleSpinner();
      if (currentStreamMode === 'agent') {
        if (agentRawBuffer.length > 0 && agentParserState !== 'idle') {
          agentContentBuffer += agentRawBuffer;
          finalizeAgentTag(agentParserState, agentContentBuffer);
        }
        agentParserState = 'idle';
        agentRawBuffer = '';
        agentContentBuffer = '';
        agentThinkingBodyEl = null;
        agentMessageEl = null;
        agentMessageBuffer = '';
      } else if (parsedContent && parsedContent.segments) {
        currentStreamingContent.innerHTML = '';
        var container = currentStreamingContent;
        parsedContent.segments.forEach(function(segment) {
          if (segment.type === 'text') {
            var textDiv = document.createElement('div');
            textDiv.innerHTML = segment.content;
            container.appendChild(textDiv);
          } else if (segment.type === 'tool_call' && segment.toolCall) {
            var toolWidget = createToolCallWidget(segment.toolCall);
            container.appendChild(toolWidget);
          }
        });
        enhanceCodeBlocks(container);
      } else if (renderedHtml) {
        currentStreamingContent.innerHTML = renderedHtml;
        enhanceCodeBlocks(currentStreamingContent);
      }
      currentStreamingMessage = null;
      currentStreamingContent = null;
      scrollToBottom();
    }

    function handleStreamError(errorMessage) {
      stopBubbleSpinner();
      if (currentStreamingContent) {
        currentStreamingContent.textContent = errorMessage;
      } else {
        addMessage('assistant', errorMessage, false);
      }
      currentStreamingMessage = null;
      currentStreamingContent = null;
    }

    /* ── Add Static Message ───────────────────────────── */
    function addMessage(role, content, isHtml) {
      var messageDiv = document.createElement('div');
      messageDiv.className = 'message ' + role;
      var bubbleDiv = document.createElement('div');
      bubbleDiv.className = 'message-bubble';
      var headerDiv = document.createElement('div');
      headerDiv.className = 'message-header';
      headerDiv.textContent = role === 'user' ? 'You' : 'Zero-G AI';
      var contentDiv = document.createElement('div');
      contentDiv.className = 'message-content';
      if (role === 'user') {
        chatContainer.querySelectorAll('.edit-message-btn').forEach(function(btn) { btn.remove(); });
        var editBtn = document.createElement('button');
        editBtn.className = 'edit-message-btn';
        editBtn.title = 'Edit message';
        editBtn.innerHTML = '&#9998;';
        editBtn.addEventListener('click', function() {
          var msgText = contentDiv.textContent || '';
          messageInput.value = msgText;
          messageInput.style.height = 'auto';
          messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + 'px';
          messageInput.focus();
          vscode.postMessage({ type: 'editLastMessage', value: msgText });
        });
        headerDiv.appendChild(editBtn);
      }
      if (isHtml) {
        contentDiv.innerHTML = content;
        enhanceCodeBlocks(contentDiv);
      } else {
        contentDiv.textContent = content;
      }
      bubbleDiv.appendChild(headerDiv);
      bubbleDiv.appendChild(contentDiv);
      messageDiv.appendChild(bubbleDiv);
      chatContainer.appendChild(messageDiv);
      scrollToBottom();
    }

    /* ── Code Block Enhancement ────────────────────────── */
    function enhanceCodeBlocks(container) {
      var codeBlocks = container.querySelectorAll('pre.hljs');
      codeBlocks.forEach(function(pre) {
        var code = pre.querySelector('code');
        if (!code) return;
        var codeText = code.textContent;
        var codeLanguage = code.className.match(/language-(\\w+)/);
        codeLanguage = codeLanguage ? codeLanguage[1] : '';
        var isShellCommand = ['bash', 'sh', 'shell', 'zsh', 'fish', 'powershell', 'cmd'].indexOf(codeLanguage.toLowerCase()) !== -1;
        var actionsDiv = document.createElement('div');
        actionsDiv.className = 'code-actions';
        var copyBtn = document.createElement('button');
        copyBtn.className = 'code-action-btn';
        copyBtn.textContent = 'Copy';
        copyBtn.addEventListener('click', function() {
          vscode.postMessage({ type: 'copyCode', value: codeText });
          copyBtn.textContent = 'Copied!';
          setTimeout(function() { copyBtn.textContent = 'Copy'; }, 2000);
        });
        if (isShellCommand) {
          var runBtn = document.createElement('button');
          runBtn.className = 'code-action-btn code-action-btn-run';
          runBtn.textContent = '\\u25B6 Run';
          runBtn.addEventListener('click', function() {
            vscode.postMessage({ type: 'runTerminalCommand', value: codeText });
          });
          actionsDiv.appendChild(copyBtn);
          actionsDiv.appendChild(runBtn);
        } else {
          var applyBtn = document.createElement('button');
          applyBtn.className = 'code-action-btn';
          applyBtn.textContent = 'Apply';
          applyBtn.addEventListener('mouseenter', function() {
            vscode.postMessage({ type: 'previewCode', code: codeText });
          });
          applyBtn.addEventListener('mouseleave', function() {
            vscode.postMessage({ type: 'clearPreview' });
          });
          applyBtn.addEventListener('click', function() {
            vscode.postMessage({ type: 'applyCode', value: codeText });
          });
          actionsDiv.appendChild(copyBtn);
          actionsDiv.appendChild(applyBtn);
        }
        pre.insertBefore(actionsDiv, pre.firstChild);
      });
    }
  `;
}
