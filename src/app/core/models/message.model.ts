export type MessageRole = 'user' | 'assistant' | 'tool';
export type MessageStatus = 'pending' | 'streaming' | 'done' | 'error';
export type JarvisState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  status: MessageStatus;
  toolName?: string;
  agentUsed?: string;
}

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AppSettings {
  backend: 'ollama' | 'claude';
  ollamaBaseUrl: string;
  ollamaModel: string;
  routerModel: string;
  claudeApiKey: string;
  claudeModel: string;
  voiceEnabled: boolean;
  wakeWordEnabled: boolean;
  userName: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  backend: 'ollama',
  ollamaBaseUrl: '/ollama',
  ollamaModel: 'gpt-oss:20b-cloud',
  routerModel: 'llama3.2:latest',
  claudeApiKey: '',
  claudeModel: 'claude-sonnet-4-6',
  voiceEnabled: true,
  wakeWordEnabled: true,
  userName: 'sir',
};
