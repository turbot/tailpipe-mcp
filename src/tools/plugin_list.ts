import { logger } from "../services/logger.js";
import { executeCommand, formatCommandError } from "../utils/command.js";
import { buildTailpipeCommand, getTailpipeEnv } from "../utils/tailpipe.js";

export const PLUGIN_LIST_TOOL = {
  name: "plugin_list",
  description: "List all available Tailpipe plugins",
  inputSchema: {
    type: "object",
    properties: {},
  }
} as const;

export async function handlePluginListTool() {
  logger.debug('Executing plugin_list tool');
  
  // Build the command
  const cmd = buildTailpipeCommand('plugin list', { output: 'json' });
  
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
      logger.error('Failed to parse Tailpipe plugin list output:', parseError instanceof Error ? parseError.message : String(parseError));
      return formatCommandError(parseError, cmd);
    }
  } catch (error) {
    logger.error('Failed to run Tailpipe plugin list command:', error instanceof Error ? error.message : String(error));
    return formatCommandError(error, cmd);
  }
} 