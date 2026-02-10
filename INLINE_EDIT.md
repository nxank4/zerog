# Inline Edit Feature

The **Inline Edit** feature provides Cursor-style AI-powered code editing directly within the editor. Select code, trigger the command, describe your changes, and watch AI stream the replacement in real-time.

## Features

### 1. **Quick Access**
- **Keybinding**: `Ctrl+Alt+K` (Windows/Linux) or `Cmd+K` (macOS)
- **Command Palette**: `Zero-G: Inline Edit`
- Works only when code is selected in the active editor

### 2. **Visual Feedback**
- Selected code is grayed out (50% opacity) during processing
- Progress notification shows AI is working
- Real-time streaming replacement updates the selection as AI generates code

### 3. **Context-Aware Editing**
- Sends the selected code to AI
- Includes 10 lines of context before and after selection
- Provides file name and language for better AI understanding
- Preserves indentation and formatting

### 4. **Error Handling**
- Automatic rollback to original text if AI request fails
- Clear error messages for debugging
- Decorations cleared on completion or error

## Usage

### Basic Workflow

1. **Select code** in your editor (function, class, block, or any text)
2. **Trigger the command**:
   - Press `Ctrl+Alt+K` (or `Cmd+K` on Mac)
   - Or use Command Palette: `Ctrl+Shift+P` → `Zero-G: Inline Edit`
3. **Enter your instruction** in the input box that appears:
   - "Add error handling"
   - "Refactor to use async/await"
   - "Add TypeScript types"
   - "Optimize this loop"
4. **Watch the magic**: AI streams the replacement directly into your editor

### Example Use Cases

#### Refactoring
```typescript
// Select this code:
function getData() {
  return fetch('/api/data').then(res => res.json());
}

// Instruction: "Convert to async/await"
// Result:
async function getData() {
  const res = await fetch('/api/data');
  return await res.json();
}
```

#### Adding Features
```python
# Select this code:
def calculate(a, b):
    return a + b

# Instruction: "Add input validation and type hints"
# Result:
def calculate(a: float, b: float) -> float:
    if not isinstance(a, (int, float)) or not isinstance(b, (int, float)):
        raise TypeError("Arguments must be numbers")
    return a + b
```

#### Error Handling
```javascript
// Select this code:
const data = JSON.parse(response);

// Instruction: "Add try-catch error handling"
// Result:
let data;
try {
  data = JSON.parse(response);
} catch (error) {
  console.error('Failed to parse JSON:', error);
  data = null;
}
```

## Technical Implementation

### Architecture

The feature is implemented in [`InlineEditController.ts`](src/services/InlineEditController.ts):

```typescript
export class InlineEditController {
  private _processingDecorationType: vscode.TextEditorDecorationType;
  
  // Main entry point triggered by keybinding
  public async triggerInlineEdit(): Promise<void>
  
  // Performs the AI-powered edit with streaming
  private async _performInlineEdit(
    editor: vscode.TextEditor,
    selection: vscode.Selection,
    instruction: string
  ): Promise<void>
  
  // Gathers surrounding context (10 lines up/down)
  private _gatherContext(
    editor: vscode.TextEditor,
    selection: vscode.Selection
  ): { before: string; after: string }
  
  // Builds the prompt for AI
  private _buildPrompt(
    selectedCode: string,
    instruction: string,
    context: { before: string; after: string },
    fileName: string,
    languageId: string
  ): string
  
  // Streams replacement into the editor
  private _updateSelection(
    editor: vscode.TextEditor,
    selection: vscode.Selection,
    newText: string
  ): void
}
```

### Decoration API
Uses VS Code's Decoration API to gray out the selection during processing:

```typescript
this._processingDecorationType = vscode.window.createTextEditorDecorationType({
  backgroundColor: 'rgba(128, 128, 128, 0.2)',
  opacity: '0.5'
});
```

### Context Gathering
Captures 10 lines before and after the selection for better AI understanding:

```typescript
const startLine = Math.max(0, selection.start.line - 10);
const endLine = Math.min(editor.document.lineCount - 1, selection.end.line + 10);
```

### AI Prompt Structure
```
You are a code editing assistant. The user wants to modify the following code.

**File**: example.ts
**Language**: typescript

**Context Before**:
[10 lines before selection]

**Selected Code**:
[user's selection]

**Context After**:
[10 lines after selection]

**User Instruction**: "Add error handling"

Please provide ONLY the replacement code for the selected section. No explanations, no markdown.
```

