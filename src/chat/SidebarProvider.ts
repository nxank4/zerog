import * as vscode from 'vscode';
import * as path from 'path';
import { AIService } from '../core/AIService';
import { ContextService } from '../core/ContextService';
import { EditorService } from '../editor/EditorService';
import { TerminalService } from '../terminal/TerminalService';
import { AgentLoop } from './AgentLoop';
import { SessionService } from '../core/SessionService';
import { getWebviewContent } from './htmlGenerator';
import { IChatMessage, IContextItem, IImageData, IWebviewMessage, IParsedContent, IPlanTask, ZeroGMode } from '../types';

import { PromptFactory } from '../core/PromptFactory';

/**
 * Provider for the Zero-G sidebar webview
 */
export class SidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _messages: IChatMessage[] = [];
  private _droppedFiles: Map<string, string> = new Map();
  private _currentMode: ZeroGMode = 'ask';
  private _currentPlan: IPlanTask[] = [];
  private _context: vscode.ExtensionContext;

  // Session management
  private _sessionService: SessionService;
  private _currentSessionId: string;
  private _sessionAutoNamed: boolean = false;
  public onSessionChanged?: () => void;

  // Streaming abort support
  private _currentAbortController: AbortController | null = null;

  // Services
  private _aiService: AIService;
  private _contextService: ContextService;
  private _editorService: EditorService;
  private _terminalService: TerminalService;
  private _agentLoop: AgentLoop;

  constructor(private readonly _extensionUri: vscode.Uri, context: vscode.ExtensionContext, sessionService: SessionService) {
    this._context = context;
    this._sessionService = sessionService;
    this._currentSessionId = sessionService.generateSessionId();
    this._contextService = new ContextService();
    this._aiService = new AIService(this._contextService);
    this._editorService = new EditorService();
    this._terminalService = new TerminalService();
    this._agentLoop = new AgentLoop(
      this._aiService,
      this._contextService,
      this._editorService,
      (event) => this._handleAgentEvent(event)
    );

    // Restore persisted plan
    const savedPlan = this._context.workspaceState.get<IPlanTask[]>('zerog.plan');
    if (savedPlan && savedPlan.length > 0) {
      this._currentPlan = savedPlan;
    }
  }

  /**
   * Get the editor service (used for registering diff commands externally)
   */
  public get editorService(): EditorService {
    return this._editorService;
  }

  /**
   * Get the agent loop (used for notifying review acceptance)
   */
  public get agentLoop(): AgentLoop {
    return this._agentLoop;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = getWebviewContent(webviewView.webview);

    // Initialize project map for AI context
    this._aiService.initializeProjectMap().catch(err => {
      console.error('[SidebarProvider] Failed to initialize project map:', err);
    });

    webviewView.webview.onDidReceiveMessage(async (data: IWebviewMessage) => {
      switch (data.type) {
        case 'sendMessage':
          await this._handleSendMessage(data.value, data.images);
          break;
        case 'applyCode':
          await this._handleApplyCode(data.value);
          break;
        case 'applyFileChange':
          await this._editorService.openDiffReview(data.value, true, data.filePath);
          break;
        case 'copyCode':
          await this._handleCopyCode(data.value);
          break;
        case 'clearContext':
          this._handleClearContext();
          break;
        case 'requestContext':
          this._sendContextInfo();
          break;
        case 'fileDropped':
          await this._handleFileDropped(data.filePath!);
          break;
        case 'removeFile':
          this._handleRemoveFile(data.filePath!);
          break;
        case 'selectFile':
          await this._handleSelectFile();
          break;
        case 'previewCode':
          this._handlePreviewCode(data.code!);
          break;
        case 'clearPreview':
          this._handleClearPreview();
          break;
        case 'runTerminalCommand':
          await this._handleRunTerminalCommand(data.value!);
          break;
        case 'runCommand':
          await this._handleRunTerminalCommand(data.value!);
          break;
        case 'setMode':
          this._currentMode = data.mode || 'ask';
          // Send saved plan to webview when switching to planner/agent
          if ((this._currentMode === 'planner' || this._currentMode === 'agent') && this._currentPlan.length > 0) {
            this._view?.webview.postMessage({ type: 'updatePlan', plan: this._currentPlan });
          }
          break;
        case 'updatePlanTask':
          this._handleUpdatePlanTask(data.value.id, data.value.status);
          break;
        case 'startAgent':
          this._startAgentLoop();
          break;
        case 'stopAgent':
          this._agentLoop.stop();
          break;
        case 'openChangeDiff':
          await this._editorService.openChangeDiff(data.filePath!);
          break;
        case 'toggleChangeSelection':
          this._editorService.toggleChangeSelection(data.filePath!);
          this._sendChangesToWebview();
          break;
        case 'acceptAllChanges':
          await this._editorService.acceptAllChanges();
          this._sendChangesToWebview();
          break;
        case 'applySelectedChanges':
          await this._editorService.acceptSelectedChanges();
          this._sendChangesToWebview();
          break;
        case 'discardAllChanges':
          this._editorService.discardAllChanges();
          this._sendChangesToWebview();
          break;
        case 'undoLastTurn':
          this._handleUndoLastTurn();
          break;
        case 'editLastMessage':
          this._handleEditLastMessage(data.value);
          break;
        case 'rejectFileChange':
          await this._handleRejectFileChange(data.filePath!, data.fileName!);
          break;
        case 'newChat':
          this.startNewSession();
          break;
        case 'stopStream':
          this._handleStopStream();
          break;
        case 'openSettings': {
          const config = vscode.workspace.getConfiguration('zerog');
          this._view?.webview.postMessage({
            type: 'loadSettings',
            settings: {
              baseUrl: config.get<string>('baseUrl', 'http://localhost:8080'),
              authToken: config.get<string>('authToken', 'test'),
              model: config.get<string>('model', 'claude-opus-4-6-thinking'),
              systemPrompt: config.get<string>('systemPrompt', 'You are a helpful coding assistant.'),
              maxTokens: config.get<number>('maxTokens', 4096),
              enableAutocomplete: config.get<boolean>('enableAutocomplete', true),
              autocompleteDelay: config.get<number>('autocompleteDelay', 300),
              version: '0.0.1'
            }
          });
          break;
        }
        case 'saveSettings': {
          const { key, value } = data.value;
          const settingsConfig = vscode.workspace.getConfiguration('zerog');
          await settingsConfig.update(key, value, vscode.ConfigurationTarget.Global);
          break;
        }
        case 'openAdvancedSettings':
          vscode.commands.executeCommand('workbench.action.openSettings', 'zerog');
          break;
        case 'toggleHistory':
          vscode.commands.executeCommand('zerog.historyView.focus');
          break;
        case 'updateSessionTitle':
          if (data.value) {
            this._sessionService.renameSession(this._currentSessionId, data.value);
            this._sessionAutoNamed = true;
            this.onSessionChanged?.();
          }
          break;
      }
    });

    // Send initial context
    this._sendContextInfo();

    // Restore persisted plan to webview
    if (this._currentPlan.length > 0) {
      webviewView.webview.postMessage({ type: 'updatePlan', plan: this._currentPlan });
    }
  }

  /**
   * Send current context information to webview
   */
  private _sendContextInfo() {
    const { metadata } = this._contextService.gatherActiveEditorContext();

    // Strip temp file suffixes from display name
    let displayName = metadata.fileName;
    if (displayName) {
      displayName = displayName.replace(/\.zerog_suggestion|\.zerog_review/g, '');
    }

    this._view?.webview.postMessage({
      type: 'updateContext',
      fileName: displayName,
      languageId: metadata.languageId
    });
  }

  /**
   * Handle clear context command
   */
  private _handleClearContext() {
    this._messages = [];
    this._droppedFiles.clear();
    this._view?.webview.postMessage({ type: 'contextCleared' });
  }

  /**
   * Handle file dropped event
   */
  private async _handleFileDropped(filePath: string) {
    try {
      // Normalize file path to VS Code URI
      let uri: vscode.Uri;
      if (filePath.startsWith('file://')) {
        uri = vscode.Uri.parse(filePath);
      } else if (filePath.startsWith('vscode-resource://')) {
        uri = vscode.Uri.parse(filePath.replace('vscode-resource://', 'file://'));
      } else {
        uri = vscode.Uri.file(filePath);
      }

      const fileData = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(fileData).toString('utf8');
      const normalizedPath = uri.fsPath;
      const fileName = uri.path.split('/').pop() || 'unknown';
      
      this._droppedFiles.set(normalizedPath, content);
      
      this._view?.webview.postMessage({
        type: 'fileAdded',
        filePath: normalizedPath,
        fileName: fileName
      });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to read file: ${error.message}`);
    }
  }

  /**
   * Handle remove file event
   */
  private _handleRemoveFile(filePath: string) {
    this._droppedFiles.delete(filePath);
    this._view?.webview.postMessage({
      type: 'fileRemoved',
      filePath: filePath
    });
  }

  /**
   * Handle select file button click
   */
  private async _handleSelectFile() {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: true,
      openLabel: 'Select Files',
      filters: {
        'All Files': ['*']
      }
    });

    if (uris && uris.length > 0) {
      for (const uri of uris) {
        try {
          const fileData = await vscode.workspace.fs.readFile(uri);
          const content = Buffer.from(fileData).toString('utf8');
          const normalizedPath = uri.fsPath;
          const fileName = uri.path.split('/').pop() || 'unknown';
          
          this._droppedFiles.set(normalizedPath, content);
          
          this._view?.webview.postMessage({
            type: 'fileAdded',
            filePath: normalizedPath,
            fileName: fileName
          });
        } catch (error: any) {
          vscode.window.showErrorMessage(`Failed to read file: ${error.message}`);
        }
      }
    }
  }

  /**
   * Handle stop stream: abort the current AI request
   */
  private _handleStopStream() {
    if (this._currentAbortController) {
      this._currentAbortController.abort();
      this._currentAbortController = null;
    }
  }

  /**
   * Handle send message event
   */
  private async _handleSendMessage(userMessage: string, images?: IImageData[]) {
    if (!userMessage.trim() && (!images || images.length === 0)) {
      return;
    }

    // Process slash commands
    const { processedMessage, displayMessage } = this._aiService.processSlashCommand(userMessage);

    // Gather context items
    const contextItems: IContextItem[] = [];
    
    // Add active editor context
    const { contextItem } = this._contextService.gatherActiveEditorContext();
    if (contextItem) {
      contextItems.push(contextItem);
    }

    // Add dropped files context
    if (this._droppedFiles.size > 0) {
      const droppedFilePaths = Array.from(this._droppedFiles.keys());
      const droppedFileItems = await this._contextService.resolveContext(droppedFilePaths);
      contextItems.push(...droppedFileItems);
    }

    // Add user message to history (multimodal if images are present)
    if (images && images.length > 0) {
      const contentBlocks: any[] = [];
      if (processedMessage) {
        contentBlocks.push({ type: 'text', text: processedMessage });
      }
      for (const img of images) {
        contentBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.media_type,
            data: img.base64
          }
        });
      }
      this._messages.push({ role: 'user', content: contentBlocks });
    } else {
      this._messages.push({ role: 'user', content: processedMessage });
    }

    // Update UI with user message (show display message for commands)
    this._view?.webview.postMessage({
      type: 'addMessage',
      role: 'user',
      content: displayMessage,
      html: false
    });

    // Initialize streaming message
    this._view?.webview.postMessage({
      type: 'startStream',
      role: 'assistant',
      mode: this._currentMode
    });

    try {
      // Create abort controller for this request
      this._currentAbortController = new AbortController();

      // Send message to AI with streaming
      const assistantMessage = await this._aiService.sendMessage(
        this._messages,
        contextItems,
        (chunk: string) => {
          // Send streaming chunks to webview
          this._view?.webview.postMessage({
            type: 'streamChunk',
            content: chunk
          });
        },
        this._currentMode,
        this._currentAbortController.signal
      );

      this._currentAbortController = null;

      // Add assistant message to history
      this._messages.push({ role: 'assistant', content: assistantMessage });

      // Enforce 25-turn limit (50 messages max for 25 user+assistant pairs)
      if (this._messages.length > 50) {
        this._messages = this._messages.slice(-50);
      }

      // Parse plan from planner mode responses
      if (this._currentMode === 'planner' || this._currentMode === 'agent') {
        const planTasks = PromptFactory.parsePlan(assistantMessage);
        if (planTasks) {
          this._currentPlan = planTasks.map(t => ({
            id: t.id,
            task: t.task,
            status: (t.status || 'pending') as IPlanTask['status']
          }));
          this._persistPlan();
          this._view?.webview.postMessage({ type: 'updatePlan', plan: this._currentPlan });
        }
      }

      // Auto-execute file operations in Agent mode
      if (this._currentMode === 'agent') {
        await this._executeFileOperations(assistantMessage);
      }

      // Parse tool calls and render text segments as HTML
      const parsedContent = this._aiService.parseToolCalls(assistantMessage);
      
      // Render text segments as markdown HTML
      parsedContent.segments.forEach(segment => {
        if (segment.type === 'text') {
          segment.content = this._aiService.renderMarkdown(segment.content);
        }
      });
      
      this._view?.webview.postMessage({
        type: 'streamDone',
        parsedContent: parsedContent
      });

      // Save session and auto-name if first message
      this._sessionService.saveSession(this._currentSessionId, this._messages, this._currentMode);
      if (!this._sessionAutoNamed && this._messages.length >= 2) {
        this._autoNameSession(this._messages[0]);
      }
    } catch (error: any) {
      this._currentAbortController = null;

      // Handle abort gracefully — finalize whatever was streamed
      if (error.name === 'AbortError' || error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
        this._view?.webview.postMessage({
          type: 'streamDone',
          parsedContent: { segments: [{ type: 'text', content: '' }] }
        });
        return;
      }

      const errorMessage = `Error: ${error.message}`;

      this._view?.webview.postMessage({
        type: 'streamError',
        content: errorMessage
      });

      vscode.window.showErrorMessage(errorMessage);
    }
  }

  /**
   * Handle apply code event — opens diff review instead of direct replacement
   */
  private async _handleApplyCode(code: string) {
    const cleaned = PromptFactory.stripFilePathComment(code);
    await this._editorService.openDiffReview(cleaned);
  }

  /**
   * Handle copy code event
   */
  private async _handleCopyCode(code: string) {
    await this._editorService.copyToClipboard(code);
  }

  /**
   * Handle code preview event (on hover over Apply button)
   */
  private _handlePreviewCode(code: string) {
    this._editorService.previewCodeApplication(code);
  }

  /**
   * Handle clear preview event (on mouse leave from Apply button)
   */
  private _handleClearPreview() {
    this._editorService.clearCodePreview();
  }

  /**
   * Handle run terminal command event
   */
  private async _handleRunTerminalCommand(command: string) {
    await this._terminalService.executeCommand(command);
  }

  /**
   * Start the agent loop to execute pending plan tasks
   */
  private async _startAgentLoop() {
    if (this._currentPlan.length === 0) {
      vscode.window.showWarningMessage('No plan to execute. Switch to Planner mode first.');
      return;
    }
    if (this._agentLoop.isRunning) {
      vscode.window.showWarningMessage('Agent is already running.');
      return;
    }

    await this._agentLoop.run(
      this._currentPlan,
      (plan) => this.updatePlan(plan),
      async () => {
        const contextItems: IContextItem[] = [];
        const { contextItem } = this._contextService.gatherActiveEditorContext();
        if (contextItem) {
          contextItems.push(contextItem);
        }
        if (this._droppedFiles.size > 0) {
          const droppedFilePaths = Array.from(this._droppedFiles.keys());
          const droppedFileItems = await this._contextService.resolveContext(droppedFilePaths);
          contextItems.push(...droppedFileItems);
        }
        return contextItems;
      }
    );
  }

  /**
   * Handle events from the agent loop
   */
  private async _handleAgentEvent(event: import('./AgentLoop').AgentEvent) {
    switch (event.type) {
      case 'taskStarted':
        this._view?.webview.postMessage({
          type: 'addMessage',
          role: 'assistant',
          content: `Agent: Starting task #${event.task.id} — ${event.task.task}`,
          html: false
        });
        this._view?.webview.postMessage({
          type: 'startStream',
          role: 'assistant',
          mode: 'agent'
        });
        break;
      case 'streamChunk':
        this._view?.webview.postMessage({ type: 'streamChunk', content: event.content });
        break;
      case 'streamDone':
        const parsedContent = this._aiService.parseToolCalls(event.content);
        parsedContent.segments.forEach(segment => {
          if (segment.type === 'text') {
            segment.content = this._aiService.renderMarkdown(segment.content);
          }
        });
        this._view?.webview.postMessage({ type: 'streamDone', parsedContent });
        // Execute file operations from agent tool calls
        await this._executeFileOperations(event.content);
        break;
      case 'waitingForReview':
        this._view?.webview.postMessage({
          type: 'addMessage',
          role: 'assistant',
          content: `Waiting for review of task #${event.task.id}. Accept or discard the diff to continue.`,
          html: false
        });
        break;
      case 'taskCompleted':
        this._view?.webview.postMessage({
          type: 'addMessage',
          role: 'assistant',
          content: `Task #${event.task.id} completed.`,
          html: false
        });
        break;
      case 'taskFailed':
        this._view?.webview.postMessage({
          type: 'addMessage',
          role: 'assistant',
          content: `Task #${event.task.id} failed: ${event.error}`,
          html: false
        });
        break;
      case 'loopFinished':
        this._view?.webview.postMessage({
          type: 'addMessage',
          role: 'assistant',
          content: 'All plan tasks completed.',
          html: false
        });
        break;
    }
  }

  /**
   * Parse and execute file operations from an Agent mode AI response.
   * Stages write_file calls as pending changes for user review.
   */
  private async _executeFileOperations(response: string) {
    const fileOps = PromptFactory.parseFileOperations(response);
    if (fileOps.length === 0) {
      return;
    }

    // Resolve paths relative to the workspace root
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

    const changes: import('../types').IFileChange[] = [];

    for (const op of fileOps) {
      const absolutePath = path.isAbsolute(op.filePath)
        ? op.filePath
        : path.join(workspaceRoot, op.filePath);
      const fileName = path.basename(absolutePath);

      // Try to read original content (file may not exist yet)
      let originalContent = '';
      let action: 'modified' | 'created' = 'created';
      try {
        const uri = vscode.Uri.file(absolutePath);
        const data = await vscode.workspace.fs.readFile(uri);
        originalContent = Buffer.from(data).toString('utf8');
        action = 'modified';
      } catch {
        // File doesn't exist — it's a new file
      }

      changes.push({
        filePath: absolutePath,
        fileName,
        action,
        originalContent,
        suggestedContent: op.content,
        selected: true
      });
    }

    if (changes.length === 1) {
      // Single file — open diff review directly (full file replacement)
      await this._editorService.openDiffReview(changes[0].suggestedContent, true, changes[0].filePath);
    } else {
      // Multiple files — stage for multi-file review
      this.stageFileChanges(changes);
    }
  }

  /**
   * Handle plan task status update from webview
   */
  private _handleUpdatePlanTask(taskId: number, status: string) {
    const task = this._currentPlan.find(t => t.id === taskId);
    if (task) {
      task.status = status as IPlanTask['status'];
      this._persistPlan();
      this._view?.webview.postMessage({ type: 'updatePlan', plan: this._currentPlan });
    }
  }

  /**
   * Persist the current plan to workspaceState
   */
  private _persistPlan() {
    this._context.workspaceState.update('zerog.plan', this._currentPlan);
  }

  /**
   * Get the current plan (used by AgentLoop)
   */
  public get currentPlan(): IPlanTask[] {
    return this._currentPlan;
  }

  /**
   * Update the plan externally (used by AgentLoop)
   */
  public updatePlan(plan: IPlanTask[]) {
    this._currentPlan = plan;
    this._persistPlan();
    this._view?.webview.postMessage({ type: 'updatePlan', plan: this._currentPlan });
  }

  /**
   * Send current pending changes list to the webview
   */
  private _sendChangesToWebview() {
    const changes = this._editorService.pendingChanges.map(c => ({
      filePath: c.filePath,
      fileName: c.fileName,
      action: c.action,
      selected: c.selected
    }));
    this._view?.webview.postMessage({ type: 'updateChanges', changes });
  }

  /**
   * Stage file changes for multi-file review (public, used by AgentLoop)
   */
  public stageFileChanges(changes: import('../types').IFileChange[]) {
    this._editorService.stageChanges(changes);
    this._sendChangesToWebview();
  }

  /**
   * Handle undo last turn: pop last user + assistant messages
   */
  private _handleUndoLastTurn() {
    if (this._messages.length < 2) {
      return;
    }
    // Pop last assistant message, then last user message
    this._messages.pop();
    this._messages.pop();
    // Enforce 25-turn limit (50 messages max)
    if (this._messages.length > 50) {
      this._messages = this._messages.slice(-50);
    }
    this._view?.webview.postMessage({ type: 'undoComplete' });
  }

  /**
   * Handle edit last message: pop last AI response + user message, send original text back
   */
  private _handleEditLastMessage(originalText: string) {
    if (this._messages.length >= 2) {
      this._messages.pop(); // Remove assistant response
      this._messages.pop(); // Remove user message
    } else if (this._messages.length === 1) {
      this._messages.pop();
    }
    this._view?.webview.postMessage({ type: 'editComplete', value: originalText });
  }

  /**
   * Handle reject file change: cleanup and add rejection to history
   */
  private async _handleRejectFileChange(filePath: string, fileName: string) {
    // Close any open diff tab and clean up temp files
    await this._editorService.discardDiff();

    // Add rejection message to AI history
    const rejectionMsg = `User rejected the changes to ${fileName || filePath}.`;
    this._messages.push({ role: 'user', content: rejectionMsg });

    // Show rejection in chat
    this._view?.webview.postMessage({
      type: 'addMessage',
      role: 'user',
      content: rejectionMsg,
      html: false
    });

    // In agent mode, auto-prompt the AI for feedback
    if (this._currentMode === 'agent') {
      const followUp = `Why was ${fileName || filePath} rejected? What should I change?`;
      await this._handleSendMessage(followUp);
    }
  }

  // ─── Session Management ──────────────────────────────────────────

  /**
   * Start a new chat session. Saves current session first.
   */
  public startNewSession() {
    // Save current session before switching
    if (this._messages.length > 0) {
      this._sessionService.saveSession(this._currentSessionId, this._messages, this._currentMode);
    }

    // Reset state
    this._currentSessionId = this._sessionService.generateSessionId();
    this._messages = [];
    this._currentMode = 'ask';
    this._currentPlan = [];
    this._sessionAutoNamed = false;
    this._droppedFiles.clear();
    this._persistPlan();

    // Clear webview
    this._view?.webview.postMessage({ type: 'clearChat' });
    this.onSessionChanged?.();
  }

  /**
   * Switch to an existing session by loading its data.
   */
  public async switchToSession(sessionId: string) {
    // Save current session first
    if (this._messages.length > 0) {
      await this._sessionService.saveSessionImmediate(this._currentSessionId, this._messages, this._currentMode);
    }

    // Load the target session
    const sessionData = await this._sessionService.loadSession(sessionId);
    if (!sessionData) {
      vscode.window.showErrorMessage('Failed to load session');
      return;
    }

    // Update state
    this._currentSessionId = sessionId;
    this._messages = sessionData.messages;
    this._currentMode = sessionData.mode;
    this._sessionAutoNamed = true; // Already has a name
    this._currentPlan = [];
    this._droppedFiles.clear();

    // Clear and re-render webview
    this._view?.webview.postMessage({ type: 'clearChat' });

    // Send session title to webview
    const meta = (await this._sessionService.listSessions()).find(s => s.id === sessionId);
    if (meta) {
      this._view?.webview.postMessage({ type: 'updateSessionTitle', value: meta.name });
    }

    // Replay messages into webview
    for (const msg of this._messages) {
      const content = typeof msg.content === 'string'
        ? msg.content
        : msg.content.map(b => b.text || '[image]').join(' ');
      const isHtml = msg.role === 'assistant';
      this._view?.webview.postMessage({
        type: 'addMessage',
        role: msg.role,
        content: isHtml ? this._aiService.renderMarkdown(content) : content,
        html: isHtml
      });
    }

    this.onSessionChanged?.();
  }

  /**
   * Handle session deletion - if current session was deleted, start new.
   */
  public onSessionDeleted(sessionId: string) {
    if (this._currentSessionId === sessionId) {
      this.startNewSession();
    }
  }

  /**
   * Auto-name the session based on the first user message.
   */
  private async _autoNameSession(firstMessage: IChatMessage) {
    this._sessionAutoNamed = true;
    const text = typeof firstMessage.content === 'string'
      ? firstMessage.content
      : firstMessage.content.map(b => b.text || '').join(' ');

    if (!text.trim()) { return; }

    try {
      const abortController = new AbortController();
      const prompt = `Summarize the following user message in 3-5 words as a chat session title. Return ONLY the title, nothing else.\n\nMessage: "${text.substring(0, 200)}"`;
      const title = await this._aiService.getCompletion(prompt, abortController.signal);
      const cleanTitle = title.trim().replace(/^["']|["']$/g, '').substring(0, 50);
      if (cleanTitle) {
        await this._sessionService.renameSession(this._currentSessionId, cleanTitle);
        this._view?.webview.postMessage({ type: 'updateSessionTitle', value: cleanTitle });
        this.onSessionChanged?.();
      }
    } catch {
      // Auto-naming is best-effort
    }
  }

  /**
   * Send error message to chat (triggered by Terminal Link Provider).
   * Opens the chat sidebar and automatically sends the error fix prompt.
   *
   * @param errorMessage - Error message from terminal
   */
  public async sendErrorToChat(errorMessage: string): Promise<void> {
    // Open chat sidebar
    await vscode.commands.executeCommand('zerog.chatView.focus');

    // Wait a moment for the webview to be ready
    await new Promise(resolve => setTimeout(resolve, 200));

    // Send the error message to chat
    await this._handleSendMessage(errorMessage);
  }
}
