import { execSync } from "child_process";
import { logger } from "../services/logger.js";

export const TABLE_SHOW_TOOL = {
  name: "table_show",
  description: "Show details of a specific Tailpipe table",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name of the table to show details for"
      }
    },
    required: ["name"]
  }
} as const;

export async function handleTableShowTool(args: { name: string }) {
  try {
    logger.debug('Executing table_show tool');
    
    // Execute the tailpipe command
    const output = execSync(`tailpipe table show ${args.name} --output json`, { encoding: 'utf-8' });
    
    try {
      // Parse the JSON output to validate it
      JSON.parse(output);
      
      // Return the raw output as it's already in JSON format
      return {
        content: [{ type: "text", text: output }],
        isError: false
      };
    } catch (parseError) {
      logger.error('Failed to parse Tailpipe table show output:', parseError instanceof Error ? parseError.message : String(parseError));
      logger.error('Tailpipe output:', output);
      return {
        content: [{ 
          type: "text", 
          text: `Error parsing Tailpipe table show output: ${parseError instanceof Error ? parseError.message : String(parseError)}` 
        }],
        isError: true
      };
    }
  } catch (error) {
    logger.error('Failed to run Tailpipe table show command:', error instanceof Error ? error.message : String(error));
    return {
      content: [{ 
        type: "text", 
        text: `Error running Tailpipe table show command: ${error instanceof Error ? error.message : String(error)}` 
      }],
      isError: true
    };
  }
} 