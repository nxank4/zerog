/**
 * Type definitions for the Zero-G VS Code extension
 */

export type ZeroGMode = 'ask' | 'planner' | 'agent' | 'debug';

export interface IChatMessage {
  role: 'user' | 'assistant';
  content: string | IMessageContentBlock[];
}

export interface IMessageContentBlock {
  type: 'text' | 'image';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface IImageData {
  base64: string;
  media_type: string;
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

export interface IConnectionConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface IAgentConfig {
  allowTerminal: boolean;
  autoApplyDiff: boolean;
  maxIterations: number;
}

export interface IAdvancedConfig {
  temperature: number;
  systemPrompt: string;
  contextLimit: number;
  debugMode: boolean;
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
  images?: IImageData[];
  mode?: ZeroGMode;
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

export interface IToolCall {
  name: string;
  arguments: any;
}

export interface IParsedSegment {
  type: 'text' | 'tool_call';
  content: string;
  toolCall?: IToolCall;
}

export interface IParsedContent {
  segments: IParsedSegment[];
}

export interface IPlanTask {
  id: number;
  task: string;
  status: 'pending' | 'in_progress' | 'done';
}

export interface IFileChange {
  filePath: string;
  fileName: string;
  action: 'modified' | 'created';
  originalContent: string;
  suggestedContent: string;
  selected: boolean;
}

export interface ISessionMeta {
  id: string;
  name: string;
  lastModified: number;
}
