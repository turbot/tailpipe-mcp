import { execSync } from "child_process";
import { logger } from "../services/logger.js";

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
  try {
    logger.debug('Executing partition_show tool');
    
    // Execute the tailpipe command
    const output = execSync(`tailpipe partition show "${args.name}" --output json`, { encoding: 'utf-8' });
    
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
      logger.error('Tailpipe output:', output);
      return {
        content: [{ 
          type: "text", 
          text: `Error parsing Tailpipe partition show output: ${parseError instanceof Error ? parseError.message : String(parseError)}` 
        }],
        isError: true
      };
    }
  } catch (error) {
    logger.error('Failed to run Tailpipe partition show command:', error instanceof Error ? error.message : String(error));
    return {
      content: [{ 
        type: "text", 
        text: `Error running Tailpipe partition show command: ${error instanceof Error ? error.message : String(error)}` 
      }],
      isError: true
    };
  }
} 