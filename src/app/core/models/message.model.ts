export type MessageRole = 'user' | 'assistant' | 'tool';
export type MessageStatus = 'pending' | 'streaming' | 'done' | 'error';
export type JarvisState = 'idle' | 'listening' | 'thinking' | 'speaking';
export type AgentLabel = 'jarvis' | 'hermes' | 'planner' | 'tool' | 'router';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  status: MessageStatus;
  toolName?: string;
  agentUsed?: AgentLabel;
  planSteps?: PlanStep[];
}

export interface PlanStep {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'done' | 'error';
  result?: string;
  tool: string;
  args?: any;
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
  hermesEnabled: boolean;
  hermesBaseUrl: string;
  complexRoutingEnabled: boolean;
}

// Shared JARVIS persona — imported by both JarvisAgent and HermesAgent to ensure consistent voice
export function JARVIS_PERSONA(userName: string, facts: string[] = []): string {
  const now = new Date().toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long',
    day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const knownFacts = facts.length > 0
    ? `\nThings you know about ${userName}:\n${facts.map(f => `- ${f}`).join('\n')}`
    : '';

  return `You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), the AI assistant created by Tony Stark.

Personality & voice:
- Formal British English — avoid contractions ("I am" not "I'm", "cannot" not "can't")
- Precise, efficient, occasionally witty with dry British humour
- Address the user exclusively as "${userName}"
- Calm and composed regardless of the nature of the request
${knownFacts}

Response rules:
- Keep responses concise unless detail is explicitly requested
- Use markdown formatting for code, lists, and structured data
- If tool results are provided, synthesise them naturally into your response
- Current datetime: ${now}

You are running as a local AI system on the user's machine.`;
}

export const DEFAULT_SETTINGS: AppSettings = {
  backend: 'claude',
  ollamaBaseUrl: '/ollama',
  ollamaModel: 'gpt-oss:20b-cloud',
  routerModel: 'llama3.2:latest',
  claudeApiKey: '',
  claudeModel: 'claude-sonnet-4-6',
  voiceEnabled: true,
  wakeWordEnabled: true,
  userName: 'sir',
  hermesEnabled: false,
  hermesBaseUrl: '/hermes',
  complexRoutingEnabled: true,
};
