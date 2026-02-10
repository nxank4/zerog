# Ghost Text Autocomplete (Copilot-Style)

The **Ghost Text Autocomplete** feature provides AI-powered inline code completions as you type, similar to GitHub Copilot. Completions appear as gray "ghost text" that you can accept with `Tab` or `→` (right arrow).

## Features

### 1. **Automatic Suggestions**
- Triggers automatically as you type (after 300ms pause)
- No manual activation required
- Works in all file types and languages

### 2. **Fill-In-Middle (FIM) Context**
- Analyzes 50 lines before your cursor
- Analyzes 20 lines after your cursor
- Provides context-aware suggestions based on surrounding code

### 3. **Smart Debouncing**
- Waits 300ms after you stop typing before requesting completions
- Cancels previous requests when you continue typing
- Prevents API spam and reduces latency

### 4. **Performance Optimized**
- Non-streaming API calls for faster response
- Lower temperature (0.3) for predictable completions
- Shorter max tokens (512) for concise suggestions
- Automatic request cancellation on new keystrokes

### 5. **Configurable**
- Enable/disable via settings: `zerog.enableAutocomplete`
- Uses global Zero-G AI configuration (base URL, model, auth token)

## Usage

### Basic Workflow

1. **Start typing code** in any file
2. **Pause for 300ms** - Ghost text appears automatically
3. **Accept the suggestion**:
   - Press `Tab` to accept
   - Press `→` (right arrow) to accept
   - Keep typing to ignore

### Example Scenarios

#### Completing Function Implementations
```typescript
// You type:
function calculateTotal(items: Item[]) {
  // Cursor here

// AI suggests:
  return items.reduce((sum, item) => sum + item.price, 0);
}
```

#### Adding Error Handling
```python
# You type:
def read_file(path):
    # Cursor here

# AI suggests:
    try:
        with open(path, 'r') as f:
            return f.read()
    except FileNotFoundError:
        return None
```

#### Completing Imports
```javascript
// You type:
import { useState, // Cursor here

// AI suggests:
useEffect, useCallback } from 'react';
```

#### Generating Repetitive Code
```typescript
// You type (after seeing similar test case above):
it('should handle invalid email', // Cursor here

// AI suggests:
() => {
  expect(validateEmail('invalid')).toBe(false);
});
```

## Configuration

### Enable/Disable Autocomplete

Open VS Code Settings (`Ctrl+,` or `Cmd+,`):

```json
{
  "zerog.enableAutocomplete": true  // Set to false to disable
}
```

Or via Settings UI:
1. Open Settings (`Ctrl+,`)
2. Search for "Zero-G"
3. Toggle **Enable Autocomplete** checkbox

### AI Configuration

Ghost text uses the same AI settings as other Zero-G features:

```json
{
  "zerog.baseUrl": "http://localhost:8080",
  "zerog.authToken": "test",
  "zerog.model": "claude-opus-4-6-thinking"
}
```

**Note**: The system prompt is overridden for completions to:
```
"You are a code completion assistant. Provide concise, accurate completions."
```

## Technical Implementation

### Architecture

The feature is implemented in [`GhostTextProvider.ts`](src/providers/GhostTextProvider.ts):

```typescript
export class GhostTextProvider implements vscode.InlineCompletionItemProvider {
  private _debounceTimer: NodeJS.Timeout | null = null;
  private _currentAbortController: AbortController | null = null;
  
  // Main entry point called by VS Code
  public async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | null>
  
  // Get completion from AI with FIM context
  private async _getCompletion(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | null>
  
  // Gather 50 lines before, 20 lines after cursor
  private _gatherFIMContext(
    document: vscode.TextDocument,
    position: vscode.Position
  ): { prefix: string; suffix: string }
  
  // Build Fill-In-Middle prompt
  private _buildFIMPrompt(
    prefix: string,
    suffix: string,
    languageId: string,
    fileName: string
  ): string
}
```

### Debouncing Mechanism

Prevents API spam by waiting 300ms after the user stops typing:

```typescript
// Cancel any pending debounced request
if (this._debounceTimer) {
  clearTimeout(this._debounceTimer);
  this._debounceTimer = null;
}

// Wait 300ms before making API call
this._debounceTimer = setTimeout(async () => {
  const completion = await this._getCompletion(document, position, token);
  resolve(completion);
}, 300);
```

### Request Cancellation

Automatically cancels in-flight requests when the user types again:

