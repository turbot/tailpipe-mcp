import { logger } from "../services/logger.js";
import { executeCommand, formatCommandError } from "../utils/command.js";
import { buildTailpipeCommand, getTailpipeEnv } from "../utils/tailpipe.js";

export const PARTITION_SHOW_TOOL = {
  name: "partition_show",
  description: "Show details of a specific Tailpipe partition",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string" },
    },
    required: ["name"],
  }
} as const;

export async function handlePartitionShowTool(args: { name: string }) {
  logger.debug('Executing partition_show tool');
  
  // Build the command
  const cmd = buildTailpipeCommand(`partition show "${args.name}"`, { output: 'json' });
  
  try {
    // Execute the tailpipe command
    const output = executeCommand(cmd, { env: getTailpipeEnv() });
    
    try {
      // Parse the JSON output to validate it
      JSON.parse(output);
      
      // Return the raw output as it's already in JSON format
      return {
        content: [{ type: "text", text: output }],
        isError: false
      };
    } catch (parseError) {
      logger.error('Failed to parse Tailpipe partition show output:', parseError instanceof Error ? parseError.message : String(parseError));
      return formatCommandError(parseError, cmd);
    }
  } catch (error) {
    logger.error('Failed to run Tailpipe partition show command:', error instanceof Error ? error.message : String(error));
    return formatCommandError(error, cmd);
  }
} 