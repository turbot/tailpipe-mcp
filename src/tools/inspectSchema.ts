import { DatabaseService } from "../services/database.js";
import { logger } from "../services/logger.js";

export const INSPECT_SCHEMA_TOOL = {
  name: "inspect_tailpipe_schema",
  description: "List all tables in a schema",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "The schema name to inspect",
      },
      filter: {
        type: "string",
        description: "Optional SQL ILIKE pattern to filter table names (e.g., '%aws_iam_%')",
      },
    },
    required: ["name"],
  },
} as const;

export async function handleInspectSchemaTool(db: DatabaseService, args: { name: string; filter?: string }) {
  try {
    logger.info(`[inspectSchema] Starting schema inspection for: ${args.name}`);
    
    // Get all tables in the schema
    const sql = `SELECT table_name 
                 FROM information_schema.tables 
                 WHERE table_schema = '${args.name}'
                 AND table_schema NOT IN ('information_schema')`;
    
    logger.debug(`[inspectSchema] Executing tables query SQL: ${sql}`);
    const tables = await db.executeQuery(sql);
    logger.info(`[inspectSchema] Tables query result: ${JSON.stringify(tables)}`);
    
    // Filter tables if a filter is provided
    let filteredTables = tables;
    if (args.filter) {
      logger.debug(`[inspectSchema] Applying filter: ${args.filter}`);
      const filterPattern = args.filter.replace(/%/g, '.*').replace(/_/g, '.');
      const regex = new RegExp(filterPattern);
      filteredTables = tables.filter(t => regex.test(t.table_name));
      logger.info(`[inspectSchema] After filtering: ${JSON.stringify(filteredTables)}`);
    }
    
    logger.info(`[inspectSchema] Returning result: ${JSON.stringify(filteredTables)}`);
    return {
      content: [{ type: "text", text: JSON.stringify(filteredTables) }],
      isError: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[inspectSchema] Error occurred: ${errorMessage}`);
    return {
      content: [{ type: "text", text: `Error inspecting schema: ${errorMessage}` }],
      isError: true,
    };
  }
}