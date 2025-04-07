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
  logger.debug('Executing table_list tool');
  
  try {
    // Execute the tailpipe command with json output
    const output = execSync('tailpipe table list --output json', { encoding: 'utf-8' });
    
    // Parse the JSON output and remove columns if they exist
    const tables = JSON.parse(output);
    
    // If the output is an array, ensure each table doesn't have columns but keeps tags
    const processedTables = Array.isArray(tables) 
      ? tables.map(({ columns, ...tableWithoutColumns }) => tableWithoutColumns)
      : tables;
    
    // Return the processed output
    return {
      content: [{ type: "text", text: JSON.stringify(processedTables, null, 2) }],
      isError: false
    };
  } catch (error) {
    logger.error('Failed to execute table_list tool:', error instanceof Error ? error.message : String(error));
    throw error;
  }
} 