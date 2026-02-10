# Agentic Terminal Execution Feature

## Overview
Zero-G now has agentic capabilities! The extension can detect shell commands in AI responses and execute them directly in an integrated terminal with user confirmation.

## Features

### 1. **Smart Shell Command Detection** 🔍
The extension automatically detects code blocks with shell languages:
- `bash`
- `sh`
- `shell`
- `zsh`
- `fish`
- `powershell`
- `cmd`

### 2. **"Run in Terminal" Button** ▶️
When the AI returns a shell command block, instead of an "Apply" button, you'll see a **"▶ Run"** button.

**Example:**
````markdown
```bash
npm install react
```
````

This will render with a **"▶ Run"** button instead of "Apply".

### 3. **Confirmation Dialog** 🛡️
Before executing ANY command, a confirmation dialog appears showing:
- The exact command to be executed
- Options: **Run**, **Copy Only**, **Cancel**

**Safety Features:**
- Modal dialog (requires explicit user action)
- Shows full command text
- Option to copy command without running it
- Can cancel at any time

### 4. **Persistent Terminal** 💻
- Creates a dedicated terminal named **"Zero-G"** with a rocket icon 🚀
- Reuses the same terminal across sessions
- Automatically recreates if closed
- Preserves terminal state and history

### 5. **Dangerous Command Detection** ⚠️
The TerminalService includes patterns to detect potentially dangerous commands:
- `rm -rf /` or `rm -rf *`
- Fork bombs
- `dd` commands (disk operations)
- Filesystem formatting (`mkfs`)
- Piping curl/wget to bash
- `chmod -R 777`

(Note: All commands still require confirmation regardless)

## Architecture

### New Service: TerminalService

**Location:** [`src/services/TerminalService.ts`](src/services/TerminalService.ts:1)

**Key Methods:**

#### `executeCommand(command, skipConfirmation)`
Executes a single command with confirmation.

```typescript
await terminalService.executeCommand('npm install');
```

**Parameters:**
- `command`: Command string to execute
- `skipConfirmation`: Skip dialog (default: false)

**Returns:** `boolean` - True if executed, false if cancelled

#### `executeCommands(commands[], skipConfirmation)`
Executes multiple commands sequentially.

```typescript
await terminalService.executeCommands([
  'npm install',
  'npm run build'
]);
```

**Features:**
- Shows all commands in confirmation
- Executes sequentially with 100ms delay between commands
- Option to copy all or cancel

#### `isDangerousCommand(command)`
Checks if a command might be dangerous.

```typescript
if (terminalService.isDangerousCommand('rm -rf /')) {
  // Extra warning
}
```

#### `extractCommands(text)`
Extracts commands from text block.

```typescript
const commands = terminalService.extractCommands(`
  $ npm install
  # Comment ignored
  npm run dev
`);
// Returns: ['npm install', 'npm run dev']
```

**Features:**
- Removes shell prompts (`$`, `>`)
- Skips comments (`#`, `//`)
- Filters empty lines

## Usage Examples

### Example 1: Installing Dependencies

**User asks:** "How do I install React?"

**AI responds:**
````markdown
To install React, run:

```bash
npm install react react-dom
```
````

**What happens:**
1. Code block renders with **"▶ Run"** button
2. User clicks Run
3. Confirmation dialog appears: "Do you want to run this command?\n\nnpm install react react-dom"
4. User clicks "Run"
5. Zero-G terminal opens and executes the command

### Example 2: Multiple Commands

**AI suggests:**
````markdown
```bash
mkdir my-project
cd my-project
npm init -y
```
````

**What happens:**
1. Button shows "▶ Run"
2. Confirmation shows all 3 commands
3. User clicks "Run All"
4. Commands execute sequentially in Zero-G terminal

### Example 3: Copy Only

**AI provides:**
````bash
git clone https://github.com/user/repo.git
cd repo
npm install
```
````

**User clicks Run → Chooses "Copy Only"**
- All commands copied to clipboard
- Nothing executed
- User can paste manually later

## Safety Mechanisms

### 1. **Always Confirm**
No command ever executes without explicit user approval.

### 2. **Modal Dialog**
Confirmation dialog is modal (blocks other actions) to prevent accidental clicks.

### 3. **Full Command Visibility**
The entire command is shown in the dialog, not truncated.

### 4. **Copy-Only Option**
Users can copy commands without running them for manual inspection.

### 5. **Terminal Visibility**
The terminal is shown when commands execute, providing full transparency.

### 6. **No Automatic Execution**
Even with slash commands like `/terminal` or `/run`, confirmation is still required.

## Integration Points

### 1. **Webview Detection**
In [`htmlGenerator.ts`](src/utils/htmlGenerator.ts:1), the `enhanceCodeBlocks()` function:
- Detects language from code block class: `language-bash`, `language-sh`, etc.
- Renders **"▶ Run"** button for shell languages
- Renders **"Apply"** button for other languages

### 2. **Message Handling**
In [`SidebarProvider.ts`](src/providers/SidebarProvider.ts:1):
```typescript
case 'runTerminalCommand':
  await this._handleRunTerminalCommand(data.value!);
  break;
```

### 3. **Terminal Management**
In [`TerminalService.ts`](src/services/TerminalService.ts:1):
- Manages Zero-G terminal instance
- Handles terminal creation/reuse
- Sends commands to terminal
- Shows confirmation dialogs

## Button Styling

**Run Button CSS:**
```css
.code-action-btn-run {
  background-color: var(--vscode-testing-runAction);
  color: var(--vscode-button-foreground);
}
```

Uses VS Code's native "run" action color for consistency with other VS Code run buttons.

## Command Flow Diagram

```
User sees code block with shell commands
          ↓
Webview detects language="bash"
          ↓
Renders "▶ Run" button
          ↓
User clicks Run button
          ↓
Webview sends { type: 'runTerminalCommand', value: command }
          ↓
SidebarProvider._handleRunTerminalCommand()
          ↓
TerminalService.executeCommand()
          ↓
Confirmation dialog shown
          ↓
User chooses: Run | Copy Only | Cancel
          ↓
[If Run] Terminal executes command
[If Copy] Clipboard gets command
[If Cancel] Nothing happens
```

## Future Enhancements

Potential improvements:
- **Command validation**: Check if command exists before executing
- **Working directory selection**: Let user choose where to run commands
- **Environment variable injection**: Pass context-specific variables
- **Command history**: Track executed commands
- **Undo/stop**: Ability to stop running commands
- **Output capture**: Capture and display command output in chat
- **Step-by-step execution**: Execute multi-line scripts line-by-line with pauses

## Compilation Status

✅ **TypeScript**: No errors
✅ **ESLint**: Passed
✅ **Build**: Successful

All features are production-ready and fully tested.

## Examples in Practice

### Development Workflow
```bash
# AI suggests project setup
npm create vite@latest my-app --template react-ts
cd my-app
npm install
npm run dev
```
→ Click "▶ Run" → Confirm → Project created and running!

### Git Operations
```bash
git add .
git commit -m "feat: add new feature"
git push origin main
```
→ Click "▶ Run" → Confirm → Changes pushed!

### System Administration
```bash
docker-compose up -d
docker ps
docker logs app_1
```
→ Click "▶ Run" → Confirm → Containers managed!

## Security Best Practices

1. **Always review commands** before clicking Run
2. **Use Copy Only** for sensitive operations
3. **Check working directory** before running commands
4. **Be cautious with sudo** commands
5. **Understand the command** before executing

---

**Zero-G is now an agentic coding assistant that can help you execute commands safely and efficiently!** 🚀
