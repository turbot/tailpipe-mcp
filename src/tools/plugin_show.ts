import { logger } from "../services/logger.js";
import { executeCommand, formatCommandError } from "../utils/command.js";
import { buildTailpipeCommand, getTailpipeEnv } from "../utils/tailpipe.js";

export const PLUGIN_SHOW_TOOL = {
  name: "plugin_show",
  description: "Show details of a specific Tailpipe plugin",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name of the plugin to show details for"
      }
    },
    required: ["name"]
  }
} as const;

export async function handlePluginShowTool(args: { name: string }) {
  logger.debug('Executing plugin_show tool');
  
  // Build the command
  const cmd = buildTailpipeCommand(`plugin show ${args.name}`, { output: 'json' });
  
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
      logger.error('Failed to parse Tailpipe plugin show output:', parseError instanceof Error ? parseError.message : String(parseError));
      return formatCommandError(parseError, cmd);
    }
  } catch (error) {
    logger.error('Failed to run Tailpipe plugin show command:', error instanceof Error ? error.message : String(error));
    return formatCommandError(error, cmd);
  }
} 