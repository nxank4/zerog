# Zero-G Extension - Refactored Architecture

## Overview
The Zero-G VS Code extension has been successfully refactored into a modular, Service-Oriented Architecture (SOA). The monolithic `extension.ts` file (1165 lines) has been split into well-organized, maintainable modules.

## New Project Structure

```
src/
├── extension.ts                    # Entry point (26 lines)
├── types/
│   └── index.ts                   # Type definitions & interfaces
├── services/
│   ├── AIService.ts              # AI communication & streaming
│   ├── ContextService.ts         # File context & selection management
│   └── EditorService.ts          # Editor operations (insert, copy)
├── providers/
│   └── SidebarProvider.ts        # Webview provider (orchestrates services)
├── utils/
│   └── htmlGenerator.ts          # HTML/CSS/JS for webview UI
└── test/
    └── extension.test.ts         # Unit tests
```

## Architecture Details

### 1. Types & Interfaces (`src/types/index.ts`)
Defines strict TypeScript interfaces for type safety:
- **IChatMessage**: Chat message structure (`role`, `content`)
- **IContextItem**: File/selection context with metadata
- **IExtensionConfig**: Configuration (baseUrl, model, authToken, systemPrompt)
- **IWebviewMessage**: Messages between extension and webview
- **IContextMetadata**: Context metadata for UI updates

### 2. Services Layer

#### **AIService** (`src/services/AIService.ts`)
Responsibilities:
- AI API communication with Antigravity proxy
- Streaming response handling (SSE format)
- Markdown rendering with syntax highlighting
- Slash command processing (`/fix`, `/explain`, `/refactor`, etc.)

Key Methods:
- `sendMessage(messages, contextItems, onChunk)`: Sends messages with streaming
- `renderMarkdown(content)`: Converts markdown to HTML
- `processSlashCommand(message)`: Processes slash commands

#### **ContextService** (`src/services/ContextService.ts`)
Responsibilities:
- Gathering code context from active editor
- Reading file contents for dropped/attached files
- File search functionality
- Language detection from file extensions

Key Methods:
- `gatherActiveEditorContext()`: Gets selection or cursor context
- `resolveContext(filePaths)`: Reads multiple file contents
- `searchFiles(query)`: Workspace file search

#### **EditorService** (`src/services/EditorService.ts`)
Responsibilities:
- Code insertion at cursor or replacing selection
- Clipboard operations
- File operations
- Editor state queries

Key Methods:
- `insertText(text)`: Insert code into active editor
- `copyToClipboard(text)`: Copy to clipboard
- `getActiveSelection()`: Get selected text
- `openFile(filePath)`: Open file in editor

### 3. Providers Layer

#### **SidebarProvider** (`src/providers/SidebarProvider.ts`)
Acts as the orchestrator that:
- Instantiates all services (AIService, ContextService, EditorService)
- Manages webview lifecycle
- Handles message passing between webview and extension
- Coordinates service calls for complex operations

Example Flow:
```typescript
User sends message → SidebarProvider
  → AIService.processSlashCommand()
  → ContextService.gatherActiveEditorContext()
  → ContextService.resolveContext() (for dropped files)
  → AIService.sendMessage() with streaming
  → Webview updates with rendered markdown
```

### 4. Utilities

#### **htmlGenerator** (`src/utils/htmlGenerator.ts`)
Contains all UI code:
- Complete HTML structure
- CSS styling (VS Code theme variables)
- JavaScript for interactivity:
  - Message rendering
  - Streaming updates
  - File drag-and-drop
  - Slash command hints
  - Code block actions (Copy/Apply)

### 5. Entry Point (`src/extension.ts`)
Clean, minimal entry point:
- Activates extension
- Registers SidebarProvider
- Registers commands
- Only 26 lines (down from 1165)

## Benefits of This Architecture

### 1. **Separation of Concerns**
- Each service has a single, well-defined responsibility
- Easy to locate and modify specific functionality
- Clear boundaries between components

### 2. **Testability**
- Services can be unit tested independently
- Mock services easily for integration tests
- Dependency injection pattern used

### 3. **Maintainability**
- Small, focused files (avg. ~150-200 lines)
- Easy to understand and modify
- Self-documenting code with JSDoc comments

### 4. **Reusability**
- Services can be reused across different providers
- Easy to add new features (e.g., new commands, new providers)
- Context service can support future @mention features

### 5. **Type Safety**
- Strict TypeScript interfaces throughout
- Compile-time error checking
- Better IDE autocomplete and refactoring

### 6. **Scalability**
- Easy to add new services (e.g., HistoryService, SettingsService)
- Provider pattern allows multiple views
- Service layer can grow independently

## Key Design Patterns Used

1. **Service-Oriented Architecture (SOA)**: Core business logic in services
2. **Provider Pattern**: SidebarProvider implements WebviewViewProvider
3. **Dependency Injection**: Services injected into provider
4. **Observer Pattern**: Streaming with callbacks
5. **Strategy Pattern**: Slash commands with different strategies

## Future Enhancements

With this architecture, it's now easy to add:
- **HistoryService**: Persist chat history across sessions
- **SettingsService**: Centralized configuration management
- **TelemetryService**: Usage analytics
- **@mention feature**: Leverage existing ContextService.searchFiles()
- **Multiple AI providers**: Add OpenAIService, GeminiService
- **Code analysis**: Add CodeAnalysisService for linting/diagnostics

## Migration Notes

The refactoring maintains 100% feature parity with the original implementation:
- ✅ AI chat with streaming
- ✅ Markdown rendering with syntax highlighting
- ✅ Context awareness (selection/file)
- ✅ Slash commands (/fix, /explain, etc.)
- ✅ Drag-and-drop file support
- ✅ File attachment with picker
- ✅ Code insertion (Apply button)
- ✅ Copy to clipboard
- ✅ Context chips UI

No functionality was lost, only organization improved.

## Build & Test

```bash
# Compile TypeScript
npm run compile

# Run tests
npm test

# Watch mode
npm run watch
```

All compilation succeeds with zero errors and zero warnings.
