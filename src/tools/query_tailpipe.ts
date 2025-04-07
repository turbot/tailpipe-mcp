import { DatabaseService } from "../services/database.js";
import { logger } from "../services/logger.js";

export const QUERY_TOOL = {
  name: "query_tailpipe",
  description: "Run a read-only Tailpipe SQL query",
  inputSchema: {
    type: "object",
    properties: {
      sql: { type: "string" },
    },
  },
} as const;

export async function handleQueryTool(db: DatabaseService, args: { sql: string }) {
  logger.debug('Executing query_tailpipe tool');

  try {
    // Execute the query
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
    
    // Convert to JSON with pretty printing
    const resultText = JSON.stringify(processedRows, null, 2);

    return {
      content: [{ type: "text", text: resultText }]
    };
  } catch (error) {
    logger.error('Failed to execute query_tailpipe tool:', error instanceof Error ? error.message : String(error));
    throw error;
  }
} 