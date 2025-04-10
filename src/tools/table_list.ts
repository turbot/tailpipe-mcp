import { logger } from "../services/logger.js";
import { executeCommand, formatCommandError } from "../utils/command.js";
import { buildTailpipeCommand, getTailpipeEnv } from "../utils/tailpipe.js";

export const TABLE_LIST_TOOL = {
  name: "table_list",
  description: "List all available Tailpipe tables",
  inputSchema: {
    type: "object",
    properties: {},
  }
} as const;

export async function handleTableListTool() {
  logger.debug('Executing table_list tool');
  
  // Build the command
  const cmd = buildTailpipeCommand('table list', { output: 'json' });
  
  try {
    // Execute the tailpipe command
    const output = executeCommand(cmd, { env: getTailpipeEnv() });
    
    // Parse the JSON output and remove columns if they exist
    const tables = JSON.parse(output);
    
    // If the output is an array, ensure each table doesn't have columns but keeps tags
    const processedTables = Array.isArray(tables) 
      ? tables.map(({ columns, ...tableWithoutColumns }) => tableWithoutColumns)
      : tables;
    
    // Return the processed output
    return {
      content: [{ type: "text", text: JSON.stringify(processedTables, null, 2) }]
    };
  } catch (error) {
    logger.error('Failed to execute table_list tool:', error instanceof Error ? error.message : String(error));
    return formatCommandError(error, cmd);
  }
} 