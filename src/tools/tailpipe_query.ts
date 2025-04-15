import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../services/logger.js";
import { DatabaseService } from "../services/database.js";
import { stringifyResponse } from '../utils/format.js';

export const tool: Tool = {
  name: "tailpipe_query",
  description: `Execute read-only SQL queries against cloud and security logs using DuckDB syntax. Results are returned in JSON format. Before writing queries, you can explore available tables and their structures using the tailpipe_table_list and tailpipe_table_show commands.`,
  inputSchema: {
    type: "object",
    properties: {
      sql: {
        type: "string",
        description: "The SQL query to execute. Must use DuckDB SQL syntax and be read-only."
      }
    },
    required: ["sql"],
    additionalProperties: false
  },
  handler: async (db: DatabaseService, args: { sql: string }) => {
    logger.debug('Executing query_tailpipe tool');
    
    try {
      const rows = await db.executeQuery(args.sql);
      
      // Handle BigInt serialization by converting to Numbers or Strings
      const processedRows = rows.map(row => {
        const processedRow: Record<string, any> = {};
        Object.entries(row).forEach(([key, value]) => {
          if (typeof value === 'bigint') {
            // Convert BigInt to a regular number if it fits within safe integer range
            if (value <= Number.MAX_SAFE_INTEGER && value >= Number.MIN_SAFE_INTEGER) {
              processedRow[key] = Number(value);
            } else {
              // Otherwise convert to string to avoid precision loss
              processedRow[key] = value.toString();
            }
          } else {
            processedRow[key] = value;
          }
        });
        return processedRow;
      });

      return {
        content: [{ type: "text", text: stringifyResponse(processedRows) }],
        isError: false
      };
    } catch (error) {
      logger.error('Failed to execute query:', error instanceof Error ? error.message : String(error));
      return {
        content: [{ type: "text", text: stringifyResponse({ error: error instanceof Error ? error.message : String(error) }) }],
        isError: true
      };
    }
  }
}; 