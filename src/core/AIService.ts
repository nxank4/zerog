import axios from 'axios';
import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import { IChatMessage, IContextItem, IParsedContent, IParsedSegment, IToolCall, ZeroGMode } from '../types';
import { ContextService } from './ContextService';
import { PromptFactory } from './PromptFactory';
import { ConfigService } from './ConfigService';

/**
 * Service responsible for AI communication with Antigravity proxy
 */
export class AIService {
  private _md: MarkdownIt;
  private _contextService: ContextService;
  private _projectMap: string | null = null;

  constructor(contextService?: ContextService) {
    this._contextService = contextService || new ContextService();
    // Initialize markdown-it with syntax highlighting
    this._md = new MarkdownIt({
      html: true,
      linkify: true,
      typographer: true,
      highlight: (str: string, lang: string) => {
        if (lang && hljs.getLanguage(lang)) {
          try {
            return '<pre class="hljs"><code>' +
                   hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
                   '</code></pre>';
          } catch (err) {
            console.error('Highlight error:', err);
          }
        }
        return '<pre class="hljs"><code>' + this._md.utils.escapeHtml(str) + '</code></pre>';
      }
    });
  }

  /**
   * Initialize project map by loading it from ContextService.
   * Should be called on extension activation or when chat opens.
   */
  public async initializeProjectMap(): Promise<void> {
    try {
      this._projectMap = await this._contextService.generateProjectMap();
      console.log('[AIService] Project map initialized');
    } catch (error: any) {
      console.error('[AIService] Failed to initialize project map:', error.message);
      this._projectMap = null;
    }
  }

  /**
   * Build the enhanced system prompt with project map.
   *
   * @param basePrompt - Base system prompt from config
   * @returns Enhanced system prompt with project structure
   */
  private _buildSystemPrompt(basePrompt: string): string {
    if (!this._projectMap) {
      return basePrompt;
    }

    return `${basePrompt}

You have access to the following project file structure:

${this._projectMap}

Use this structure to understand the codebase organization and provide more contextually relevant suggestions.`;
  }

  /**
   * Format context items into a structured string
   */
  private _formatContext(contextItems: IContextItem[]): string {
    if (contextItems.length === 0) {
      return '';
    }

    let contextString = '\n[Context Files]\n';
    
    for (const item of contextItems) {
      const fileName = item.fileName || item.path.split('/').pop() || 'unknown';
      contextString += `\n[File: ${fileName}]`;
      
      if (item.languageId) {
        contextString += ` (${item.languageId})`;
      }
      
      if (item.lineRange) {
        contextString += ` [Lines: ${item.lineRange.start}-${item.lineRange.end}]`;
      }
      
      contextString += '\n```\n' + item.content + '\n```\n';
    }
    
    return contextString + '\n';
  }

  /**
   * Render markdown to HTML
   */
  public renderMarkdown(content: string): string {
    return this._md.render(content);
  }

