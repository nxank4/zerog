import * as vscode from 'vscode';
import { AIService } from './AIService';
import { ContextService } from './ContextService';

/**
 * Controller for inline editing functionality (similar to Cursor's Cmd+K)
 */
export class InlineEditController {
  private _aiService: AIService;
  private _processingDecorationType: vscode.TextEditorDecorationType;
  private _currentEdit: {
    editor: vscode.TextEditor;
    range: vscode.Range;
    originalText: string;
  } | null = null;

  constructor() {
    const contextService = new ContextService();
    this._aiService = new AIService(contextService);
    
    // Create decoration type for selection being processed
    this._processingDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(100, 100, 100, 0.2)',
      opacity: '0.5',
      border: '1px dashed rgba(100, 149, 237, 0.5)',
    });
  }

  /**
   * Trigger inline edit on the current selection
   */
  public async triggerInlineEdit(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    
    if (!editor) {
      vscode.window.showWarningMessage('No active editor');
      return;
    }

    const selection = editor.selection;
    
    if (selection.isEmpty) {
      vscode.window.showWarningMessage('Please select code to edit');
      return;
    }

    // Get user's edit instruction
    const instruction = await vscode.window.showInputBox({
      prompt: 'Edit selection...',
      placeHolder: 'Describe how you want to modify the selected code',
      ignoreFocusOut: true
    });

    if (!instruction) {
      return; // User cancelled
    }

    // Apply processing decoration
    editor.setDecorations(this._processingDecorationType, [selection]);

    try {
      await this._performInlineEdit(editor, selection, instruction);
    } finally {
      // Clear decoration
      editor.setDecorations(this._processingDecorationType, []);
    }
  }

  /**
   * Perform the inline edit with AI
   */
  private async _performInlineEdit(
    editor: vscode.TextEditor,
    selection: vscode.Selection,
    instruction: string
  ): Promise<void> {
    const document = editor.document;
    const selectedText = document.getText(selection);
    
    // Gather surrounding context (10 lines up and down)
    const context = this._gatherContext(document, selection);
    
    // Store current edit info
    this._currentEdit = {
      editor: editor,
      range: new vscode.Range(selection.start, selection.end),
      originalText: selectedText
    };

    // Build prompt
    const prompt = this._buildPrompt(instruction, selectedText, context);

    // Show progress
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Zero-G: Editing code...',
      cancellable: true
    }, async (progress, token) => {
      let accumulatedText = '';
      let isFirstChunk = true;

      try {
        // Call AI service with streaming
        const result = await this._aiService.sendMessage(
          [{ role: 'user', content: prompt }],
          [],
          (chunk: string) => {
            if (token.isCancellationRequested) {
              return;
            }

            accumulatedText += chunk;
            
            // Update progress
            if (isFirstChunk) {
              progress.report({ message: 'Receiving changes...' });
              isFirstChunk = false;
            }

            // Stream the replacement in real-time
            this._updateSelection(accumulatedText);
          }
        );

        // Final update with complete result
        await this._updateSelection(result);
        
        vscode.window.showInformationMessage('Code edited successfully');
      } catch (error: any) {
        // Restore original text on error
        if (this._currentEdit) {
          await editor.edit(editBuilder => {
            editBuilder.replace(this._currentEdit!.range, this._currentEdit!.originalText);
          });
        }
        
        vscode.window.showErrorMessage(`Inline edit failed: ${error.message}`);
      } finally {
        this._currentEdit = null;
      }
    });
  }

  /**
   * Gather surrounding context from the document
   */
  private _gatherContext(document: vscode.TextDocument, selection: vscode.Selection): {
    before: string;
    after: string;
  } {
    const startLine = Math.max(0, selection.start.line - 10);
    const endLine = Math.min(document.lineCount - 1, selection.end.line + 10);

    // Lines before selection
    const beforeRange = new vscode.Range(
      new vscode.Position(startLine, 0),
      selection.start
    );
    const before = document.getText(beforeRange);

    // Lines after selection
    const afterRange = new vscode.Range(
      selection.end,
      new vscode.Position(endLine, document.lineAt(endLine).text.length)
    );
    const after = document.getText(afterRange);

    return { before, after };
  }

  /**
   * Build the prompt for the AI
   */
  private _buildPrompt(instruction: string, selectedText: string, context: {
    before: string;
    after: string;
  }): string {
    return `You are an expert code editor. The user has selected some code and wants to modify it.

INSTRUCTION: ${instruction}

CONTEXT BEFORE:
\`\`\`
${context.before}
\`\`\`

SELECTED CODE TO EDIT:
\`\`\`
${selectedText}
\`\`\`

CONTEXT AFTER:
\`\`\`
${context.after}
\`\`\`

IMPORTANT: Return ONLY the modified version of the SELECTED CODE. Do not include the context before or after. Do not add explanations or markdown code fences. Just return the raw replacement code.`;
  }

  /**
   * Update the selection with new text in real-time
   */
  private async _updateSelection(newText: string): Promise<void> {
    if (!this._currentEdit) {
      return;
    }

    const { editor, range } = this._currentEdit;

    // Clean the text (remove markdown code fences if AI added them)
    const cleanedText = this._cleanAIResponse(newText);

    await editor.edit(editBuilder => {
      editBuilder.replace(range, cleanedText);
    }, {
      undoStopBefore: false,
      undoStopAfter: false
    });
  }

  /**
   * Clean AI response by removing markdown code fences
   */
  private _cleanAIResponse(text: string): string {
    // Remove markdown code fences
    let cleaned = text.trim();
    
    // Remove opening fence
    cleaned = cleaned.replace(/^```[\w]*\n?/, '');
    
    // Remove closing fence
    cleaned = cleaned.replace(/\n?```$/, '');
    
    return cleaned;
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    this._processingDecorationType.dispose();
  }
}
