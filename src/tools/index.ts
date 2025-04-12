import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolRequest, type Tool, type ServerResult } from "@modelcontextprotocol/sdk/types.js";
import { DatabaseService } from "../services/database.js";

// Database Operations
import { tool as queryTool } from './query_tailpipe.js';
import { tool as reconnectTool } from './reconnect.js';

// Data Structure Operations
import { tool as partitionListTool } from './partition_list.js';
import { tool as partitionShowTool } from './partition_show.js';
import { tool as tableListTool } from './table_list.js';
import { tool as tableShowTool } from './table_show.js';

// Plugin Operations
import { tool as pluginListTool } from './plugin_list.js';
import { tool as pluginShowTool } from './plugin_show.js';

// Source Operations
import { tool as sourceListTool } from './source_list.js';
import { tool as sourceShowTool } from './source_show.js';

// Export all tools for server capabilities
export const tools = {
  // Database Operations
  query_tailpipe: queryTool,          // Core database query functionality
  reconnect_tailpipe: reconnectTool,  // Database connection management

  // Data Structure Operations
  partition_list: partitionListTool,  // List available partitions
  partition_show: partitionShowTool,  // Show partition details
  table_list: tableListTool,         // List available tables
  table_show: tableShowTool,         // Show table details

  // Plugin Operations
  plugin_list: pluginListTool,       // List available plugins
  plugin_show: pluginShowTool,       // Show plugin details

  // Source Operations
  source_list: sourceListTool,       // List available sources
  source_show: sourceShowTool        // Show source details
};

// Initialize tool handlers
export function setupTools(server: Server, db: DatabaseService) {
  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: Object.values(tools),
    };
  });

  // Register tool handlers
  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
    const { name, arguments: args } = request.params;
    const tool = tools[name as keyof typeof tools];

    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    if (!tool.handler) {
      throw new Error(`Tool ${name} has no handler defined`);
    }

    // Special handling for database-dependent tools
    if (name === 'query_tailpipe' || name === 'reconnect_tailpipe') {
      return await (tool.handler as (db: DatabaseService, args: unknown) => Promise<ServerResult>)(db, args || {});
    }

    // Standard tool handling
    return await (tool.handler as (args: unknown) => Promise<ServerResult>)(args || {});
  });
} 