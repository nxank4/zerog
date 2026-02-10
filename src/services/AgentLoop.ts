import * as vscode from 'vscode';
import { AIService } from './AIService';
import { ContextService } from './ContextService';
import { EditorService } from './EditorService';
import { IPlanTask, IContextItem } from '../types';

export type AgentEvent =
  | { type: 'taskStarted'; task: IPlanTask }
  | { type: 'taskCompleted'; task: IPlanTask }
  | { type: 'taskFailed'; task: IPlanTask; error: string }
  | { type: 'loopFinished' }
  | { type: 'waitingForReview'; task: IPlanTask }
  | { type: 'streamChunk'; content: string }
  | { type: 'streamDone'; content: string };

/**
 * Agent Loop — autonomous executor that works through plan tasks one at a time.
 *
 * State machine: Pick Task -> Send to AI -> Show Diff Review -> Wait for Accept -> Mark Done -> Next
 */
export class AgentLoop {
  private _aiService: AIService;
  private _contextService: ContextService;
  private _editorService: EditorService;
  private _running = false;
  private _autoAdvance = false;
  private _onEvent: (event: AgentEvent) => void;

  // Promise resolve for waiting on diff review acceptance
  private _reviewResolve: (() => void) | null = null;

  constructor(
    aiService: AIService,
    contextService: ContextService,
    editorService: EditorService,
    onEvent: (event: AgentEvent) => void
  ) {
    this._aiService = aiService;
    this._contextService = contextService;
    this._editorService = editorService;
    this._onEvent = onEvent;
  }

  public get isRunning(): boolean {
    return this._running;
  }

  public set autoAdvance(value: boolean) {
    this._autoAdvance = value;
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
      while (this._running) {
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

          // Mark as done
          nextTask.status = 'done';
          updatePlan(plan);
          this._onEvent({ type: 'taskCompleted', task: nextTask });

          // If auto-advance is off, stop after each task
          if (!this._autoAdvance) {
            break;
          }
        } catch (error: any) {
          nextTask.status = 'pending'; // Reset on failure
          updatePlan(plan);
          this._onEvent({ type: 'taskFailed', task: nextTask, error: error.message });
          break;
        }
      }
    } finally {
      this._running = false;
    }
  }

  /**
   * Execute a single task: send prompt to AI, show diff for review, wait for acceptance.
   */
  private async _executeTask(
    task: IPlanTask,
    plan: IPlanTask[],
    getContextItems: () => Promise<IContextItem[]>
  ): Promise<void> {
    const contextItems = await getContextItems();

    // Build the plan context string
    const planContext = plan.map(t =>
      `  ${t.status === 'done' ? '[x]' : t.status === 'in_progress' ? '[>]' : '[ ]'} ${t.id}. ${t.task}`
    ).join('\n');

    const prompt = `## Current Plan\n${planContext}\n\n## Current Task\nTask #${task.id}: ${task.task}\n\nPlease implement this task. Provide the complete code changes needed.`;

    // Send to AI with streaming
    let fullResponse = '';
    const messages = [{ role: 'user' as const, content: prompt }];

    fullResponse = await this._aiService.sendMessage(
      messages,
      contextItems,
      (chunk: string) => {
        this._onEvent({ type: 'streamChunk', content: chunk });
      },
      'agent'
    );

    this._onEvent({ type: 'streamDone', content: fullResponse });

    // Extract code blocks from the response to show in diff review
    const codeBlocks = this._extractCodeBlocks(fullResponse);

    if (codeBlocks.length > 0) {
      // Show diff review for the first significant code block
      const mainCode = codeBlocks[0];

      this._onEvent({ type: 'waitingForReview', task });

      // Open diff editor and wait for user to accept or discard
      await this._editorService.openDiffReview(mainCode);
      await this._waitForReviewAcceptance();
    }
  }

  /**
   * Wait for the user to accept the diff review.
   * Resolved externally when zerog.acceptDiff is called.
   */
  private _waitForReviewAcceptance(): Promise<void> {
    return new Promise(resolve => {
      this._reviewResolve = resolve;
    });
  }

  /**
   * Signal that the diff review was accepted (called from extension command).
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
    if (this._reviewResolve) {
      this._reviewResolve();
      this._reviewResolve = null;
    }
  }

  /**
   * Extract fenced code blocks from an AI response.
   */
  private _extractCodeBlocks(response: string): string[] {
    const blocks: string[] = [];
    const regex = /```(?:\w*)\n([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(response)) !== null) {
      const code = match[1].trim();
      if (code.length > 0) {
        blocks.push(code);
      }
    }
    return blocks;
  }
}
