import { Injectable } from '@angular/core';
import { Intent } from './router.agent';
import { getTimeTool } from '../tools/time.tool';
import { getWeatherTool } from '../tools/weather.tool';
import { searchTool, openUrlTool } from '../tools/search.tool';

@Injectable({ providedIn: 'root' })
export class ToolAgent {
  async execute(intent: Intent, param?: string): Promise<string | null> {
    switch (intent) {
      case 'TIME':
        return getTimeTool();
      case 'WEATHER':
        return await getWeatherTool(param);
      case 'SEARCH':
        return await searchTool(param ?? '');
      case 'OPEN':
        return openUrlTool(param ?? '');
      default:
        return null;
    }
  }
}
