import { execSync } from "child_process";
import { logger } from "../services/logger.js";

export const PARTITION_LIST_TOOL = {
  name: "partition_list",
  description: "List all available Tailpipe partitions",
  inputSchema: {
    type: "object",
    properties: {},
  }
} as const;

export async function handlePartitionListTool() {
  try {
    logger.debug('Executing partition_list tool');
    
    // Execute the tailpipe command
    const output = execSync('tailpipe partition list --output json', { encoding: 'utf-8' });
    
    try {
      // Parse the JSON output to validate it
      JSON.parse(output);
      
      // Return the raw output as it's already in JSON format
      return {
        content: [{ type: "text", text: output }],
        isError: false
      };
    } catch (parseError) {
      logger.error('Failed to parse Tailpipe partition list output:', parseError instanceof Error ? parseError.message : String(parseError));
      logger.error('Tailpipe output:', output);
      return {
        content: [{ 
          type: "text", 
          text: `Error parsing Tailpipe partition list output: ${parseError instanceof Error ? parseError.message : String(parseError)}` 
        }],
        isError: true
      };
    }
  } catch (error) {
    logger.error('Failed to run Tailpipe partition list command:', error instanceof Error ? error.message : String(error));
    return {
      content: [{ 
        type: "text", 
        text: `Error running Tailpipe partition list command: ${error instanceof Error ? error.message : String(error)}` 
      }],
      isError: true
    };
  }
} 