import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../services/logger.js";
import { executeCommand, formatCommandError } from "../utils/command.js";
import { buildTailpipeCommand, getTailpipeEnv } from "../utils/tailpipe.js";
import { validateAndFormat } from "../utils/format.js";

export const tool: Tool = {
  name: "tailpipe_source_show",
  description: "Get detailed information about a specific Tailpipe data source, including its configuration and plugin details.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name of the source to show details for"
      }
    },
    required: ["name"],
    additionalProperties: false
  },
  handler: async (args: { name: string }) => {
    logger.debug('Executing source_show tool');
    const cmd = buildTailpipeCommand(`source show ${args.name}`, { output: 'json' });
    
    try {
      const output = executeCommand(cmd, { env: getTailpipeEnv() });
      return validateAndFormat(output, cmd, 'source');
    } catch (error) {
      logger.error('Failed to execute source_show tool:', error instanceof Error ? error.message : String(error));
      return formatCommandError(error, cmd);
    }
  }
}; 