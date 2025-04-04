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
    
    // Execute the tailpipe command with json output
    const output = execSync('tailpipe table list --output json', { encoding: 'utf-8' });
    
    try {
      // Parse the JSON output and remove columns if they exist
      const tables = JSON.parse(output);
      
      // If the output is an array, ensure each table doesn't have columns
      const processedTables = Array.isArray(tables) 
        ? tables.map(({ columns, ...tableWithoutColumns }) => tableWithoutColumns)
        : tables;
      
      // Return the processed output
      return {
        content: [{ type: "text", text: JSON.stringify(processedTables, null, 2) }],
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