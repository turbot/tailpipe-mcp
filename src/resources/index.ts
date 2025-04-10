import { ListResourcesRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { DatabaseService } from "../services/database.js";
import { handleStatusResource } from "./status.js";
import { logger } from '../services/logger.js';

// Export resources for server capabilities
export const resources = {};

export function setupResourceHandlers(server: Server, db: DatabaseService) {
  // Register resource list handler
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    try {
      // Always include status resource
      return { 
        resources: [
          {
            uri: "tailpipe://status",
            name: "status",
            type: "Status",
            description: "Server status information"
          }
        ] 
      };
    } catch (error) {
      // Log the error but don't fail - return default resources
      if (error instanceof Error) {
        logger.error("Critical error listing resources:", error.message);
      } else {
        logger.error("Critical error listing resources:", error);
      }
      
      // Provide at least the status resource
      return { 
        resources: [
          {
            uri: "tailpipe://status",
            name: "status",
            type: "Status",
            description: "Server status information"
          }
        ] 
      };
    }
  });

  // Register resource read handler
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    // Try each resource handler
    const result = await handleStatusResource(uri, db);
    if (result !== null) {
      return result;
    }

    throw new Error(`Unknown resource: ${uri}`);
  });
} 