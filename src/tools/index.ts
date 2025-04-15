import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolRequest, type Tool, type ServerResult } from "@modelcontextprotocol/sdk/types.js";
import { DatabaseService } from "../services/database.js";
import AjvModule from "ajv";
import { logger } from "../services/logger.js";

// Database Operations
import { tool as queryTool } from './tailpipe_query.js';
import { tool as reconnectTool } from './tailpipe_reconnect.js';

// Data Structure Operations
import { tool as partitionListTool } from './tailpipe_partition_list.js';
import { tool as partitionShowTool } from './tailpipe_partition_show.js';
import { tool as tableListTool } from './tailpipe_table_list.js';
import { tool as tableShowTool } from './tailpipe_table_show.js';

// Plugin Operations
import { tool as pluginListTool } from './tailpipe_plugin_list.js';
import { tool as pluginShowTool } from './tailpipe_plugin_show.js';

// Source Operations
import { tool as sourceListTool } from './tailpipe_source_list.js';
import { tool as sourceShowTool } from './tailpipe_source_show.js';

// Initialize JSON Schema validator
const Ajv = AjvModule.default || AjvModule;
const ajv = new Ajv();

// Export all tools for server capabilities
export const tools = {
  // Database Operations
  tailpipe_query: queryTool,          // Core database query functionality
  tailpipe_reconnect: reconnectTool,  // Database connection management

  // Data Structure Operations
  tailpipe_partition_list: partitionListTool,  // List available partitions
  tailpipe_partition_show: partitionShowTool,  // Show partition details
  tailpipe_table_list: tableListTool,         // List available tables
  tailpipe_table_show: tableShowTool,         // Show table details

  // Plugin Operations
  tailpipe_plugin_list: pluginListTool,       // List available plugins
  tailpipe_plugin_show: pluginShowTool,       // Show plugin details

  // Source Operations
  tailpipe_source_list: sourceListTool,       // List available sources
  tailpipe_source_show: sourceShowTool        // Show source details
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
    const { name, arguments: args = {} } = request.params;
    const tool = tools[name as keyof typeof tools];

    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    if (!tool.handler) {
      throw new Error(`Tool ${name} has no handler defined`);
    }

    // Validate arguments against the tool's schema
    if (tool.inputSchema) {
      const validate = ajv.compile(tool.inputSchema);
      if (!validate(args)) {
        logger.error(`Invalid arguments for tool ${name}:`, validate.errors);
        return {
          isError: true,
          content: [{
            type: "text",
            text: `Invalid arguments for tool ${name}: ${ajv.errorsText(validate.errors)}`
          }]
        };
      }
    }

    // Special handling for database-dependent tools
    if (name === 'tailpipe_query' || name === 'tailpipe_reconnect') {
      return await (tool.handler as (db: DatabaseService, args: unknown) => Promise<ServerResult>)(db, args);
    }

    // Standard tool handling
    return await (tool.handler as (args: unknown) => Promise<ServerResult>)(args);
  });
} 