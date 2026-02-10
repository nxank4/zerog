# Enhanced Apply Button - Visual Preview & Smart Replacement

## Overview
The Apply button has been upgraded with visual feedback and intelligent code placement using VS Code's Decoration API.

## New Features

### 1. **Visual Preview on Hover** 🎨
When you hover over the **Apply** button on any code block, the extension will:
- Highlight the target region in the editor where the code will be applied
- Use a **yellow background** with an **orange dashed border** (diff-style highlighting)
- Reveal the target region in the viewport if it's off-screen

**How it works:**
- Hover over Apply → See where code will go
- Move mouse away → Highlight disappears
- Click Apply → Code is inserted/replaced at the highlighted location

### 2. **Smart Replacement Logic** 🧠

The extension now intelligently determines where to place code:

#### Strategy 1: Replace Selection
If you have text selected in the editor, the code replaces your selection.

#### Strategy 2: Find Matching Definition
The extension analyzes the code and tries to find a matching definition in your file:

**Supported Patterns:**
- **JavaScript/TypeScript Functions:**
  ```javascript
  function myFunction() { ... }
  const myFunc = () => { ... }
  ```

- **Class Definitions:**
  ```javascript
  class MyClass { ... }
  ```

- **Methods:**
  ```javascript
  async myMethod() { ... }
  ```

- **Python Functions/Classes:**
  ```python
  def my_function(): ...
  class MyClass: ...
  ```

If a match is found, the **entire definition** is replaced (using brace/indentation matching).

#### Strategy 3: Insert at Cursor (Fallback)
If no match is found, the code is inserted at your cursor position.

### 3. **CodeEditorController Service** 🏗️

A new dedicated service handles all code editing operations:

**Location:** [`src/services/CodeEditorController.ts`](src/services/CodeEditorController.ts:1)

**Key Methods:**
- `highlightRange(editor, range)` - Visual highlight for preview
- `clearHighlight()` - Remove highlight
- `smartReplace(code)` - Intelligent code insertion
- `previewApplication(code)` - Calculate where code will be applied

**Features:**
- Signature extraction (functions, classes, methods)
- Brace matching for JavaScript/TypeScript
- Indentation matching for Python
- Multi-language support

## Architecture Changes

### Updated Files

1. **New: [`CodeEditorController.ts`](src/services/CodeEditorController.ts:1)**
   - Decoration API integration
   - Smart replacement logic
   - Pattern matching algorithms

2. **Updated: [`EditorService.ts`](src/services/EditorService.ts:1)**
   - Now uses CodeEditorController
   - Added `previewCodeApplication(code)` method
   - Added `clearCodePreview()` method

3. **Updated: [`SidebarProvider.ts`](src/providers/SidebarProvider.ts:1)**
   - Added `previewCode` message handler
   - Added `clearPreview` message handler

4. **Updated: [`htmlGenerator.ts`](src/utils/htmlGenerator.ts:1)**
   - Apply button now has `mouseenter` and `mouseleave` events
   - Sends preview/clear messages to extension

## Usage Examples

### Example 1: Replacing a Function

**You have in editor:**
```javascript
function calculateSum(a, b) {
  return a + b;
}
```

**AI suggests:**
```javascript
function calculateSum(a, b) {
  // Enhanced version with validation
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new Error('Invalid input');
  }
  return a + b;
}
```

**What happens:**
1. Hover over Apply → The existing `calculateSum` function is highlighted
2. Click Apply → The old function is replaced with the new one

### Example 2: Adding a New Method

**You have in editor:**
```javascript
class Calculator {
  add(a, b) { return a + b; }
}
```

**AI suggests:**
```javascript
multiply(a, b) { return a * b; }
```

**What happens:**
1. Hover over Apply → Cursor line is highlighted
2. Click Apply → Method is inserted at cursor position

### Example 3: Python Class Replacement

**You have in editor:**
```python
class DataProcessor:
    def process(self, data):
        return data.strip()
```

**AI suggests:**
```python
class DataProcessor:
    def process(self, data):
        # Enhanced with validation
        if not data:
            return ""
        return data.strip().lower()
```

**What happens:**
1. Hover over Apply → Entire `DataProcessor` class is highlighted
2. Click Apply → Class definition is replaced

## Technical Details

### Decoration Type Configuration
```typescript
backgroundColor: 'rgba(255, 255, 0, 0.3)', // Yellow with 30% opacity
border: '2px dashed rgba(255, 165, 0, 0.8)', // Orange dashed border
overviewRulerColor: 'rgba(255, 165, 0, 0.8)', // Orange marker in scrollbar
```

### Pattern Matching
The controller extracts signatures using regex patterns:
- Function declarations: `function name(...)`
- Arrow functions: `const name = (...) =>`
- Classes: `class Name { ... }`
- Methods: `name(...) { ... }`
- Python: `def name(...):` and `class Name:`

### Brace Matching Algorithm
1. Find opening brace `{` after signature
2. Track brace count (increment on `{`, decrement on `}`)
3. When count reaches 0, definition is complete
4. For Python: use indentation-based detection

## Benefits

✅ **Safer** - See exactly where code will be placed before applying
✅ **Smarter** - Automatically finds and replaces matching definitions
✅ **Faster** - No manual selection needed
✅ **Clearer** - Visual feedback reduces errors
✅ **Multi-language** - Works with JavaScript, TypeScript, Python

## Future Enhancements

Potential improvements:
- Support for more languages (Java, C++, Go, Rust)
- Diff view showing changes before applying
- Undo/redo integration
- Confirmation dialog for large replacements
- Support for multiple definitions (show picker)

## Troubleshooting

**Q: Highlight doesn't appear?**
A: Make sure you have an active editor open with the file focused.

**Q: Wrong function highlighted?**
A: The first matching signature is selected. Consider making function names more specific.

**Q: Code inserted at wrong location?**
A: If no match is found, code is inserted at cursor. Position your cursor before hovering.

**Q: Python indentation issues?**
A: The algorithm respects Python's indentation. Ensure your code follows PEP 8.

## Compilation Status

✅ **TypeScript**: No errors
✅ **ESLint**: Passed
✅ **Build**: Successful

All features are production-ready and tested.
