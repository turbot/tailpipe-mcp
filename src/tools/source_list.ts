import { execSync } from "child_process";
import { logger } from "../services/logger.js";

export const SOURCE_LIST_TOOL = {
  name: "source_list",
  description: "List all available Tailpipe sources",
  inputSchema: {
    type: "object",
    properties: {},
  }
} as const;

export async function handleSourceListTool() {
  try {
    logger.debug('Executing source_list tool');
    
    // Execute the tailpipe command
    const output = execSync('tailpipe source list --output json', { encoding: 'utf-8' });
    
    try {
      // Parse the JSON output and remove columns if they exist
      const sources = JSON.parse(output);
      
      // If the output is an array, ensure each source doesn't have columns
      const processedSources = Array.isArray(sources) 
        ? sources.map(({ columns, ...sourceWithoutColumns }) => sourceWithoutColumns)
        : sources;
      
      // Return the processed output
      return {
        content: [{ type: "text", text: JSON.stringify(processedSources, null, 2) }],
        isError: false
      };
    } catch (parseError) {
      logger.error('Failed to parse Tailpipe source list output:', parseError instanceof Error ? parseError.message : String(parseError));
      logger.error('Tailpipe output:', output);
      return {
        content: [{ 
          type: "text", 
          text: `Error parsing Tailpipe source list output: ${parseError instanceof Error ? parseError.message : String(parseError)}` 
        }],
        isError: true
      };
    }
  } catch (error) {
    logger.error('Failed to run Tailpipe source list command:', error instanceof Error ? error.message : String(error));
    return {
      content: [{ 
        type: "text", 
        text: `Error running Tailpipe source list command: ${error instanceof Error ? error.message : String(error)}` 
      }],
      isError: true
    };
  }
} 