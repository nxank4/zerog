import * as vscode from 'vscode';

/**
 * Generate the complete HTML content for the webview.
 * CSS and JS are loaded from external files in media/.
 */
export function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'chat.css'));
  const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'chat.js'));
  const codiconUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'codicon', 'codicon.css'));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' https://cdnjs.cloudflare.com; font-src ${webview.cspSource}; script-src ${webview.cspSource} https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; img-src data:;">
  <title>Zero-G AI Chat</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
  <link rel="stylesheet" href="${codiconUri}">
  <link rel="stylesheet" href="${cssUri}">
  <script src="https://cdn.jsdelivr.net/npm/markdown-it@14.1.0/dist/markdown-it.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
</head>
<body>
${getBodyContent()}
  <script src="${jsUri}"></script>
</body>
</html>`;
}

/**
 * Get HTML body content
 */
function getBodyContent(): string {
  return `
  <div class="drop-zone-overlay" id="drop-zone-overlay">
    <div class="drop-zone-text"><i class="codicon codicon-file-add"></i> Drop files to focus</div>
  </div>

  <header id="global-controls">
    <div class="header-left">
      <button class="header-btn" id="history-toggle" title="Chat History"><i class="codicon codicon-history"></i></button>
      <button class="header-btn" id="undo-btn" title="Undo last turn"><i class="codicon codicon-discard"></i></button>
    </div>
    <div class="header-center">
      <span id="session-title">New Chat</span>
      <input id="session-title-input" type="text" style="display:none;">
    </div>
    <div class="header-right">
      <span id="index-status" class="index-status" title="Codebase index status"></span>
      <button class="header-btn" id="new-chat-btn" title="New Chat"><i class="codicon codicon-add"></i></button>
      <button class="header-btn" id="settings-btn" title="Settings"><i class="codicon codicon-settings-gear"></i></button>
    </div>
    <div id="history-popover" class="popover hidden">
      <div class="popover-header">
        <span>Recent Chats</span>
        <button class="popover-clear-btn" id="clear-history-btn" title="Clear All"><i class="codicon codicon-trash"></i></button>
      </div>
      <ul id="history-list"></ul>
      <div id="history-empty" class="popover-empty">No saved chats</div>
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
      </div>
    </div>
    <div class="input-row input-row-2">
      <div class="input-row input-row-3">
        <button class="footer-btn" id="attach-button" title="Attach files"><i class="codicon codicon-attach"></i></button>
      </div>
      <textarea id="message-input" rows="1" placeholder="Ask anything or type / for commands..."></textarea>
      <div class="input-row-3-right">
        <button class="footer-btn" id="send-button"><i class="codicon codicon-send"></i></button>
        <button class="footer-btn" id="stop-button"><i class="codicon codicon-debug-stop"></i></button>
      </div>
      <div class="command-hints" id="command-hints"></div>
    </div>
  </footer>
  <div id="settings-overlay">
    <div class="so-header">
      <span class="so-title"><i class="codicon codicon-settings-gear"></i> Zero-G Settings</span>
      <button class="so-close-btn" id="so-close-btn" title="Close"><i class="codicon codicon-close"></i></button>
    </div>
    <nav class="so-tabs" id="so-tabs">
      <button class="so-tab active" data-tab="general"><i class="codicon codicon-home"></i> General</button>
      <button class="so-tab" data-tab="connection"><i class="codicon codicon-plug"></i> Connection</button>
      <button class="so-tab" data-tab="agent"><i class="codicon codicon-robot"></i> Agent</button>
      <button class="so-tab" data-tab="advanced"><i class="codicon codicon-beaker"></i> Advanced</button>
    </nav>
    <div class="so-content" id="so-content">

      <!-- General -->
      <div class="so-pane active" data-pane="general">
        <div class="so-field">
          <label class="so-label"><i class="codicon codicon-color-mode"></i> Theme</label>
          <div class="so-hint">Color theme for the sidebar</div>
          <select class="so-select" id="setting-theme" data-key="ui.theme">
            <option value="system">System (VS Code Match)</option>
            <option value="zerog-dark">Zero-G Dark</option>
            <option value="midnight">Midnight</option>
            <option value="matrix">Matrix</option>
            <option value="latte">Latte</option>
          </select>
        </div>
        <div class="so-field">
          <label class="so-label"><i class="codicon codicon-target"></i> Default Mode</label>
          <div class="so-hint">Interaction mode when opening a new chat</div>
          <select class="so-select" id="setting-mode" data-key="general.mode">
            <option value="ask">Ask</option>
            <option value="planner">Planner</option>
            <option value="agent">Agent</option>
            <option value="debug">Debug</option>
          </select>
        </div>
        <div class="so-field">
          <label class="so-label"><i class="codicon codicon-globe"></i> Language</label>
          <div class="so-hint">Preferred response language (<code>auto</code> = editor locale)</div>
          <input type="text" class="so-input" id="setting-language" data-key="general.language">
        </div>
        <div class="so-field so-field-toggle">
          <div class="so-toggle-left">
            <label class="so-label"><i class="codicon codicon-lightbulb"></i> Autocomplete</label>
            <div class="so-hint">Enable ghost text inline completions</div>
          </div>
          <label class="so-switch">
            <input type="checkbox" id="setting-enableAutocomplete" data-key="general.enableAutocomplete">
            <span class="so-slider"></span>
          </label>
        </div>
        <div class="so-field so-field-toggle">
          <div class="so-toggle-left">
            <label class="so-label"><i class="codicon codicon-trash"></i> Confirm on Delete</label>
            <div class="so-hint">Show warning before deleting chat history</div>
          </div>
          <label class="so-switch">
            <input type="checkbox" id="setting-confirmOnDelete" data-key="general.confirmOnDelete" checked>
            <span class="so-slider"></span>
          </label>
        </div>
      </div>

      <!-- Connection -->
      <div class="so-pane" data-pane="connection">
        <div class="so-field">
          <label class="so-label"><i class="codicon codicon-plug"></i> Provider</label>
          <div class="so-hint">AI provider backend identifier</div>
          <input type="text" class="so-input" id="setting-provider" data-key="connection.provider">
        </div>
        <div class="so-field">
          <label class="so-label"><i class="codicon codicon-globe"></i> API Endpoint</label>
          <div class="so-hint">Base URL for the AI proxy</div>
          <input type="text" class="so-input" id="setting-baseUrl" data-key="connection.baseUrl">
        </div>
        <div class="so-field">
          <label class="so-label"><i class="codicon codicon-key"></i> API Key</label>
          <div class="so-hint">Authentication token / secret key</div>
          <input type="password" class="so-input" id="setting-apiKey" data-key="connection.apiKey">
        </div>
        <div class="so-field">
          <label class="so-label"><i class="codicon codicon-robot"></i> Model</label>
          <div class="so-hint">Model identifier sent to the provider</div>
          <select class="so-select" id="setting-model" data-key="connection.model">
            <option value="claude-opus-4-6-thinking">claude-opus-4-6-thinking</option>
            <option value="claude-sonnet-4-5-20250929">claude-sonnet-4-5-20250929</option>
            <option value="claude-haiku-4-5-20251001">claude-haiku-4-5-20251001</option>
            <option value="claude-3-opus">claude-3-opus</option>
          </select>
        </div>
      </div>

      <!-- Agent -->
      <div class="so-pane" data-pane="agent">
        <div class="so-field so-field-toggle">
          <div class="so-toggle-left">
            <label class="so-label"><i class="codicon codicon-terminal"></i> Allow Terminal</label>
            <div class="so-hint">Let the agent execute terminal commands</div>
          </div>
          <label class="so-switch">
            <input type="checkbox" id="setting-allowTerminal" data-key="agent.allowTerminal">
            <span class="so-slider"></span>
          </label>
        </div>
        <div class="so-field so-field-toggle">
          <div class="so-toggle-left">
            <label class="so-label"><i class="codicon codicon-diff"></i> Auto-Apply Diffs</label>
            <div class="so-hint">Apply file changes without manual review</div>
          </div>
          <label class="so-switch">
            <input type="checkbox" id="setting-autoApplyDiff" data-key="agent.autoApplyDiff">
            <span class="so-slider"></span>
          </label>
        </div>
        <div class="so-field">
          <label class="so-label"><i class="codicon codicon-sync"></i> Max Iterations</label>
          <div class="so-hint">Maximum plan tasks per agent run (1 &ndash; 50)</div>
          <input type="number" class="so-input" id="setting-maxIterations" data-key="agent.maxIterations" min="1" max="50">
        </div>
      </div>

      <!-- Advanced -->
      <div class="so-pane" data-pane="advanced">
        <div class="so-field">
          <label class="so-label"><i class="codicon codicon-dashboard"></i> Temperature</label>
          <div class="so-hint">Sampling temperature (0 = deterministic, 2 = creative)</div>
          <input type="number" class="so-input" id="setting-temperature" data-key="advanced.temperature" min="0" max="2" step="0.1">
        </div>
        <div class="so-field">
          <label class="so-label"><i class="codicon codicon-edit"></i> System Prompt</label>
          <div class="so-hint">Custom instructions prepended to every request</div>
          <textarea class="so-textarea" id="setting-systemPrompt" data-key="advanced.systemPrompt" rows="4"></textarea>
        </div>
        <div class="so-field">
          <label class="so-label"><i class="codicon codicon-graph"></i> Context Limit</label>
          <div class="so-hint">Maximum tokens in responses (256 &ndash; 32768)</div>
          <input type="number" class="so-input" id="setting-contextLimit" data-key="advanced.contextLimit" min="256" max="32768">
        </div>
        <div class="so-field so-field-toggle">
          <div class="so-toggle-left">
            <label class="so-label"><i class="codicon codicon-bug"></i> Debug Mode</label>
            <div class="so-hint">Verbose console logging for troubleshooting</div>
          </div>
          <label class="so-switch">
            <input type="checkbox" id="setting-debugMode" data-key="advanced.debugMode">
            <span class="so-slider"></span>
          </label>
        </div>
        <div class="so-field">
          <button class="so-btn-link" id="settings-open-advanced">Open VS Code Settings&hellip;</button>
        </div>
        <div class="so-version" id="settings-version">Zero-G v0.0.1</div>
      </div>

    </div>
    <div class="so-footer">
      <button class="so-btn so-btn-secondary" id="so-reset-btn">Reset to Defaults</button>
      <button class="so-btn so-btn-primary" id="so-save-btn"><i class="codicon codicon-save"></i> Save Changes</button>
    </div>
  </div>
  `;
}
