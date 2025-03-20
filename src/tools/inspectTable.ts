import { DatabaseService } from "../services/database.js";
import { logger } from "../services/logger.js";

export const INSPECT_TABLE_TOOL = {
  name: "inspect_tailpipe_table",
  description: "Get detailed information about a table including its columns",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "The name of the table to inspect",
      },
      schema: {
        type: "string",
        description: "Optional schema name to specify which table to inspect",
      },
    },
    required: ["name"],
  },
} as const;

export async function handleInspectTableTool(db: DatabaseService, args: { name: string; schema?: string }) {
  const schema = args.schema || 'public';
  try {
    logger.debug(`[inspectTable] Starting table inspection for ${schema}.${args.name}`);

    // Get column information
    const sql = `SELECT column_name, data_type, is_nullable, column_default
                 FROM information_schema.columns
                 WHERE table_schema = '${schema}'
                 AND table_name = '${args.name}'
                 ORDER BY ordinal_position`;
    
    logger.debug(`[inspectTable] Executing columns query SQL: ${sql}`);
    const columns = await db.executeQuery(sql);
    logger.debug(`[inspectTable] Columns query result: ${JSON.stringify(columns)}`);

    logger.debug(`[inspectTable] Returning result: ${JSON.stringify(columns)}`);
    return {
      content: [{ type: "text", text: JSON.stringify(columns) }],
      isError: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[inspectTable] Error occurred: ${errorMessage}`);
    return {
      content: [{ type: "text", text: `Error inspecting table: ${errorMessage}` }],
      isError: true,
    };
  }
}