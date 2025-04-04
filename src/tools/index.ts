import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { DatabaseService } from "../services/database.js";
import { QUERY_TOOL, handleQueryTool } from './query.js';
import { RECONNECT_TOOL, handleReconnectTool } from './reconnect.js';
import { PARTITION_LIST_TOOL, handlePartitionListTool } from './partition_list.js';
import { TABLE_LIST_TOOL, handleTableListTool } from './table_list.js';
import { TABLE_SHOW_TOOL, handleTableShowTool } from './table_show.js';
import { PLUGIN_LIST_TOOL, handlePluginListTool } from './plugin_list.js';
import { PLUGIN_SHOW_TOOL, handlePluginShowTool } from './plugin_show.js';

export * from './query.js';
export * from './reconnect.js';
export * from './partition_list.js';
export * from './table_list.js';
export * from './table_show.js';
export * from './plugin_list.js';
export * from './plugin_show.js';

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
        PLUGIN_LIST_TOOL,
        PLUGIN_SHOW_TOOL,
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

      case PLUGIN_LIST_TOOL.name:
        return handlePluginListTool();

      case PLUGIN_SHOW_TOOL.name:
        return handlePluginShowTool(args as { name: string });

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });
} 