import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { CodeEditorController } from './CodeEditorController';
import { IFileChange } from '../types';

/**
 * Service responsible for editor operations (insert code, get selections, etc.)
 */
export class EditorService {
  private _codeEditorController: CodeEditorController;

  // Diff review state
  private _diffOriginalUri: vscode.Uri | null = null;
  private _diffTempUri: vscode.Uri | null = null;

  // Multi-file pending changes
  private _pendingChanges: IFileChange[] = [];

  constructor() {
    this._codeEditorController = new CodeEditorController();
  }

  /**
   * Insert text using smart replacement logic
   * @param text - Text to insert
   */
  public async insertText(text: string): Promise<void> {
    await this._codeEditorController.smartReplace(text);
  }

  /**
   * Preview where code will be applied (highlights the target range)
   * @param code - Code to preview
   */
  public previewCodeApplication(code: string): void {
    const range = this._codeEditorController.previewApplication(code);
    const editor = vscode.window.activeTextEditor;
    
    if (range && editor) {
      this._codeEditorController.highlightRange(editor, range);
    }
  }

  /**
   * Clear any code preview highlights
   */
  public clearCodePreview(): void {
    this._codeEditorController.clearHighlight();
  }

  /**
   * Get the currently selected text
   * @returns Selected text or empty string
   */
  public getActiveSelection(): { text: string; range: vscode.Range | null } {
    const editor = vscode.window.activeTextEditor;
    
    if (!editor) {
      return { text: '', range: null };
    }

    const selection = editor.selection;
    const text = editor.document.getText(selection);
    
    return {
      text: text,
      range: selection.isEmpty ? null : new vscode.Range(selection.start, selection.end)
    };
  }

  /**
   * Get the active text editor
   * @returns Active editor or undefined
   */
  public getActiveEditor(): vscode.TextEditor | undefined {
    return vscode.window.activeTextEditor;
  }

  /**
   * Copy text to clipboard
   * @param text - Text to copy
   */
  public async copyToClipboard(text: string): Promise<void> {
    await vscode.env.clipboard.writeText(text);
    vscode.window.showInformationMessage('Copied to clipboard');
  }

