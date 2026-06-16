import { Injectable } from '@angular/core';
import { Intent } from './router.agent';
import { SkillRegistryService } from '../services/skill-registry.service';

@Injectable({ providedIn: 'root' })
export class ToolAgent {
  constructor(private registry: SkillRegistryService) {}

  async execute(intent: Intent, param?: string): Promise<string | null> {
    const toolName = intent.toLowerCase();

    // Map legacy intents to registry tools
    let args: any = {};
    if (toolName === 'weather')  args = { location: param };
    if (toolName === 'search')   args = { query: param };
    if (toolName === 'open_url') args = { url: param };
    if (toolName === 'time')     args = {};

    const tool = this.registry.getTool(toolName);
    if (!tool) return null;

    return await this.registry.execute(toolName, args);
  }
}
