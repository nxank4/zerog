import * as vscode from 'vscode';

/**
 * Controller for advanced code editing operations with visual feedback
 */
export class CodeEditorController {
  private _highlightDecorationType: vscode.TextEditorDecorationType;
  private _currentHighlightedRange: vscode.Range | null = null;
  private _currentEditor: vscode.TextEditor | null = null;

  constructor() {
    // Create decoration type for highlighting target regions
    this._highlightDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(255, 255, 0, 0.3)', // Yellow background
      border: '2px dashed rgba(255, 165, 0, 0.8)', // Orange dashed border
      borderRadius: '3px',
      isWholeLine: false,
      overviewRulerColor: 'rgba(255, 165, 0, 0.8)',
      overviewRulerLane: vscode.OverviewRulerLane.Right
    });
  }

  /**
   * Highlight a range in the editor to show where code will be applied
   * @param editor - Target editor
   * @param range - Range to highlight
   */
  public highlightRange(editor: vscode.TextEditor, range: vscode.Range): void {
    this._currentEditor = editor;
    this._currentHighlightedRange = range;
    
    editor.setDecorations(this._highlightDecorationType, [range]);
    
    // Reveal the range in the editor
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  /**
   * Clear any existing highlights
   */
  public clearHighlight(): void {
    if (this._currentEditor) {
      this._currentEditor.setDecorations(this._highlightDecorationType, []);
      this._currentHighlightedRange = null;
      this._currentEditor = null;
    }
  }

  /**
   * Smart replace: Try to find where the code belongs and replace intelligently
   * @param code - Code to insert
   * @returns Promise<boolean> - True if replacement was successful
   */
  public async smartReplace(code: string): Promise<boolean> {
    const editor = vscode.window.activeTextEditor;
    
    if (!editor) {
      vscode.window.showWarningMessage('No active editor found');
      return false;
    }

    const document = editor.document;
    const selection = editor.selection;

    // Strategy 1: If there's a selection, replace it
    if (!selection.isEmpty) {
      await editor.edit(editBuilder => {
        editBuilder.replace(selection, code);
      });
      this.clearHighlight();
      vscode.window.showInformationMessage('Code replaced selection');
      return true;
    }

    // Strategy 2: Try to find matching function/class/method signature
    const targetRange = this._findTargetRange(document, code);
    
    if (targetRange) {
      await editor.edit(editBuilder => {
        editBuilder.replace(targetRange, code);
      });
      this.clearHighlight();
      vscode.window.showInformationMessage('Code replaced matching definition');
      return true;
    }

    // Strategy 3: Insert at cursor position (fallback)
    await editor.edit(editBuilder => {
      editBuilder.insert(selection.active, code);
    });
    this.clearHighlight();
    vscode.window.showInformationMessage('Code inserted at cursor');
    return true;
  }

  /**
   * Preview where code will be applied (returns range for highlighting)
   * @param code - Code to preview
   * @returns Range where code will be applied, or null
   */
  public previewApplication(code: string): vscode.Range | null {
    const editor = vscode.window.activeTextEditor;
    
    if (!editor) {
      return null;
    }

    const document = editor.document;
    const selection = editor.selection;

    // If there's a selection, that's the target
    if (!selection.isEmpty) {
      return new vscode.Range(selection.start, selection.end);
    }

    // Try to find matching definition
    const targetRange = this._findTargetRange(document, code);
    
    if (targetRange) {
      return targetRange;
    }

    // Fallback: Show cursor position (single line)
    const cursorLine = selection.active.line;
    return new vscode.Range(
      new vscode.Position(cursorLine, 0),
      new vscode.Position(cursorLine, document.lineAt(cursorLine).text.length)
    );
  }

  /**
   * Find the target range for code replacement by analyzing the code
   * @param document - Active document
   * @param code - Code to be inserted
   * @returns Range to replace, or null if not found
   */
  private _findTargetRange(document: vscode.TextDocument, code: string): vscode.Range | null {
    const text = document.getText();
    
    // Extract signature patterns from the code
    const patterns = this._extractSignatures(code);
    
    for (const pattern of patterns) {
      const match = this._findSignatureInDocument(text, pattern);
      
      if (match) {
        return match;
      }
    }
    
    return null;
  }

  /**
   * Extract function/class/method signatures from code
   * @param code - Source code
   * @returns Array of signature patterns
   */
  private _extractSignatures(code: string): RegExp[] {
    const signatures: RegExp[] = [];
    
    // Function patterns (JavaScript/TypeScript)
    const functionMatch = code.match(/(?:async\s+)?function\s+(\w+)\s*\([^)]*\)/);
    if (functionMatch) {
      const funcName = functionMatch[1];
      signatures.push(new RegExp(`(?:async\\s+)?function\\s+${funcName}\\s*\\([^)]*\\)`, 'g'));
    }
    
    // Arrow function assigned to const/let/var
    const arrowFuncMatch = code.match(/(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/);
    if (arrowFuncMatch) {
      const funcName = arrowFuncMatch[1];
      signatures.push(new RegExp(`(?:const|let|var)\\s+${funcName}\\s*=\\s*(?:async\\s*)?\\([^)]*\\)\\s*=>`, 'g'));
    }
    
    // Class definition
    const classMatch = code.match(/class\s+(\w+)/);
    if (classMatch) {
      const className = classMatch[1];
      signatures.push(new RegExp(`class\\s+${className}\\s*(?:extends\\s+\\w+)?\\s*\\{`, 'g'));
    }
    
    // Method definition (inside class)
    const methodMatch = code.match(/(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/);
    if (methodMatch && !functionMatch) { // Not already a function
      const methodName = methodMatch[1];
      signatures.push(new RegExp(`(?:async\\s+)?${methodName}\\s*\\([^)]*\\)\\s*\\{`, 'g'));
    }
    
    // Python function
    const pythonFuncMatch = code.match(/def\s+(\w+)\s*\([^)]*\):/);
    if (pythonFuncMatch) {
      const funcName = pythonFuncMatch[1];
      signatures.push(new RegExp(`def\\s+${funcName}\\s*\\([^)]*\\):`, 'g'));
    }
    
    // Python class
    const pythonClassMatch = code.match(/class\s+(\w+)\s*(?:\([^)]*\))?:/);
    if (pythonClassMatch) {
      const className = pythonClassMatch[1];
      signatures.push(new RegExp(`class\\s+${className}\\s*(?:\\([^)]*\\))?:`, 'g'));
    }
    
    return signatures;
  }

  /**
   * Find a signature pattern in the document and return its full range
   * @param documentText - Full document text
   * @param pattern - Signature pattern to find
   * @returns Range of the matched definition, or null
   */
  private _findSignatureInDocument(documentText: string, pattern: RegExp): vscode.Range | null {
    const match = pattern.exec(documentText);
    
    if (!match) {
      return null;
    }
    
    const matchStart = match.index;
    const matchEnd = this._findDefinitionEnd(documentText, matchStart);
    
    if (matchEnd === -1) {
      return null;
    }
    
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return null;
    }
    
    const document = editor.document;
    const startPos = document.positionAt(matchStart);
    const endPos = document.positionAt(matchEnd);
    
    return new vscode.Range(startPos, endPos);
  }

  /**
   * Find the end of a function/class definition using brace matching
   * @param text - Document text
   * @param startIndex - Starting index of the definition
   * @returns End index of the definition
   */
  private _findDefinitionEnd(text: string, startIndex: number): number {
    let braceCount = 0;
    let inDefinition = false;
    
    for (let i = startIndex; i < text.length; i++) {
      const char = text[i];
      
      if (char === '{') {
        braceCount++;
        inDefinition = true;
      } else if (char === '}') {
        braceCount--;
        
        if (inDefinition && braceCount === 0) {
          return i + 1; // Include the closing brace
        }
      }
      
      // Handle Python (indentation-based)
      if (text[i] === ':' && text.slice(startIndex, i).includes('def ') || text.slice(startIndex, i).includes('class ')) {
        // For Python, find the end by indentation
        return this._findPythonDefinitionEnd(text, i);
      }
    }
    
    return -1;
  }

  /**
   * Find the end of a Python function/class by indentation
   * @param text - Document text
   * @param startIndex - Starting index (at the colon)
   * @returns End index of the Python definition
   */
  private _findPythonDefinitionEnd(text: string, startIndex: number): number {
    const lines = text.slice(startIndex).split('\n');
    
    if (lines.length < 2) {
      return text.length;
    }
    
    // Get base indentation from the first line of the function body
    const firstBodyLine = lines[1];
    const baseIndent = firstBodyLine.search(/\S/);
    
    if (baseIndent === -1) {
      return text.length;
    }
    
    let currentIndex = startIndex;
    
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i];
      const lineIndent = line.search(/\S/);
      
      // Empty line or comment
      if (lineIndent === -1 || line.trim().startsWith('#')) {
        currentIndex += line.length + 1;
        continue;
      }
      
      // If indentation is less than or equal to base, we've left the function
      if (lineIndent < baseIndent) {
        return currentIndex;
      }
      
      currentIndex += line.length + 1;
    }
    
    return currentIndex;
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    this.clearHighlight();
    this._highlightDecorationType.dispose();
  }
}
