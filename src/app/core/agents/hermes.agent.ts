import { Injectable } from '@angular/core';
import { HermesService } from '../services/hermes.service';
import { OllamaService } from '../services/ollama.service';
import { ClaudeService } from '../services/claude.service';
import { SettingsService } from '../services/settings.service';
import { SkillRegistryService } from '../services/skill-registry.service';
import { ProfileService } from '../services/profile.service';
import { OllamaMessage, PlanStep, JARVIS_PERSONA } from '../models/message.model';

export interface PlanEvent {
  type: 'plan' | 'step_start' | 'step_done' | 'token' | 'done';
  steps?: PlanStep[];
  stepId?: string;
  result?: string;
  token?: string;
}

@Injectable({ providedIn: 'root' })
export class HermesAgent {
  constructor(
    private hermesService: HermesService,
    private ollama: OllamaService,
    private claude: ClaudeService,
    private settings: SettingsService,
    private registry: SkillRegistryService,
    private profile: ProfileService
  ) {}

  private getPlannerPrompt(): string {
    const tools = this.registry.getAllDefinitions();
    const toolList = tools.map(t => `${t.name} - ${t.description}`).join('\n');

    return `You are a task planner. Break the user's request into concrete, parallel-safe steps.
Reply with ONLY a JSON array — no prose, no markdown.
Each step: { "id": "s1", "description": "...", "tool": "TOOL_NAME|none", "args": {} }
Use tool="none" for steps that require synthesis or reasoning (no external data needed).

Available tools:
${toolList}

Example: [{"id":"s1","description":"Search for X","tool":"search","args":{"query":"X"}},{"id":"s2","description":"Synthesize findings","tool":"none","args":{}}]`;
  }

  async *stream(
    userMessage: string,
    conversationHistory: OllamaMessage[],
    signal?: AbortSignal
  ): AsyncGenerator<PlanEvent> {
    const s = this.settings.get();

    // ── Attempt 1: Hermes CLI via bridge ──────────────────────────────────────
    if (s.hermesEnabled) {
      try {
        const health = await new Promise<{ hermesInstalled: boolean }>((resolve) => {
          this.hermesService.checkHealth().subscribe(resolve);
        });

        if (health.hermesInstalled) {
          for await (const token of this.hermesService.streamChat(userMessage)) {
            if (signal?.aborted) break;
            yield { type: 'token', token };
          }
          yield { type: 'done' };
          return;
        }
      } catch {
        // Bridge offline or Hermes not installed — fall through
      }
    }

    // ── Attempt 2: In-app multi-agent pipeline ────────────────────────────────
    yield* this.runMultiAgentPipeline(userMessage, conversationHistory, signal);
  }

