/**
 * Type definitions for the Zero-G VS Code extension
 */

export interface IChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface IContextItem {
  path: string;
  content: string;
  type: 'file' | 'selection';
  fileName?: string;
  languageId?: string;
  lineRange?: {
    start: number;
    end: number;
  };
}

export interface IExtensionConfig {
  baseUrl: string;
  authToken: string;
  model: string;
  systemPrompt: string;
}

export interface IStreamResponse {
  role: 'assistant';
  content: string;
  isComplete: boolean;
}

export interface IWebviewMessage {
  type: string;
  value?: any;
  filePath?: string;
  fileName?: string;
  code?: string;
}

export interface IContextMetadata {
  hasContext: boolean;
  fileName?: string;
  languageId?: string;
  selectionLines?: string;
}

export interface IFileChip {
  filePath: string;
  fileName: string;
}
