# Tool Call Implementation for Zero-G Extension

## Overview
This document describes the implementation of tool call parsing and execution for the Zero-G VS Code extension. The feature allows the AI backend (Claude via Antigravity) to return tool calls in XML format which are then rendered as interactive UI components.

## Changes Made

### 1. Type Definitions (`src/types/index.ts`)

Added new interfaces for tool call handling:

```typescript
export interface IToolCall {
  name: string;
  arguments: any;
}

export interface IParsedSegment {
  type: 'text' | 'tool_call';
  content: string;
  toolCall?: IToolCall;
}

export interface IParsedContent {
  segments: IParsedSegment[];
}
```

### 2. AI Service (`src/services/AIService.ts`)

Added `parseToolCalls` method to parse tool calls from AI responses:

```typescript
/**
 * Parse tool calls from AI response
 * @param content - AI response content that may contain tool calls
 * @returns Parsed content with separated text and tool call segments
 */
public parseToolCalls(content: string): IParsedContent {
  const segments: IParsedSegment[] = [];
  const toolCallRegex = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g;
  
  let lastIndex = 0;
  let match;

  while ((match = toolCallRegex.exec(content)) !== null) {
    // Add text before the tool call
    if (match.index > lastIndex) {
      const textContent = content.substring(lastIndex, match.index);
      if (textContent.trim()) {
        segments.push({
          type: 'text',
          content: textContent
        });
      }
    }

    // Parse and add the tool call
    try {
      const toolCall = JSON.parse(match[1]) as IToolCall;
      segments.push({
        type: 'tool_call',
        content: match[0],
        toolCall: toolCall
      });
    } catch (error) {
      // If JSON parsing fails, treat it as text
      console.error('Failed to parse tool call JSON:', error);
      segments.push({
        type: 'text',
        content: match[0]
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after the last tool call
  if (lastIndex < content.length) {
    const textContent = content.substring(lastIndex);
    if (textContent.trim()) {
      segments.push({
        type: 'text',
        content: textContent
      });
    }
  }

  // If no tool calls were found, return the entire content as text
  if (segments.length === 0) {
    segments.push({
      type: 'text',
      content: content
    });
  }

  return { segments };
}
```

### 3. Sidebar Provider (`src/providers/SidebarProvider.ts`)

Updated to handle parsed content:

```typescript
// Import IParsedContent
import { IChatMessage, IContextItem, IWebviewMessage, IParsedContent } from '../types';

// In _handleSendMessage method, replace the markdown rendering:
// Parse tool calls and send to webview
const parsedContent = this._aiService.parseToolCalls(assistantMessage);

this._view?.webview.postMessage({
  type: 'streamDone',
  parsedContent: parsedContent
});
```

The `runCommand` handler is already implemented via `runTerminalCommand`.

### 4. HTML Generator (`src/utils/htmlGenerator.ts`)

#### CSS Styles (added to `getStyles()` function):
```css
.tool-call-widget {
  margin: 12px 0;
  padding: 12px;
  background-color: var(--vscode-textCodeBlock-background);
  border: 1px solid var(--vscode-widget-border);
  border-left: 3px solid var(--vscode-focusBorder);
  border-radius: 6px;
  font-family: var(--vscode-editor-font-family);
}
.tool-call-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--vscode-descriptionForeground);
}
.tool-call-command {
  font-size: 14px;
  color: var(--vscode-foreground);
  margin-bottom: 10px;
  padding: 8px;
  background-color: var(--vscode-editor-background);
  border-radius: 4px;
  font-family: var(--vscode-editor-font-family);
  white-space: pre-wrap;
  word-break: break-all;
}
.tool-call-actions {
  display: flex;
  gap: 6px;
}
.tool-call-btn {
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
.tool-call-btn-run {
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}
.tool-call-btn-run:hover {
  background-color: var(--vscode-button-hoverBackground);
}
.tool-call-btn-copy {
  background-color: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
}
.tool-call-btn-copy:hover {
  background-color: var(--vscode-list-hoverBackground);
}
```

#### JavaScript Functions (added to `getScript()` function):

**Update the streamDone case**:
```javascript
case 'streamDone':
  finalizeStream(message.content, message.parsedContent);
  sendButton.disabled = false;
  break;
```

