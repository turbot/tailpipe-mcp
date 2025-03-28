import { execSync } from "child_process";
import { logger } from "../services/logger.js";

export const TABLE_LIST_TOOL = {
  name: "table_list",
  description: "List all available Tailpipe tables",
  inputSchema: {
    type: "object",
    properties: {},
  }
} as const;

export async function handleTableListTool() {
  try {
    logger.debug('Executing table_list tool');
    
    // Execute the tailpipe command
    const output = execSync('tailpipe table list --output json', { encoding: 'utf-8' });
    
    try {
      // Parse the JSON output to validate it
      JSON.parse(output);
      
      // Return the raw output as it's already in JSON format
      return {
        content: [{ type: "text", text: output }],
        isError: false
      };
    } catch (parseError) {
      logger.error('Failed to parse Tailpipe table list output:', parseError instanceof Error ? parseError.message : String(parseError));
      logger.error('Tailpipe output:', output);
      return {
        content: [{ 
          type: "text", 
          text: `Error parsing Tailpipe table list output: ${parseError instanceof Error ? parseError.message : String(parseError)}` 
        }],
        isError: true
      };
    }
  } catch (error) {
    logger.error('Failed to run Tailpipe table list command:', error instanceof Error ? error.message : String(error));
    return {
      content: [{ 
        type: "text", 
        text: `Error running Tailpipe table list command: ${error instanceof Error ? error.message : String(error)}` 
      }],
      isError: true
    };
  }
} 