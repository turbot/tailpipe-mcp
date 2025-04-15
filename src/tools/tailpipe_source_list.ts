import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../services/logger.js";
import { executeCommand, formatCommandError } from "../utils/command.js";
import { buildTailpipeCommand, getTailpipeEnv } from "../utils/tailpipe.js";
import { formatListResult } from "../utils/format.js";

interface Source {
  name: string;
  plugin?: string;
  description?: string;
}

function parseSources(output: string): Source[] {
  const rawSources = JSON.parse(output);
  if (!Array.isArray(rawSources)) {
    throw new Error('Expected array output from Tailpipe CLI');
  }

  return rawSources.map(source => {
    const result: Source = {
      name: source.name || ''
    };
    
    if (source.plugin) {
      result.plugin = source.plugin;
    }
    
    if (source.description) {
      result.description = source.description;
    }
    
    return result;
  });
}

export const tool: Tool = {
  name: "tailpipe_source_list",
  description: `List all available Tailpipe data sources with their associated plugins.`,
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false
  },
  handler: async () => {
    logger.debug('Executing source_list tool');
    const cmd = buildTailpipeCommand('source list', { output: 'json' });
    
    try {
      const output = executeCommand(cmd, { env: getTailpipeEnv() });
      const sources = parseSources(output);
      return formatListResult(sources, 'sources', cmd);
    } catch (error) {
      logger.error('Failed to execute source_list tool:', error instanceof Error ? error.message : String(error));
      return formatCommandError(error, cmd);
    }
  }
}; 