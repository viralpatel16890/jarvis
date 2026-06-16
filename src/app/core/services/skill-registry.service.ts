import { Injectable } from '@angular/core';
import { ToolMetadata, ToolDefinition } from '../models/tool.model';
import { TimeTool } from '../tools/time.tool';
import { WeatherTool } from '../tools/weather.tool';
import { SearchTool, OpenUrlTool } from '../tools/search.tool';
import { ScrapeTool } from '../tools/scrape.tool';

@Injectable({ providedIn: 'root' })
export class SkillRegistryService {
  private tools = new Map<string, ToolMetadata>();

  constructor() {
    this.register(TimeTool);
    this.register(WeatherTool);
    this.register(SearchTool);
    this.register(OpenUrlTool);
    this.register(ScrapeTool);
  }

  register(tool: ToolMetadata): void {
    this.tools.set(tool.definition.name.toLowerCase(), tool);
  }

  getTool(name: string): ToolMetadata | undefined {
    return this.tools.get(name.toLowerCase());
  }

  getAllDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  async execute(name: string, args: any): Promise<string> {
    const tool = this.getTool(name);
    if (!tool) return `Tool "${name}" not found.`;
    try {
      return await tool.execute(args);
    } catch (e) {
      return `Error executing tool "${name}": ${(e as Error).message}`;
    }
  }
}
