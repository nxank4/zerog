import * as vscode from 'vscode';
import { AIService } from '../core/AIService';
import { ConfigService } from '../core/ConfigService';
import { ContextService } from '../core/ContextService';

/**
 * Ghost Text Provider for Copilot-style inline completions.
 * Implements Fill-In-Middle (FIM) completions with debouncing and cancellation.
 */
export class GhostTextProvider implements vscode.InlineCompletionItemProvider {
  private _aiService: AIService;
  private _debounceTimer: NodeJS.Timeout | null = null;
  private _currentAbortController: AbortController | null = null;

  constructor() {
    const contextService = new ContextService();
    this._aiService = new AIService(contextService);
  }

  /**
   * Provide inline completion items.
   * Called by VS Code when the user types or moves the cursor.
   */
  public async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | null> {
    // Check if autocomplete is enabled
    const enabled = ConfigService.instance().get<boolean>('general.enableAutocomplete', true);
    if (!enabled) {
      return null;
    }

    // Don't provide completions if user manually triggered (Ctrl+Space)
    // or if completion was just selected
    // Don't provide completions when manually triggered (TriggerKind.Invoke = 1)
    // Automatic trigger is TriggerKind.Automatic = 0
    if (context.triggerKind === vscode.InlineCompletionTriggerKind.Invoke) {
      return null;
    }

    // Hardcoded 300ms debounce delay
    const autocompleteDelay = 300;

    // Cancel any pending debounced request
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }

    // Cancel any in-flight API request
    if (this._currentAbortController) {
      this._currentAbortController.abort();
      this._currentAbortController = null;
    }

    // Return a promise that resolves after debounce delay
    return new Promise((resolve) => {
      this._debounceTimer = setTimeout(async () => {
        this._debounceTimer = null;

        // Check if request was cancelled while debouncing
        if (token.isCancellationRequested) {
          resolve(null);
          return;
        }

        try {
          const completion = await this._getCompletion(document, position, token);
          resolve(completion);
        } catch (error) {
          // Silent failure - don't show errors for autocomplete
          console.error('[GhostText] Completion failed:', error);
          resolve(null);
        }
      }, autocompleteDelay);
    });
  }

  /**
   * Get completion from AI service.
   * Implements Fill-In-Middle (FIM) context gathering.
   */
  private async _getCompletion(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | null> {
    // Gather context (50 lines before, 20 lines after)
    const context = this._gatherFIMContext(document, position);

    // Build FIM prompt
    const prompt = this._buildFIMPrompt(
      context.prefix,
      context.suffix,
      document.languageId,
      document.fileName
    );

    // Create abort controller for this request
    this._currentAbortController = new AbortController();
    const abortSignal = this._currentAbortController.signal;

    // Set up cancellation listener
    const cancellationListener = token.onCancellationRequested(() => {
      if (this._currentAbortController) {
        this._currentAbortController.abort();
      }
    });

    try {
      // Call AI service to get completion
      const completion = await this._aiService.getCompletion(prompt, abortSignal);

      // Clean up
      cancellationListener.dispose();
      this._currentAbortController = null;

      // Return null if cancelled or empty
      if (!completion || token.isCancellationRequested) {
        return null;
      }

      // Create inline completion item
      const item = new vscode.InlineCompletionItem(
        completion,
        new vscode.Range(position, position)
      );

      return [item];
    } catch (error: any) {
      // Clean up
      cancellationListener.dispose();
      this._currentAbortController = null;

      // Return null on abort (user typed again)
      if (error.name === 'AbortError' || abortSignal.aborted) {
        return null;
      }

      throw error;
    }
  }

  /**
   * Gather Fill-In-Middle (FIM) context.
   * Returns 50 lines before cursor and 20 lines after cursor.
   */
  private _gatherFIMContext(
    document: vscode.TextDocument,
    position: vscode.Position
  ): { prefix: string; suffix: string } {
    const currentLine = position.line;

    // Calculate range for prefix (50 lines before, up to cursor position)
    const prefixStartLine = Math.max(0, currentLine - 50);
    const prefixRange = new vscode.Range(
      new vscode.Position(prefixStartLine, 0),
      position
    );
    const prefix = document.getText(prefixRange);

    // Calculate range for suffix (20 lines after cursor)
    const suffixEndLine = Math.min(document.lineCount - 1, currentLine + 20);
    const suffixRange = new vscode.Range(
      position,
      new vscode.Position(suffixEndLine, document.lineAt(suffixEndLine).text.length)
    );
    const suffix = document.getText(suffixRange);

    return { prefix, suffix };
  }

  /**
   * Build Fill-In-Middle (FIM) prompt.
   * Instructs AI to complete the code at the cursor position.
   */
  private _buildFIMPrompt(
    prefix: string,
    suffix: string,
    languageId: string,
    fileName: string
  ): string {
    return `You are an expert code completion assistant. Complete the code at the cursor position (<CURSOR>).

**File**: ${fileName}
**Language**: ${languageId}

**Code Before Cursor**:
\`\`\`${languageId}
${prefix}<CURSOR>
\`\`\`

**Code After Cursor**:
\`\`\`${languageId}
${suffix}
\`\`\`

**Instructions**:
1. Analyze the context before and after the cursor
2. Provide ONLY the code completion text (no explanations, no markdown, no code fences)
3. The completion should naturally fit between the prefix and suffix
4. Keep completions concise (1-3 lines for most cases)
5. Match the existing code style, indentation, and naming conventions
6. Do not repeat code that already exists in prefix or suffix

**Completion**:`;
  }

  /**
   * Dispose of resources.
   */
  public dispose(): void {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }

    if (this._currentAbortController) {
      this._currentAbortController.abort();
      this._currentAbortController = null;
    }
  }
}