### Streaming Replacement
Uses [`AIService.sendMessage()`](src/services/AIService.ts) with real-time streaming:

```typescript
const assistantMessage = await this._aiService.sendMessage(
  prompt,
  (chunk: string) => {
    replacementText += chunk;
    this._updateSelection(editor, selection, replacementText);
  }
);
```

### Error Recovery
Automatically rolls back to original text if AI request fails:

```typescript
try {
  // ... AI processing ...
} catch (error) {
  // Rollback to original text
  await editor.edit(editBuilder => {
    editBuilder.replace(selection, originalText);
  });
  vscode.window.showErrorMessage(`Inline edit failed: ${error}`);
}
```

## Configuration

### Keybinding Customization
Edit `keybindings.json` in VS Code settings:

```json
{
  "command": "zerog.inlineEdit",
  "key": "ctrl+k",  // Change to your preference
  "mac": "cmd+k",
  "when": "editorTextFocus && editorHasSelection"
}
```

### AI Settings
The feature uses the global Zero-G AI settings:
- **Base URL**: `zerog.baseUrl` (default: `http://localhost:8080`)
- **Auth Token**: `zerog.authToken` (default: `test`)
- **Model**: `zerog.model` (default: `claude-opus-4-6-thinking`)
- **System Prompt**: `zerog.systemPrompt`

## Best Practices

### 1. **Select Precisely**
Select only the code you want to modify. The AI will replace the entire selection.

### 2. **Be Specific in Instructions**
- ✅ "Convert this to TypeScript with strict types"
- ✅ "Add JSDoc comments and parameter validation"
- ❌ "Make it better" (too vague)
- ❌ "Fix" (unclear what to fix)

### 3. **Use for Focused Changes**
Inline Edit works best for:
- Refactoring a single function
- Adding error handling to a block
- Converting between patterns (callbacks → promises → async/await)
- Adding types or documentation

For large-scale refactoring, use the chat sidebar instead.

### 4. **Review AI Changes**
Always review the streamed replacement. AI may misinterpret complex instructions.

### 5. **Undo is Your Friend**
If the result isn't what you expected, press `Ctrl+Z` to undo and try again with a different instruction.

## Troubleshooting

### "Please select code to edit"
**Cause**: No text is selected in the editor.
**Fix**: Select the code you want to modify before triggering the command.

### AI replaces with incorrect code
**Cause**: Instruction was unclear or AI misunderstood the context.
**Fix**: 
- Press `Ctrl+Z` to undo
- Try a more specific instruction
- Include more context in your selection

### Decoration doesn't clear
**Cause**: Error occurred during processing.
**Fix**: Close and reopen the file, or reload the window (`Ctrl+Shift+P` → `Reload Window`)

### AI request fails
**Cause**: AI proxy is not running or misconfigured.
**Fix**: 
- Verify `zerog.baseUrl` is correct
- Check if the Antigravity AI proxy is running
- Verify `zerog.authToken` matches the proxy configuration

## Comparison with Other Features

| Feature | Use Case | Keybinding | Output Location |
|---------|----------|------------|-----------------|
| **Inline Edit** | Refactor selected code in-place | `Ctrl+Alt+K` | Replaces selection in editor |
| **Apply Button** | Apply code from chat to editor | Click "Apply" | Finds and replaces matching definition |
| **Chat Sidebar** | General AI assistance, Q&A, complex tasks | N/A | Chat panel (can apply later) |

## Future Enhancements

Potential improvements for future versions:
- [ ] Multi-selection support (edit multiple blocks simultaneously)
- [ ] Diff preview before applying (show side-by-side comparison)
- [ ] Keyboard shortcut to accept/reject during streaming
- [ ] History of inline edits with undo/redo
- [ ] Custom context window size (configurable line count)
- [ ] Smart selection expansion (auto-select containing function/class)

## Related Files

- [`src/services/InlineEditController.ts`](src/services/InlineEditController.ts) - Main implementation
- [`src/services/AIService.ts`](src/services/AIService.ts) - AI streaming communication
- [`src/extension.ts`](src/extension.ts) - Command registration
- [`package.json`](package.json) - Command and keybinding configuration
