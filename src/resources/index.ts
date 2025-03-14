import { ReadResourceRequestSchema, ListResourcesRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { DatabaseService } from "../services/database.js";
import { handleSchemaResource } from "./schema.js";
import { handleTableResource } from "./table.js";

export function setupResourceHandlers(server: Server, db: DatabaseService) {
  // Add resources/list handler
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    try {
      // List available schemas for resource discovery
      const schemas = await db.executeQuery(
        "SELECT DISTINCT table_schema as name FROM information_schema.tables WHERE table_schema NOT IN ('information_schema', 'pg_catalog')"
      );
      
      // Format schemas as resources
      const resources = schemas.map(schema => ({
        uri: `postgresql://schema/${schema.name}`,
        name: schema.name,
        type: "Schema",
        description: `The ${schema.name} schema`
      }));
      
      return { resources };
    } catch (error) {
      console.error("Error listing resources:", error);
      return { resources: [] };
    }
  });
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    try {
      // Try each handler in sequence
      const result = await handleSchemaResource(uri, db) 
        || await handleTableResource(uri, db);

      if (!result) {
        throw new Error(`Invalid resource URI: ${uri}. Expected format: postgresql://schema/{name} or postgresql://table/{schema}/{name}`);
      }

      return result;
    } catch (error) {
      // Just wrap the error with the URI context
      throw new Error(`Failed to access resource ${uri}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
} 