  private async *runMultiAgentPipeline(
    userMessage: string,
    history: OllamaMessage[],
    signal?: AbortSignal
  ): AsyncGenerator<PlanEvent> {
    const s = this.settings.get();

    // Step A — Plan (tiny local model, fast, ~100 tokens)
    // Inject last 8 messages for multi-turn context awareness
    let steps: PlanStep[] = [];
    try {
      const planJson = await this.ollama.chatOnce(
        [
          { role: 'system', content: this.getPlannerPrompt() },
          // Give planner recent context so it understands follow-up requests
          ...history.slice(-8),
          { role: 'user', content: userMessage },
        ],
        s.routerModel,
        signal
      );
      const parsed = JSON.parse(planJson.match(/\[[\s\S]*\]/)?.[0] ?? '[]');
      steps = parsed.map((p: { id: string; description: string; tool?: string; args?: any }) => ({
        id: p.id,
        description: p.description,
        tool: p.tool ?? 'none',
        args: p.args ?? {},
        status: 'pending' as const,
      }));
    } catch {
      steps = [{ id: 's1', description: userMessage, tool: 'none', status: 'pending' }];
    }

    yield { type: 'plan', steps };

    // Step B — Execute steps in parallel (tools run concurrently, 0 LLM tokens)
    const toolSteps  = steps.filter(s => s.tool !== 'none');
    const synthSteps = steps.filter(s => s.tool === 'none');

    for (const step of toolSteps) {
      step.status = 'running';
      yield { type: 'step_start', stepId: step.id, steps };
    }

    const toolResults = await Promise.all(
      toolSteps.map(step => this.executeTool(step))
    );

    for (let i = 0; i < toolSteps.length; i++) {
      toolSteps[i].status = 'done';
      toolSteps[i].result = toolResults[i];
      yield { type: 'step_done', stepId: toolSteps[i].id, result: toolResults[i], steps };
    }

    for (const step of synthSteps) {
      step.status = 'running';
      yield { type: 'step_start', stepId: step.id, steps };
    }

    // Step C — Synthesize (streaming, with Claude auto-fallback if Ollama circuit is open)
    const toolContext = toolResults.length
      ? `\n\nData gathered:\n${toolResults.map((r, i) => `[${toolSteps[i].description}]: ${r}`).join('\n')}`
      : '';

    const facts = this.profile.getFacts();
    const systemPrompt = JARVIS_PERSONA(this.settings.get().userName, facts);

    const synthMessages: OllamaMessage[] = [
      ...history.slice(-12),
      { role: 'user', content: `${userMessage}${toolContext}` },
    ];

    let synthBuffer = '';
    const ollamaDown = this.ollama.isCircuitOpen();

    if (!ollamaDown) {
      try {
        const fullMessages: OllamaMessage[] = [
          { role: 'system', content: systemPrompt },
          ...synthMessages,
        ];
        for await (const token of this.ollama.streamChat(fullMessages, s.ollamaModel, signal)) {
          synthBuffer += token;
          yield { type: 'token', token };
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err;
        // Ollama failed mid-stream — fall through to Claude if key available
        synthBuffer = '';
      }
    }

    // Claude fallback: used when Ollama circuit is open or streaming threw
    if (!synthBuffer && s.claudeApiKey) {
      for await (const token of this.claude.streamChat(synthMessages, systemPrompt, signal)) {
        synthBuffer += token;
        yield { type: 'token', token };
      }
    } else if (!synthBuffer) {
      throw new Error('Ollama is unavailable and no Claude API key is configured.');
    }

    // Proactive fact extraction
    this.extractFacts(userMessage, synthBuffer);

    for (const step of synthSteps) {
      step.status = 'done';
      step.result = synthBuffer.slice(0, 80) + '…';
    }

    yield { type: 'done', steps };
  }

  private async executeTool(step: PlanStep): Promise<string> {
    try {
      if (step.tool === 'none') return '';
      return await this.registry.execute(step.tool, step.args || {});
    } catch (e) {
      return `[Tool error for "${step.description}": ${(e as Error).message}]`;
    }
  }

  private async extractFacts(userMsg: string, aiMsg: string): Promise<void> {
    if (!aiMsg || aiMsg.length < 20) return;
    const s = this.settings.get();
    const extractionPrompt = `Extract key permanent facts about the user from this exchange.
Only extract facts about their identity, preferences, ongoing projects, or location.
Ignore transient states (mood, current time).
Reply with a JSON array of strings. Each string should be a single standalone fact.
Example: ["User is a React developer", "User prefers dark mode", "User lives in London"]
If no new facts found, reply with [].

Exchange:
User: ${userMsg}
Assistant: ${aiMsg}`;

    try {
      const result = await this.ollama.chatOnce(
        [{ role: 'user', content: extractionPrompt }],
        s.routerModel
      );
      const facts = JSON.parse(result.match(/\[[\s\S]*\]/)?.[0] ?? '[]');
      if (Array.isArray(facts)) {
        facts.forEach(f => this.profile.addFact(f));
      }
    } catch {}
  }
}