  /**
   * Send message to AI with streaming support
   * @param messages - Array of chat messages
   * @param contextItems - Array of context items (files, selections)
   * @param onChunk - Callback for each streaming chunk
   * @param mode - Current Zero-G mode (ask, planner, agent, debug)
   * @returns Complete assistant message
   */
  public async sendMessage(
    messages: IChatMessage[],
    contextItems: IContextItem[],
    onChunk: (chunk: string) => void,
    mode: ZeroGMode = 'ask',
    abortSignal?: AbortSignal
  ): Promise<string> {
    const conn = ConfigService.instance().getConnectionConfig();
    const adv = ConfigService.instance().getAdvancedConfig();

    // Use PromptFactory for mode-specific prompt, fall back to config for 'ask'
    const basePrompt = mode === 'ask'
      ? (adv.systemPrompt || 'You are a helpful coding assistant.')
      : PromptFactory.getSystemPrompt(mode);
    
    // Add context to the last user message if available
    const contextString = this._formatContext(contextItems);
    const messagesWithContext = [...messages];

    if (contextString && messagesWithContext.length > 0) {
      const lastUserMessageIndex = messagesWithContext.length - 1;
      const lastMsg = messagesWithContext[lastUserMessageIndex];
      if (lastMsg.role === 'user') {
        if (typeof lastMsg.content === 'string') {
          // Simple string message — prepend context
          messagesWithContext[lastUserMessageIndex] = {
            ...lastMsg,
            content: contextString + 'User Query: ' + lastMsg.content
          };
        } else if (Array.isArray(lastMsg.content)) {
          // Multimodal message — prepend context as a text block
          const contextBlock = { type: 'text' as const, text: contextString + 'User Query: ' };
          const updatedBlocks = [...lastMsg.content];
          // Find the first text block and prepend context to it
          const firstTextIdx = updatedBlocks.findIndex(b => b.type === 'text');
          if (firstTextIdx !== -1) {
            updatedBlocks[firstTextIdx] = {
              ...updatedBlocks[firstTextIdx],
              text: contextString + 'User Query: ' + (updatedBlocks[firstTextIdx].text || '')
            };
          } else {
            updatedBlocks.unshift(contextBlock);
          }
          messagesWithContext[lastUserMessageIndex] = {
            ...lastMsg,
            content: updatedBlocks
          };
        }
      }
    }

    let assistantMessage = '';

    try {
      const response = await axios.post(
        conn.baseUrl + '/v1/messages',
        {
          model: conn.model,
          max_tokens: adv.contextLimit,
          system: this._buildSystemPrompt(basePrompt),
          messages: messagesWithContext,
          stream: true
        },
        {
          headers: {
            'x-api-key': conn.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          responseType: 'stream',
          signal: abortSignal
        }
      );

      // Handle streaming response
      response.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
          // Skip empty lines and comments
          if (!line.trim() || line.startsWith(':')) {
            continue;
          }

          // Parse SSE format: "data: {...}"
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            
            // Handle stream end
            if (data === '[DONE]') {
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              let textChunk = '';
              
              // Handle Anthropic format
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                textChunk = parsed.delta.text;
              }
              // Handle standard format with delta
              else if (parsed.delta?.content) {
                textChunk = parsed.delta.content;
              }
              // Handle message_delta format
              else if (parsed.type === 'message_delta' && parsed.delta?.content) {
                textChunk = parsed.delta.content;
              }
              // Handle simple text chunks
              else if (parsed.text) {
                textChunk = parsed.text;
              }

              if (textChunk) {
                assistantMessage += textChunk;
                onChunk(textChunk);
              }
            } catch (parseError) {
              console.error('Error parsing SSE data:', parseError);
            }
          }
        }
      });

      // Wait for stream to complete
      await new Promise<void>((resolve, reject) => {
        response.data.on('end', () => resolve());
        response.data.on('error', (err: Error) => reject(err));
      });

      return assistantMessage;
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || error.message || 'Unknown error';
      throw new Error(`AI Service Error: ${errorMessage}`);
    }
  }

  /**
   * Process slash commands
   * @param message - User message that might contain a slash command
   * @returns Processed message and display message
   */
  public processSlashCommand(message: string): { processedMessage: string; displayMessage: string } {
    if (!message.startsWith('/')) {
      return { processedMessage: message, displayMessage: message };
    }

    const command = message.split(' ')[0].toLowerCase();
    const args = message.slice(command.length).trim();
    
    let processedMessage = message;
    let displayMessage = message;
    
    switch (command) {
      case '/fix':
        processedMessage = 'Fix the bugs in this code and explain what was wrong and how you fixed it.';
        displayMessage = '🔧 /fix';
        break;
      case '/explain':
        processedMessage = 'Explain what this code does in simple terms. Break down the logic step by step.';
        displayMessage = '📖 /explain';
        break;
      case '/refactor':
        processedMessage = 'Refactor this code for better readability, performance, and maintainability. Explain the improvements you made.';
        displayMessage = '⚡ /refactor';
        break;
      case '/optimize':
        processedMessage = 'Optimize this code for better performance. Identify bottlenecks and suggest improvements.';
        displayMessage = '🚀 /optimize';
        break;
      case '/document':
        processedMessage = 'Add comprehensive documentation to this code including docstrings, comments, and usage examples.';
        displayMessage = '📝 /document';
        break;
      case '/test':
        processedMessage = 'Generate unit tests for this code. Include edge cases and error handling.';
        displayMessage = '🧪 /test';
        break;
      default:
        // Unknown command, use as is
        break;
    }
    
    // Append any additional args if provided
    if (args && processedMessage !== message) {
      processedMessage += ' ' + args;
    }
    
    return { processedMessage, displayMessage };
  }

  /**
   * Get AI completion for ghost text (inline autocomplete).
   * Simplified version without streaming, optimized for FIM (Fill-In-Middle).
   *
   * @param prompt - FIM prompt with prefix and suffix context
   * @param abortSignal - Signal to cancel the request
   * @returns Completion text
   */
  public async getCompletion(prompt: string, abortSignal: AbortSignal): Promise<string> {
    const conn = ConfigService.instance().getConnectionConfig();
    const adv = ConfigService.instance().getAdvancedConfig();

    try {
      const response = await axios.post(
        conn.baseUrl + '/v1/messages',
        {
          model: conn.model,
          max_tokens: 512, // Shorter for autocomplete
          system: 'You are a code completion assistant. Provide concise, accurate completions.',
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          stream: false, // Non-streaming for simpler handling
          temperature: adv.temperature
        },
        {
          headers: {
            'x-api-key': conn.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          signal: abortSignal
        }
      );

      // Extract completion from response
      const content = response.data?.content?.[0]?.text || '';
      
      // Clean up completion (remove code fences if present)
      let completion = content.trim();
      
      // Remove markdown code fences if AI ignored instructions
      if (completion.startsWith('```')) {
        const lines = completion.split('\n');
        // Remove first line (```language) and last line (```)
        completion = lines.slice(1, -1).join('\n').trim();
      }

      return completion;
    } catch (error: any) {
      // Re-throw abort errors for proper handling
      if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
        const abortError = new Error('Request aborted');
        abortError.name = 'AbortError';
        throw abortError;
      }

      const errorMessage = error.response?.data?.error?.message || error.message || 'Unknown error';
      throw new Error(`AI Completion Error: ${errorMessage}`);
    }
  }

  /**
   * Parse tool calls from AI response
   * @param content - AI response content that may contain tool calls
   * @returns Parsed content with separated text and tool call segments
   */
  public parseToolCalls(content: string): IParsedContent {
    const segments: IParsedSegment[] = [];
    const toolCallRegex = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g;
    
    let lastIndex = 0;
    let match;

    while ((match = toolCallRegex.exec(content)) !== null) {
      // Add text before the tool call
      if (match.index > lastIndex) {
        const textContent = content.substring(lastIndex, match.index);
        if (textContent.trim()) {
          segments.push({
            type: 'text',
            content: textContent
          });
        }
      }

      // Parse and add the tool call
      try {
        const toolCall = JSON.parse(match[1]) as IToolCall;
        segments.push({
          type: 'tool_call',
          content: match[0],
          toolCall: toolCall
        });
      } catch (error) {
        // If JSON parsing fails, treat it as text
        console.error('Failed to parse tool call JSON:', error);
        segments.push({
          type: 'text',
          content: match[0]
        });
      }

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text after the last tool call
    if (lastIndex < content.length) {
      const textContent = content.substring(lastIndex);
      if (textContent.trim()) {
        segments.push({
          type: 'text',
          content: textContent
        });
      }
    }

    // If no tool calls were found, return the entire content as text
    if (segments.length === 0) {
      segments.push({
        type: 'text',
        content: content
      });
    }

    return { segments };
  }
}