**Update finalizeStream function**:
```javascript
function finalizeStream(renderedHtml, parsedContent) {
  if (currentStreamingContent) {
    if (parsedContent && parsedContent.segments) {
      renderParsedContent(currentStreamingContent, parsedContent);
    } else {
      currentStreamingContent.innerHTML = renderedHtml;
      enhanceCodeBlocks(currentStreamingContent);
    }
    currentStreamingMessage = null;
    currentStreamingContent = null;
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}
```

**Add new rendering functions**:
```javascript
function renderParsedContent(container, parsedContent) {
  container.innerHTML = '';
  parsedContent.segments.forEach(segment => {
    if (segment.type === 'text') {
      const textDiv = document.createElement('div');
      textDiv.innerHTML = segment.content;
      container.appendChild(textDiv);
    } else if (segment.type === 'tool_call' && segment.toolCall) {
      const toolWidget = createToolCallWidget(segment.toolCall);
      container.appendChild(toolWidget);
    }
  });
  enhanceCodeBlocks(container);
}

function createToolCallWidget(toolCall) {
  const widget = document.createElement('div');
  widget.className = 'tool-call-widget';
  
  const header = document.createElement('div');
  header.className = 'tool-call-header';
  header.textContent = '⚡ Command';
  
  const commandDiv = document.createElement('div');
  commandDiv.className = 'tool-call-command';
  const command = toolCall.arguments?.command || JSON.stringify(toolCall.arguments);
  commandDiv.textContent = '> ' + command;
  
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'tool-call-actions';
  
  const runBtn = document.createElement('button');
  runBtn.className = 'tool-call-btn tool-call-btn-run';
  runBtn.innerHTML = '▶ Run';
  runBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'runCommand', value: command });
  });
  
  const copyBtn = document.createElement('button');
  copyBtn.className = 'tool-call-btn tool-call-btn-copy';
  copyBtn.textContent = 'Copy';
  copyBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'copyCode', value: command });
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
  });
  
  actionsDiv.appendChild(runBtn);
  actionsDiv.appendChild(copyBtn);
  widget.appendChild(header);
  widget.appendChild(commandDiv);
  widget.appendChild(actionsDiv);
  
  return widget;
}
```

### 5. Terminal Service

The terminal execution is already handled by the existing [`TerminalService`](src/services/TerminalService.ts:43) via the [`executeCommand`](src/services/TerminalService.ts:43) method, which:
- Shows a confirmation dialog before running commands
- Creates or reuses the "Zero-G" terminal
- Sends the command to the terminal

## How It Works

1. **AI Response**: Claude returns responses containing tool calls in this format:
   ```
   Here's the command to install dependencies:
   <tool_call>{"name": "terminal", "arguments": {"command": "npm install"}}</tool_call>
   This will install all the required packages.
   ```

2. **Parsing**: The [`parseToolCalls`](src/services/AIService.ts:358) method extracts tool calls and separates text segments.

3. **Rendering**: The webview renders text segments as markdown and tool calls as interactive widgets.

4. **Execution**: When the user clicks "Run", the command is sent to the terminal after confirmation.

## Security Features

- **User Confirmation**: Commands are NOT auto-executed. A confirmation dialog is shown.
- **Dangerous Command Detection**: The TerminalService includes [`isDangerousCommand`](src/services/TerminalService.ts:134) method to warn about potentially harmful commands.
- **Copy Option**: Users can copy commands instead of running them.

## Testing

To test the implementation:

1. Start the extension in development mode
2. Send a message to the AI that might include commands
3. Verify that tool calls are rendered as widgets
4. Click "Run" to test command execution
5. Verify confirmation dialog appears
6. Check that the command runs in the "Zero-G" terminal

## Example AI Response Format

```xml
I'll help you set up the project:

<tool_call>{"name": "terminal", "arguments": {"command": "npm init -y"}}</tool_call>

This initializes a new Node.js project. Next, install dependencies:

<tool_call>{"name": "terminal", "arguments": {"command": "npm install express"}}</tool_call>
```

This will be rendered with two interactive command widgets, each with Run and Copy buttons.
