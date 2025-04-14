import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../services/logger.js";
import { executeCommand, formatCommandError } from "../utils/command.js";
import { buildTailpipeCommand, getTailpipeEnv } from "../utils/tailpipe.js";
import { validateAndFormat } from "../utils/format.js";

export const tool: Tool = {
  name: "table_show",
  description: "Get detailed information about a specific Tailpipe table and its columns.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name of the table to show details for"
      }
    },
    required: ["name"],
    additionalProperties: false
  },
  handler: async (args: { name?: string }) => {
    logger.debug('Executing table_show tool');

    // Check if table name is provided
    if (!args?.name) {
      logger.error('Table name is required for table_show tool');
      return {
        isError: true,
        content: [{
          type: "text",
          text: "Table name is required. Please provide a table name using the 'name' parameter."
        }]
      };
    }

    const cmd = buildTailpipeCommand(`table show ${args.name}`, { output: 'json' });
    
    try {
      const output = executeCommand(cmd, { env: getTailpipeEnv() });
      return validateAndFormat(output, cmd, 'table');
    } catch (error) {
      logger.error('Failed to execute table_show tool:', error instanceof Error ? error.message : String(error));
      return formatCommandError(error, cmd);
    }
  }
}; 