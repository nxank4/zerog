import * as vscode from 'vscode';
import { CodeEditorController } from './CodeEditorController';

/**
 * Service responsible for editor operations (insert code, get selections, etc.)
 */
export class EditorService {
  private _codeEditorController: CodeEditorController;
  
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
   * Dispose of resources
   */
  public dispose(): void {
    this._codeEditorController.dispose();
  }
}
