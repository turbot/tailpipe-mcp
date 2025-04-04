import { execSync } from "child_process";
import { logger } from "../services/logger.js";

export const PLUGIN_LIST_TOOL = {
  name: "plugin_list",
  description: "List all available Tailpipe plugins",
  inputSchema: {
    type: "object",
    properties: {},
  }
} as const;

export async function handlePluginListTool() {
  try {
    logger.debug('Executing plugin_list tool');
    
    // Execute the tailpipe command
    const output = execSync('tailpipe plugin list --output json', { encoding: 'utf-8' });
    
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
      logger.error('Tailpipe output:', output);
      return {
        content: [{ 
          type: "text", 
          text: `Error parsing Tailpipe plugin list output: ${parseError instanceof Error ? parseError.message : String(parseError)}` 
        }],
        isError: true
      };
    }
  } catch (error) {
    logger.error('Failed to run Tailpipe plugin list command:', error instanceof Error ? error.message : String(error));
    return {
      content: [{ 
        type: "text", 
        text: `Error running Tailpipe plugin list command: ${error instanceof Error ? error.message : String(error)}` 
      }],
      isError: true
    };
  }
} 