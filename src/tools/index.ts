import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { DatabaseService } from "../services/database.js";
import { QUERY_TOOL, handleQueryTool } from './query.js';
import { RECONNECT_TOOL, handleReconnectTool } from './reconnect.js';
import { PARTITION_LIST_TOOL, handlePartitionListTool } from './partitionList.js';
import { TABLE_LIST_TOOL, handleTableListTool } from './tableList.js';
import { TABLE_SHOW_TOOL, handleTableShowTool } from './tableShow.js';

export * from './query.js';
export * from './reconnect.js';
export * from './partitionList.js';
export * from './tableList.js';
export * from './tableShow.js';

export function setupTools(server: Server, db: DatabaseService) {
  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        QUERY_TOOL,
        RECONNECT_TOOL,
        PARTITION_LIST_TOOL,
        TABLE_LIST_TOOL,
        TABLE_SHOW_TOOL,
      ],
    };
  });

  // Register unified tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case QUERY_TOOL.name:
        return handleQueryTool(db, args as { sql: string });
        
      case RECONNECT_TOOL.name:
        return handleReconnectTool(db, args as { database_path?: string });

      case PARTITION_LIST_TOOL.name:
        return handlePartitionListTool();

      case TABLE_LIST_TOOL.name:
        return handleTableListTool();

      case TABLE_SHOW_TOOL.name:
        return handleTableShowTool(args as { name: string });

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });
} 