import { ToolMetadata } from '../models/tool.model';

export const TimeTool: ToolMetadata = {
  definition: {
    name: 'time',
    description: 'Get the current date and time.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  execute: () => {
    const now = new Date();
    const date = now.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const time = now.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    return `Current date: ${date}. Current time: ${time}.`;
  },
};