  /**
   * Open a file in the editor
   * @param filePath - Path to the file
   */
  public async openFile(filePath: string): Promise<void> {
    try {
      const uri = vscode.Uri.file(filePath);
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to open file: ${error.message}`);
    }
  }

  /**
   * Get the language ID of the active document
   * @returns Language ID or undefined
   */
  public getActiveLanguageId(): string | undefined {
    const editor = vscode.window.activeTextEditor;
    return editor?.document.languageId;
  }

  /**
   * Get the file name of the active document
   * @returns File name or undefined
   */
  public getActiveFileName(): string | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return undefined;
    }
    return editor.document.fileName.split('/').pop();
  }

  /**
   * Open a diff editor for reviewing AI-suggested code before applying.
   * Creates a temp file with the suggestion and opens VS Code's built-in diff view.
   * @param suggestedCode - The AI's suggested code
   * @param isFullFile - If true, treat suggestedCode as complete file content (skip smart matching)
   * @param targetFilePath - Optional explicit file path to diff against (instead of active editor)
   */
  public async openDiffReview(suggestedCode: string, isFullFile: boolean = false, targetFilePath?: string): Promise<void> {
    let originalDoc: vscode.TextDocument;
    let originalUri: vscode.Uri;

    if (targetFilePath) {
      originalUri = vscode.Uri.file(targetFilePath);
      try {
        originalDoc = await vscode.workspace.openTextDocument(originalUri);
      } catch {
        // File doesn't exist yet — use the suggested code as-is for a "new file" diff
        originalDoc = await vscode.workspace.openTextDocument({ content: '', language: '' });
        originalUri = originalDoc.uri;
      }
    } else {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor found');
        return;
      }
      originalDoc = editor.document;
      originalUri = originalDoc.uri;
    }

    // Build the full document content with the suggestion applied
    const fullContent = isFullFile ? suggestedCode : this._buildSuggestedContent(originalDoc, suggestedCode);

    // Create temp file — strip any previous .zerog_suggestion to prevent chaining
    const originalFileName = path.basename(originalDoc.fileName);
    const ext = path.extname(originalFileName);
    const baseName = path.basename(originalFileName, ext)
      .replace(/\.zerog_suggestion$/, '')
      .replace(/\.zerog_review$/, '');
    const tempFileName = `${baseName}.zerog_suggestion${ext}`;
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, tempFileName);
    const tempUri = vscode.Uri.file(tempFilePath);

    // Write the suggested content to the temp file
    await vscode.workspace.fs.writeFile(tempUri, Buffer.from(fullContent, 'utf8'));

    // Store state for accept/discard
    this._diffOriginalUri = originalUri;
    this._diffTempUri = tempUri;

    // Set context so the Accept/Discard buttons appear
    await vscode.commands.executeCommand('setContext', 'zerog.diffReviewActive', true);

    // Open the diff editor: left = original, right = suggestion
    const diffTitle = `${baseName}${ext} ↔ AI Suggestion`;
    await vscode.commands.executeCommand('vscode.diff', originalUri, tempUri, diffTitle);
  }

  /**
   * Accept the diff: copy the suggested content into the original file and clean up.
   */
  public async acceptDiff(): Promise<void> {
    if (!this._diffOriginalUri || !this._diffTempUri) {
      vscode.window.showWarningMessage('No active diff review to accept');
      return;
    }

    try {
      // Read the temp file content (user may have edited it in the diff view)
      const tempContent = await vscode.workspace.fs.readFile(this._diffTempUri);
      const newContent = Buffer.from(tempContent).toString('utf8');

      // Open the original document and replace its entire content
      const originalDoc = await vscode.workspace.openTextDocument(this._diffOriginalUri);
      const editor = await vscode.window.showTextDocument(originalDoc);
      const fullRange = new vscode.Range(
        originalDoc.positionAt(0),
        originalDoc.positionAt(originalDoc.getText().length)
      );
      await editor.edit(editBuilder => {
        editBuilder.replace(fullRange, newContent);
      });

      vscode.window.showInformationMessage('AI suggestion applied');
    } finally {
      await this._cleanupDiff();
    }
  }

  /**
   * Discard the diff: close the diff editor and delete the temp file.
   */
  public async discardDiff(): Promise<void> {
    if (!this._diffOriginalUri || !this._diffTempUri) {
      vscode.window.showWarningMessage('No active diff review to discard');
      return;
    }

    vscode.window.showInformationMessage('AI suggestion discarded');
    await this._cleanupDiff();
  }

  /**
   * Build the full document content with the AI suggestion applied.
   * If there's a selection, replace that range; otherwise replace the whole file.
   */
  private _buildSuggestedContent(document: vscode.TextDocument, suggestedCode: string): string {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) {
      return suggestedCode;
    }

    const selection = editor.selection;
    if (!selection.isEmpty) {
      // Replace only the selected range
      const before = document.getText(new vscode.Range(document.positionAt(0), selection.start));
      const after = document.getText(new vscode.Range(selection.end, document.positionAt(document.getText().length)));
      return before + suggestedCode + after;
    }

    // Try smart matching via the controller's preview
    const targetRange = this._codeEditorController.previewApplication(suggestedCode);
    if (targetRange) {
      const before = document.getText(new vscode.Range(document.positionAt(0), targetRange.start));
      const after = document.getText(new vscode.Range(targetRange.end, document.positionAt(document.getText().length)));
      return before + suggestedCode + after;
    }

    // Fallback: show the suggestion as full file replacement
    return suggestedCode;
  }

  /**
   * Clean up diff state: delete temp file, close diff tab, reset context.
   */
  private async _cleanupDiff(): Promise<void> {
    // Close the diff editor tab
    if (this._diffTempUri) {
      // Close any tabs that show the temp file
      const tabs = vscode.window.tabGroups.all.flatMap(tg => tg.tabs);
      const diffTabs = tabs.filter(tab => {
        if (tab.input instanceof vscode.TabInputTextDiff) {
          return tab.input.modified.toString() === this._diffTempUri!.toString()
            || tab.input.original.toString() === this._diffTempUri!.toString();
        }
        if (tab.input instanceof vscode.TabInputText) {
          return tab.input.uri.toString() === this._diffTempUri!.toString();
        }
        return false;
      });

      for (const tab of diffTabs) {
        await vscode.window.tabGroups.close(tab);
      }

      // Delete the temp file
      try {
        await vscode.workspace.fs.delete(this._diffTempUri);
      } catch {
        // Temp file may already be gone
      }
    }

    // Reset state
    this._diffOriginalUri = null;
    this._diffTempUri = null;

    await vscode.commands.executeCommand('setContext', 'zerog.diffReviewActive', false);
  }

  // ─── Multi-file Review ────────────────────────────────────────────

  /**
   * Get the current pending changes list (for UI)
   */
  public get pendingChanges(): IFileChange[] {
    return this._pendingChanges;
  }

  /**
   * Stage multiple file changes for review.
   * @param changes - Array of file changes to review
   */
  public stageChanges(changes: IFileChange[]): void {
    this._pendingChanges = changes.map(c => ({ ...c, selected: true }));
  }

  /**
   * Open the diff view for a specific pending file change.
   */
  public async openChangeDiff(filePath: string): Promise<void> {
    const change = this._pendingChanges.find(c => c.filePath === filePath);
    if (!change) {
      return;
    }

    const originalUri = vscode.Uri.file(change.filePath);
    const ext = path.extname(change.fileName);
    const baseName = path.basename(change.fileName, ext);
    const tempFileName = `${baseName}.zerog_review${ext}`;
    const tempUri = vscode.Uri.file(path.join(os.tmpdir(), tempFileName));

    await vscode.workspace.fs.writeFile(tempUri, Buffer.from(change.suggestedContent, 'utf8'));

    if (change.action === 'created') {
      // For new files, just show the suggested content
      const doc = await vscode.workspace.openTextDocument(tempUri);
      await vscode.window.showTextDocument(doc);
    } else {
      const diffTitle = `${change.fileName} (Review)`;
      await vscode.commands.executeCommand('vscode.diff', originalUri, tempUri, diffTitle);
    }
  }

  /**
   * Toggle selection of a pending file change.
   */
  public toggleChangeSelection(filePath: string): void {
    const change = this._pendingChanges.find(c => c.filePath === filePath);
    if (change) {
      change.selected = !change.selected;
    }
  }

  /**
   * Apply all selected changes using a single WorkspaceEdit.
   * @returns Number of files changed
   */
  public async acceptSelectedChanges(): Promise<number> {
    const selected = this._pendingChanges.filter(c => c.selected);
    if (selected.length === 0) {
      vscode.window.showWarningMessage('No changes selected');
      return 0;
    }

    const edit = new vscode.WorkspaceEdit();

    for (const change of selected) {
      const uri = vscode.Uri.file(change.filePath);

      if (change.action === 'created') {
        edit.createFile(uri, { overwrite: true });
        edit.insert(uri, new vscode.Position(0, 0), change.suggestedContent);
      } else {
        // Replace entire file content
        try {
          const doc = await vscode.workspace.openTextDocument(uri);
          const fullRange = new vscode.Range(
            doc.positionAt(0),
            doc.positionAt(doc.getText().length)
          );
          edit.replace(uri, fullRange, change.suggestedContent);
        } catch {
          // File might not exist yet, create it
          edit.createFile(uri, { overwrite: true });
          edit.insert(uri, new vscode.Position(0, 0), change.suggestedContent);
        }
      }
    }

    const success = await vscode.workspace.applyEdit(edit);
    if (success) {
      vscode.window.showInformationMessage(`Applied changes to ${selected.length} file(s)`);
    } else {
      vscode.window.showErrorMessage('Failed to apply changes');
    }

    this._cleanupPendingChanges();
    return selected.length;
  }

  /**
   * Accept all pending changes.
   */
  public async acceptAllChanges(): Promise<number> {
    this._pendingChanges.forEach(c => c.selected = true);
    return this.acceptSelectedChanges();
  }

  /**
   * Discard all pending changes.
   */
  public discardAllChanges(): void {
    vscode.window.showInformationMessage('All pending changes discarded');
    this._cleanupPendingChanges();
  }

  /**
   * Clear pending changes state.
   */
  private _cleanupPendingChanges(): void {
    // Clean up any temp files
    for (const change of this._pendingChanges) {
      const ext = path.extname(change.fileName);
      const baseName = path.basename(change.fileName, ext);
      const tempUri = vscode.Uri.file(path.join(os.tmpdir(), `${baseName}.zerog_review${ext}`));
      try {
        vscode.workspace.fs.delete(tempUri);
      } catch {
        // ignore
      }
    }
    this._pendingChanges = [];
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    this._codeEditorController.dispose();
  }
}
