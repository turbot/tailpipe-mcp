import { ReadResourceRequestSchema, ListResourcesRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { DatabaseService } from "../services/database.js";
import { handleStatusResource } from "./status.js";
import { logger } from '../services/logger.js';

export function setupResourceHandlers(server: Server, db: DatabaseService) {
  // Add resources/list handler
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

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    try {
      const result = await handleStatusResource(uri, db);

      if (!result) {
        throw new Error(`Invalid resource URI: ${uri}. Expected format: tailpipe://status`);
      }

      return result;
    } catch (error) {
      // Just wrap the error with the URI context
      throw new Error(`Failed to access resource ${uri}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
} 