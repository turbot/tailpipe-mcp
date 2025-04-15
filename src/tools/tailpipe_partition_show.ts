import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../services/logger.js";
import { executeCommand, formatCommandError } from "../utils/command.js";
import { buildTailpipeCommand, getTailpipeEnv } from "../utils/tailpipe.js";
import { validateAndFormat } from "../utils/format.js";

export const tool: Tool = {
  name: "tailpipe_partition_show",
  description: "Get details for a specific Tailpipe partition.",
  inputSchema: {
    type: "object",
    properties: {
      name: { 
        type: "string",
        description: "Name of the partition to show details for"
      }
    },
    required: ["name"],
    additionalProperties: false
  },
  handler: async (args: { name: string }) => {
    logger.debug('Executing partition_show tool');
    const cmd = buildTailpipeCommand(`partition show "${args.name}"`, { output: 'json' });
    
    try {
      const output = executeCommand(cmd, { env: getTailpipeEnv() });
      return validateAndFormat(output, cmd, 'partition');
    } catch (error) {
      logger.error('Failed to execute partition_show tool:', error instanceof Error ? error.message : String(error));
      return formatCommandError(error, cmd);
    }
  }
}; 