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
  logger.debug('Executing source_list tool');
  
  try {
    // Execute the tailpipe command
    const output = execSync('tailpipe source list --output json', { encoding: 'utf-8' });
    
    // Parse the JSON output and remove columns if they exist
    const sources = JSON.parse(output);
    
    // If the output is an array, ensure each source doesn't have columns but keeps tags
    const processedSources = Array.isArray(sources) 
      ? sources.map(({ columns, ...sourceWithoutColumns }) => sourceWithoutColumns)
      : sources;
    
    // Return the processed output
    return {
      content: [{ type: "text", text: JSON.stringify(processedSources, null, 2) }],
      isError: false
    };
  } catch (error) {
    logger.error('Failed to execute source_list tool:', error instanceof Error ? error.message : String(error));
    throw error;
  }
} 