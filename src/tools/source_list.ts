import { logger } from "../services/logger.js";
import { executeCommand, formatCommandError } from "../utils/command.js";
import { buildTailpipeCommand, getTailpipeEnv } from "../utils/tailpipe.js";

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
  
  // Build the command
  const cmd = buildTailpipeCommand('source list', { output: 'json' });
  
  try {
    // Execute the tailpipe command
    const output = executeCommand(cmd, { env: getTailpipeEnv() });
    
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
    return formatCommandError(error, cmd);
  }
} 