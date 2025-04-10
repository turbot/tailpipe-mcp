import { DatabaseService, getDatabasePathFromTailpipe } from "../services/database.js";
import { resolve } from "path";
import { existsSync } from "fs";
import { logger } from "../services/logger.js";
import { formatCommandError } from "../utils/command.js";

export const RECONNECT_TOOL = {
  name: "reconnect_tailpipe",
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
  logger.debug('Executing reconnect_tailpipe tool');

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
        const error = new Error(`Database file does not exist: ${newDatabasePath}`);
        logger.error(error.message);
        return formatCommandError(error, 'reconnect');
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
          logger.error('Failed to get database path from Tailpipe:', error instanceof Error ? error.message : String(error));
          return formatCommandError(error, 'reconnect - getting database path from Tailpipe');
        }
      }
    }
    
    // Update the database path and source type in the DatabaseService
    db.databasePath = newDatabasePath;
    // Update source type based on how we got the new path
    db.sourceType = source.includes('tailpipe') ? 'tailpipe' : 'cli-arg';
    
    logger.info(`Reconnecting to database: ${newDatabasePath}`);
    
    try {
      // Reinitialize database connection
      await db.initializeDatabase();
      
      // Test the connection
      await db.executeQuery("SELECT 1");
      
      logger.info(`Successfully reconnected to database: ${newDatabasePath}`);
      
      // Return success message
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
            status: "connected"
          }, null, 2)
        }],
        isError: false
      };
    } catch (error) {
      logger.error('Failed to initialize database connection:', error instanceof Error ? error.message : String(error));
      return formatCommandError(error, `reconnect - initializing connection to ${newDatabasePath}`);
    }
  } catch (error) {
    logger.error('Failed to execute reconnect_tailpipe tool:', error instanceof Error ? error.message : String(error));
    return formatCommandError(error, 'reconnect');
  }
}