```typescript
// Cancel previous request
if (this._currentAbortController) {
  this._currentAbortController.abort();
  this._currentAbortController = null;
}

// Create new abort controller for this request
this._currentAbortController = new AbortController();
const abortSignal = this._currentAbortController.signal;

// Pass signal to axios
await axios.post(url, data, {
  headers: { ... },
  signal: abortSignal
});
```

### Fill-In-Middle (FIM) Context

Gathers comprehensive context around the cursor:

```typescript
private _gatherFIMContext(
  document: vscode.TextDocument,
  position: vscode.Position
): { prefix: string; suffix: string } {
  const currentLine = position.line;

  // 50 lines before cursor
  const prefixStartLine = Math.max(0, currentLine - 50);
  const prefixRange = new vscode.Range(
    new vscode.Position(prefixStartLine, 0),
    position
  );
  const prefix = document.getText(prefixRange);

  // 20 lines after cursor
  const suffixEndLine = Math.min(document.lineCount - 1, currentLine + 20);
  const suffixRange = new vscode.Range(
    position,
    new vscode.Position(suffixEndLine, ...)
  );
  const suffix = document.getText(suffixRange);

  return { prefix, suffix };
}
```

### AI Prompt Structure

```
You are an expert code completion assistant. Complete the code at the cursor position (<CURSOR>).

**File**: example.ts
**Language**: typescript

**Code Before Cursor**:
```typescript
function calculateTotal(items: Item[]) {
  <CURSOR>
```

**Code After Cursor**:
```typescript
}

export { calculateTotal };
```

**Instructions**:
1. Analyze the context before and after the cursor
2. Provide ONLY the code completion text (no explanations, no markdown, no code fences)
3. The completion should naturally fit between the prefix and suffix
4. Keep completions concise (1-3 lines for most cases)
5. Match the existing code style, indentation, and naming conventions
6. Do not repeat code that already exists in prefix or suffix

**Completion**:
```

### AIService Integration

Added new method to [`AIService.ts`](src/services/AIService.ts):

```typescript
public async getCompletion(prompt: string, abortSignal: AbortSignal): Promise<string> {
  const config = this._getConfig();

  const response = await axios.post(
    config.baseUrl + '/v1/messages',
    {
      model: config.model,
      max_tokens: 512,        // Shorter for autocomplete
      system: 'You are a code completion assistant...',
      messages: [{ role: 'user', content: prompt }],
      stream: false,          // Non-streaming for simplicity
      temperature: 0.3        // Lower temp for predictability
    },
    {
      headers: { ... },
      signal: abortSignal     // Cancellation support
    }
  );

  // Extract and clean completion
  const content = response.data?.content?.[0]?.text || '';
  return content.trim();
}
```

## Performance Characteristics

### Latency
- **Debounce delay**: 300ms after typing stops
- **Network latency**: Depends on AI proxy response time
- **Total time**: ~500ms-2s from last keystroke to ghost text appearance

### API Calls
- **Trigger**: Every time user pauses for 300ms
- **Cancelled**: When user resumes typing before completion arrives
- **Frequency**: Typically 2-5 requests per minute during active coding

### Token Usage
- **Max tokens per request**: 512 (vs. 4096 for chat)
- **Context window**: ~70 lines of code (50 before + 20 after)
- **Average prompt size**: 200-500 tokens
- **Average completion size**: 20-100 tokens

## Best Practices

### 1. **Pause Briefly**
Give the AI 300ms to respond. Typing continuously prevents completions from appearing.

### 2. **Review Before Accepting**
Always review ghost text before pressing `Tab`. AI can make mistakes.

### 3. **Use Descriptive Comments**
Comments before the cursor help AI understand your intent:
```typescript
// Calculate the total price with tax and discounts applied
function calculateTotal(// AI suggestion will be better
```

### 4. **Accept Partially**
You don't have to accept the entire suggestion. Accept what's useful, then keep typing.

### 5. **Disable When Not Needed**
For simple edits or refactoring, disable autocomplete to avoid distractions:
```json
{ "zerog.enableAutocomplete": false }
```

## Troubleshooting

### Ghost text doesn't appear
**Possible causes**:
1. Autocomplete is disabled in settings
2. AI proxy is not running or unreachable
3. Not enough context (e.g., empty file)
4. Typing too fast (no 300ms pause)

**Fix**:
- Check `zerog.enableAutocomplete` is `true`
- Verify `zerog.baseUrl` points to running proxy
- Pause typing for 300ms
- Check VS Code console for errors (`Ctrl+Shift+I`)

### Suggestions are irrelevant
**Cause**: Insufficient or misleading context.

