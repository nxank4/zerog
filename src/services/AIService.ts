import axios from 'axios';
import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import { IChatMessage, IContextItem, IExtensionConfig } from '../types';

/**
 * Service responsible for AI communication with Antigravity proxy
 */
export class AIService {
  private _md: MarkdownIt;

  constructor() {
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
   * Get extension configuration
   */
  private _getConfig(): IExtensionConfig {
    const config = vscode.workspace.getConfiguration('zerog');
    return {
      baseUrl: config.get<string>('baseUrl', 'http://localhost:8080'),
      authToken: config.get<string>('authToken', 'test'),
      model: config.get<string>('model', 'claude-opus-4-6-thinking'),
      systemPrompt: config.get<string>('systemPrompt', 'You are a helpful coding assistant.')
    };
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
   * @returns Complete assistant message
   */
  public async sendMessage(
    messages: IChatMessage[],
    contextItems: IContextItem[],
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const config = this._getConfig();
    
    // Add context to the first user message if available
    const contextString = this._formatContext(contextItems);
    const messagesWithContext = [...messages];
    
    if (contextString && messagesWithContext.length > 0) {
      const lastUserMessageIndex = messagesWithContext.length - 1;
      if (messagesWithContext[lastUserMessageIndex].role === 'user') {
        messagesWithContext[lastUserMessageIndex] = {
          ...messagesWithContext[lastUserMessageIndex],
          content: contextString + 'User Query: ' + messagesWithContext[lastUserMessageIndex].content
        };
      }
    }

    let assistantMessage = '';

    try {
      const response = await axios.post(
        config.baseUrl + '/v1/messages',
        {
          model: config.model,
          max_tokens: 4096,
          system: config.systemPrompt,
          messages: messagesWithContext,
          stream: true
        },
        {
          headers: {
            'x-api-key': config.authToken,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          responseType: 'stream'
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
}
