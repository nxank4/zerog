import { AIService } from '../../core/AIService';
import { ConfigService } from '../../core/ConfigService';
import { ContextService } from '../../core/ContextService';
import { PromptFactory } from '../../core/PromptFactory';
import { ToolHandler, IToolResult } from './ToolHandler';
import { IPlanTask, IContextItem, IChatMessage } from '../../types';

export type AgentState = 'IDLE' | 'THINKING' | 'WAITING_FOR_TOOL' | 'EXECUTING';

export type AgentEvent =
  | { type: 'taskStarted'; task: IPlanTask }
  | { type: 'taskCompleted'; task: IPlanTask }
  | { type: 'taskFailed'; task: IPlanTask; error: string }
  | { type: 'loopFinished' }
  | { type: 'streamChunk'; content: string }
  | { type: 'streamDone'; content: string }
  | { type: 'waitingForTool'; toolCall: { name: string; arguments: any } }
  | { type: 'toolExecuted'; result: IToolResult }
  | { type: 'stateChanged'; state: AgentState };

/**
 * Agent Loop — autonomous executor with a pause-resume state machine.
 *
 * States:
 *   IDLE            – waiting for work
 *   THINKING        – calling AI API
 *   WAITING_FOR_TOOL – AI returned a tool call, paused for user approval
 *   EXECUTING       – running the approved tool
 */
export class AgentLoop {
  private _aiService: AIService;
  private _contextService: ContextService;
  private _toolHandler: ToolHandler;
  private _onEvent: (event: AgentEvent) => void;

  private _state: AgentState = 'IDLE';
  private _running = false;

  // Pause/resume for tool approval
  private _toolApprovalResolve: ((approved: boolean) => void) | null = null;

  // Pause/resume for diff review acceptance (legacy compat)
  private _reviewResolve: (() => void) | null = null;

  constructor(
    aiService: AIService,
    contextService: ContextService,
    onEvent: (event: AgentEvent) => void
  ) {
    this._aiService = aiService;
    this._contextService = contextService;
    this._toolHandler = new ToolHandler();
    this._onEvent = onEvent;
  }

  public get isRunning(): boolean {
    return this._running;
  }

  public get state(): AgentState {
    return this._state;
  }

  private _setState(state: AgentState): void {
    this._state = state;
    this._onEvent({ type: 'stateChanged', state });
  }

  /**
   * Start the agent loop. Iterates through pending plan tasks.
   */
  public async run(
    plan: IPlanTask[],
    updatePlan: (plan: IPlanTask[]) => void,
    getContextItems: () => Promise<IContextItem[]>
  ): Promise<void> {
    if (this._running) {
      return;
    }
    this._running = true;

    try {
      const maxIterations = ConfigService.instance().getAgentConfig().maxIterations;
      let iterations = 0;

      while (this._running) {
        if (iterations >= maxIterations) {
          this._onEvent({ type: 'loopFinished' });
          break;
        }

        const nextTask = plan.find(t => t.status === 'pending');
        if (!nextTask) {
          this._onEvent({ type: 'loopFinished' });
          break;
        }

        // Mark as in_progress
        nextTask.status = 'in_progress';
        updatePlan(plan);
        this._onEvent({ type: 'taskStarted', task: nextTask });

        try {
          await this._executeTask(nextTask, plan, getContextItems);

          nextTask.status = 'done';
          updatePlan(plan);
          this._onEvent({ type: 'taskCompleted', task: nextTask });
          iterations++;
        } catch (error: any) {
          nextTask.status = 'pending';
          updatePlan(plan);
          this._onEvent({ type: 'taskFailed', task: nextTask, error: error.message });
          break;
        }
      }
    } finally {
      this._running = false;
      this._setState('IDLE');
    }
  }

