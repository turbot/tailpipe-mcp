import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { DatabaseService } from "../services/database.js";
import { QUERY_TOOL, handleQueryTool } from './query.js';
import { CLEAR_CACHE_TOOL, handleClearCacheTool } from './clearCache.js';
import { INSPECT_DATABASE_TOOL, handleInspectDatabaseTool } from './inspectDatabase.js';
import { INSPECT_SCHEMA_TOOL, handleInspectSchemaTool } from './inspectSchema.js';
import { INSPECT_TABLE_TOOL, handleInspectTableTool } from './inspectTable.js';
import { LIST_TABLES_TOOL, handleListTablesTool } from './listTables.js';
import { RECONNECT_TOOL, handleReconnectTool } from './reconnect.js';

export * from './query.js';
export * from './clearCache.js';
export * from './inspectDatabase.js';
export * from './inspectSchema.js';
export * from './inspectTable.js';
export * from './listTables.js';
export * from './reconnect.js';

export function setupTools(server: Server, db: DatabaseService) {
  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        QUERY_TOOL,
        LIST_TABLES_TOOL,
        INSPECT_DATABASE_TOOL,
        INSPECT_SCHEMA_TOOL,
        INSPECT_TABLE_TOOL,
        CLEAR_CACHE_TOOL,
        RECONNECT_TOOL,
      ],
    };
  });

  // Register unified tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    console.error(`Tool call received: ${name} with args: ${JSON.stringify(args)}`);

    switch (name) {
      case QUERY_TOOL.name:
        return handleQueryTool(db, args as { sql: string });

      case CLEAR_CACHE_TOOL.name:
        return handleClearCacheTool(db);

      case INSPECT_DATABASE_TOOL.name:
        return handleInspectDatabaseTool(db, args as { filter?: string });

      case INSPECT_SCHEMA_TOOL.name:
        return handleInspectSchemaTool(db, args as { name: string; filter?: string });

      case INSPECT_TABLE_TOOL.name:
        return handleInspectTableTool(db, args as { name: string; schema?: string });

      case LIST_TABLES_TOOL.name:
        console.error(`Executing list_tables tool with args: ${JSON.stringify(args)}`);
        return handleListTablesTool(db, args as { schema?: string; filter?: string });
        
      case RECONNECT_TOOL.name:
        console.error(`Executing reconnect tool with args: ${JSON.stringify(args)}`);
        return handleReconnectTool(db, args as { database_path?: string });

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });
} 