**Fix**:
- Add comments describing what you want to do
- Ensure surrounding code provides clear context
- Write more complete function signatures before pausing

### Suggestions are too slow
**Possible causes**:
1. AI model is slow (e.g., large reasoning model)
2. Network latency to AI proxy
3. Proxy is overloaded

**Fix**:
- Use a faster model (e.g., `claude-sonnet-3-5`)
- Reduce `max_tokens` in code (edit `GhostTextProvider.ts`)
- Ensure AI proxy has sufficient resources

### Completions get cut off mid-function
**Cause**: `max_tokens` limit (512) reached.

**Fix**: Edit [`src/providers/GhostTextProvider.ts`](src/providers/GhostTextProvider.ts):
```typescript
max_tokens: 1024, // Increase from 512
```

### Extension freezes or crashes
**Cause**: Unhandled error in completion provider.

**Fix**:
- Check VS Code Developer Tools console (`Help → Toggle Developer Tools`)
- Look for errors in `[GhostText]` logs
- Report issue with error stack trace

## Comparison with Other Features

| Feature | Trigger | Context | Response Time | Output |
|---------|---------|---------|---------------|--------|
| **Ghost Text** | Automatic (300ms pause) | 70 lines (50 before, 20 after) | ~500ms-2s | Inline gray text |
| **Inline Edit** | Manual (`Ctrl+Alt+K`) | Selection + 20 lines | ~2-5s | Replaces selection |
| **Chat Sidebar** | Manual (type in chat) | User-selected files | ~2-10s | Chat panel |
| **Apply Button** | Manual (click Apply) | Full file | Instant (no AI) | Finds & replaces code |

## Advanced Configuration

### Custom Debounce Delay

Edit [`src/providers/GhostTextProvider.ts`](src/providers/GhostTextProvider.ts):

```typescript
private _debounceDelay: number = 500; // Change from 300ms to 500ms
```

### Custom Context Window

Edit the `_gatherFIMContext` method:

```typescript
// 100 lines before, 50 lines after
const prefixStartLine = Math.max(0, currentLine - 100);
const suffixEndLine = Math.min(document.lineCount - 1, currentLine + 50);
```

### Custom Temperature

Edit [`src/services/AIService.ts`](src/services/AIService.ts) in `getCompletion`:

```typescript
temperature: 0.1  // More deterministic (0.0-1.0)
```

### File Type Filtering

Edit [`src/extension.ts`](src/extension.ts) to restrict to specific languages:

```typescript
vscode.languages.registerInlineCompletionItemProvider(
  ['typescript', 'javascript', 'python'], // Only these languages
  ghostTextProvider
)
```

## Privacy & Security

### Data Sent to AI
- **Code**: 50 lines before cursor + 20 lines after
- **File metadata**: File name and language ID
- **User instruction**: None (automatic completions)

### Data NOT Sent
- Other open files (unless explicitly added as context)
- File paths (only file name)
- Environment variables or secrets

### Best Practices
1. **Avoid sensitive data**: Don't put API keys or passwords in code
2. **Review completions**: AI may generate insecure patterns
3. **Use local AI**: Run Antigravity proxy locally to avoid external API calls
4. **Disable in sensitive files**: Toggle `zerog.enableAutocomplete` off when needed

## Future Enhancements

Potential improvements for future versions:
- [ ] Multi-line completions with syntax tree awareness
- [ ] Caching frequent completions to reduce API calls
- [ ] Custom trigger patterns (e.g., only after comments or function signatures)
- [ ] Language-specific FIM templates
- [ ] Smart filtering of low-confidence suggestions
- [ ] Inline documentation/explanation on hover
- [ ] A/B testing different prompts for better quality
- [ ] Metrics dashboard (acceptance rate, latency, token usage)

## Related Files

- [`src/providers/GhostTextProvider.ts`](src/providers/GhostTextProvider.ts) - Main implementation
- [`src/services/AIService.ts`](src/services/AIService.ts) - `getCompletion()` method
- [`src/extension.ts`](src/extension.ts) - Provider registration
- [`package.json`](package.json) - Configuration schema

## See Also

- [Inline Edit Feature](INLINE_EDIT.md) - Manual code editing with AI
- [Apply Button Upgrade](APPLY_BUTTON_UPGRADE.md) - Smart code replacement from chat
- [Terminal Execution](TERMINAL_EXECUTION.md) - Run shell commands from chat
- [Architecture](ARCHITECTURE.md) - Overall extension design