  /**
   * Execute a single task using a multi-turn tool-call loop.
   *
   * Flow per turn:
   *   1. Send conversation to AI  → THINKING
   *   2. Parse response for <tool_call>
   *   3. If tool_call found        → WAITING_FOR_TOOL → wait for approval
   *   4. On approval               → EXECUTING → run tool → capture result
   *   5. Append <tool_result> to history and loop back to 1
   *   6. If no tool_call (just <message>), task is complete → return
   */
  private async _executeTask(
    task: IPlanTask,
    plan: IPlanTask[],
    getContextItems: () => Promise<IContextItem[]>
  ): Promise<void> {
    const contextItems = await getContextItems();

    // Build plan context
    const planContext = plan.map(t =>
      `  ${t.status === 'done' ? '[x]' : t.status === 'in_progress' ? '[>]' : '[ ]'} ${t.id}. ${t.task}`
    ).join('\n');

    const initialPrompt = `## Current Plan\n${planContext}\n\n## Current Task\nTask #${task.id}: ${task.task}\n\nPlease implement this task. Use tool calls to read, write files and run commands. Remember: ONE tool call per response, then STOP and wait for the result.`;

    // Conversation history for this task
    const history: IChatMessage[] = [
      { role: 'user', content: initialPrompt }
    ];

    const MAX_TOOL_TURNS = 20; // Safety limit

    for (let turn = 0; turn < MAX_TOOL_TURNS && this._running; turn++) {
      // ── THINKING ──────────────────────────────────────
      this._setState('THINKING');

      let fullResponse = '';
      fullResponse = await this._aiService.sendMessage(
        history,
        turn === 0 ? contextItems : [], // Only attach file context on first turn
        (chunk: string) => {
          this._onEvent({ type: 'streamChunk', content: chunk });
        },
        'agent'
      );

      this._onEvent({ type: 'streamDone', content: fullResponse });

      // Add assistant response to history
      history.push({ role: 'assistant', content: fullResponse });

      // ── Check for tool call ───────────────────────────
      const toolCall = PromptFactory.parseToolCall(fullResponse);

      if (!toolCall) {
        // No tool call — AI finished with a <message>, task is complete
        break;
      }

      // ── WAITING_FOR_TOOL ──────────────────────────────
      this._setState('WAITING_FOR_TOOL');
      this._onEvent({ type: 'waitingForTool', toolCall });

      const approved = await this._waitForToolApproval();
      if (!approved) {
        // User rejected or loop was stopped
        history.push({
          role: 'user',
          content: '<tool_result>\nStatus: Rejected\nThe user rejected this tool call.\n</tool_result>'
        });
        break;
      }

      // ── EXECUTING ─────────────────────────────────────
      this._setState('EXECUTING');

      const result = await this._toolHandler.execute(toolCall.name, toolCall.arguments);
      this._onEvent({ type: 'toolExecuted', result });

      // Truncate very long outputs to avoid blowing up context
      const truncatedOutput = result.output.length > 10240
        ? result.output.substring(0, 10240) + '\n...(truncated)'
        : result.output;

      // Feed result back as a user message
      history.push({
        role: 'user',
        content: `<tool_result>\nOutput: ${truncatedOutput}\nStatus: ${result.status === 'success' ? 'Success' : 'Error'}\n</tool_result>`
      });
    }
  }

  // ─── Pause / Resume Helpers ────────────────────────────

  private _waitForToolApproval(): Promise<boolean> {
    return new Promise(resolve => {
      this._toolApprovalResolve = resolve;
    });
  }

  /**
   * Approve the pending tool execution (called from UI).
   */
  public approveToolExecution(): void {
    if (this._toolApprovalResolve) {
      this._toolApprovalResolve(true);
      this._toolApprovalResolve = null;
    }
  }

  /**
   * Reject the pending tool execution (called from UI).
   */
  public rejectToolExecution(): void {
    if (this._toolApprovalResolve) {
      this._toolApprovalResolve(false);
      this._toolApprovalResolve = null;
    }
  }

  /**
   * Signal that a diff review was accepted (legacy compat).
   */
  public notifyReviewAccepted(): void {
    if (this._reviewResolve) {
      this._reviewResolve();
      this._reviewResolve = null;
    }
  }

  /**
   * Stop the agent loop.
   */
  public stop(): void {
    this._running = false;
    // Unblock any waiting promises
    if (this._toolApprovalResolve) {
      this._toolApprovalResolve(false);
      this._toolApprovalResolve = null;
    }
    if (this._reviewResolve) {
      this._reviewResolve();
      this._reviewResolve = null;
    }
  }
}
