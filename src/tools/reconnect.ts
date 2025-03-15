import { DatabaseService, getDatabasePathFromTailpipe } from "../services/database.js";
import { resolve } from "path";
import { existsSync } from "fs";
import { logger } from "../services/logger.js";

export const RECONNECT_TOOL = {
  name: "reconnect",
  description: "Reconnect to the database, optionally using a new database path",
  inputSchema: {
    type: "object",
    properties: {
      database_path: {
        type: "string",
        description: "Optional new database path to connect to"
      }
    }
  }
} as const;

export async function handleReconnectTool(db: DatabaseService, args: { database_path?: string }) {
  try {
    // Close the current connection first
    logger.info('Closing current database connection...');
    await db.close();
    
    // Determine the new database path
    let newDatabasePath: string;
    let source: string;
    
    if (args.database_path) {
      // Use the provided path
      newDatabasePath = resolve(args.database_path);
      source = 'provided argument';
      logger.debug(`Reconnect: Using provided database path: ${newDatabasePath}`);
      
      // Verify the database exists
      if (!existsSync(newDatabasePath)) {
        logger.error(`Database file does not exist: ${newDatabasePath}`);
        return {
          content: [{ 
            type: "text", 
            text: `Error: Database file does not exist: ${newDatabasePath}` 
          }],
          isError: true
        };
      }
    } else {
      // Check how the original database path was obtained
      const wasProvidedAsArg = process.argv.length > 2;
      const dbSourceType = (db as any).sourceType || (wasProvidedAsArg ? 'cli-arg' : 'tailpipe');
      
      if (dbSourceType === 'cli-arg' && wasProvidedAsArg) {
        // If the original path was from command line, reuse it
        newDatabasePath = resolve(process.argv[2]);
        source = 'original command line argument';
        logger.debug(`Reconnect: Using original command line path: ${newDatabasePath}`);
      } else {
        // Either it was originally from tailpipe or we don't know the source
        // so use tailpipe CLI to get a fresh connection
        logger.info('Using Tailpipe CLI for reconnection');
        try {
          // Get a fresh path from Tailpipe CLI
          newDatabasePath = await getDatabasePathFromTailpipe();
          source = 'tailpipe CLI connection';
          logger.debug(`Reconnect: Got path from Tailpipe CLI: ${newDatabasePath}`);
        } catch (error) {
          logger.error('Failed to get database path from Tailpipe CLI', error);
          return {
            content: [{ 
              type: "text", 
              text: `Error: ${error instanceof Error ? error.message : String(error)}` 
            }],
            isError: true
          };
        }
      }
    }
    
    // Update the database path and source type in the DatabaseService
    db.databasePath = newDatabasePath;
    // Update source type based on how we got the new path
    db.sourceType = source.includes('tailpipe') ? 'tailpipe' : 'cli-arg';
    
    // Try to initialize the database connection
    try {
      logger.info(`Reconnecting to database: ${newDatabasePath}`);
      
      // Reinitialize database connection
      await db.initializeDatabase();
      
      // Test the connection
      await db.executeQuery("SELECT 1");
      
      logger.info(`Successfully reconnected to database: ${newDatabasePath}`);
      
      // If successful, return success message
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({
            success: true,
            message: `Successfully reconnected to database`,
            database: {
              path: newDatabasePath,
              source: source
            },
            status: "Connected"
          }, null, 2)
        }],
        isError: false
      };
    } catch (error) {
      logger.error(`Error reconnecting to database: ${newDatabasePath}`, error);
      return {
        content: [{ 
          type: "text", 
          text: `Error reconnecting to database: ${error instanceof Error ? error.message : String(error)}` 
        }],
        isError: true
      };
    }
  } catch (error) {
    logger.error('Error during reconnection process', error);
    return {
      content: [{ 
        type: "text", 
        text: `Error during reconnection: ${error instanceof Error ? error.message : String(error)}` 
      }],
      isError: true
    };
  }
}