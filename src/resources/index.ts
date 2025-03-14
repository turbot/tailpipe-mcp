import { ReadResourceRequestSchema, ListResourcesRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { DatabaseService } from "../services/database.js";
import { handleSchemaResource } from "./schema.js";
import { handleTableResource } from "./table.js";

export function setupResourceHandlers(server: Server, db: DatabaseService) {
  // Add resources/list handler
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    // Check if we're running in Claude Desktop with tailpipe
    const dbPath = (db as any).databasePath || '';
    const isClaudeDesktopTailpipe = dbPath.includes('tailpipe_');
    
    if (isClaudeDesktopTailpipe) {
      console.error("Special handling for Claude Desktop Tailpipe database");
    }
    
    try {
      // First, try to get a minimal set of resources if the database is available
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
        
        // For Claude Desktop tailpipe, ensure we have at least the main schema
        if (isClaudeDesktopTailpipe && !resources.some(r => r.name === 'main')) {
          console.error("Adding main schema for Claude Desktop");
          resources.push({
            uri: "postgresql://schema/main",
            name: "main",
            type: "Schema",
            description: "The main schema"
          });
        }
        
        return { resources };
      } catch (dbError) {
        // Log the database error but don't fail
        console.error("Database error listing resources:", dbError instanceof Error ? dbError.message : String(dbError));
        
        // For Claude Desktop, provide extra diagnostic information
        if (isClaudeDesktopTailpipe) {
          console.error("Claude Desktop: Using fallback resource list due to connection error");
        }
        
        // Attempt to get at least the main schema as a fallback when DB query fails
        // This ensures clients always have at least one resource to work with
        const fallbackResources = [
          {
            uri: "postgresql://schema/main",
            name: "main",
            type: "Schema",
            description: "The main schema"
          }
        ];
        
        // For Claude Desktop, also add some typical schemas
        if (isClaudeDesktopTailpipe) {
          fallbackResources.push({
            uri: "postgresql://schema/aws",
            name: "aws",
            type: "Schema",
            description: "AWS resources"
          });
        }
        
        return { resources: fallbackResources };
      }
    } catch (error) {
      // Log the error but don't fail - return default resources
      if (error instanceof Error) {
        console.error("Critical error listing resources:", error.message);
      } else {
        console.error("Critical error listing resources:", error);
      }
      
      // Provide at least a default resource rather than an empty list
      return { 
        resources: [
          {
            uri: "postgresql://schema/main",
            name: "main",
            type: "Schema",
            description: "The main schema"
          }
        ] 
      };
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