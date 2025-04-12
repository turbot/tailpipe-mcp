import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { DatabaseService, getDatabasePathFromTailpipe } from "../services/database.js";
import { resolve } from "path";
import { existsSync } from "fs";
import { logger } from "../services/logger.js";
import { formatCommandError } from "../utils/command.js";

interface DatabaseConnection {
  path: string;
  source: string;
  status: string;
}

function formatResult(connection: DatabaseConnection) {
  return {
    content: [{ 
      type: "text", 
      text: JSON.stringify({
        success: true,
        message: `Successfully reconnected to database`,
        database: connection,
        status: connection.status
      }, null, 2)
    }],
    isError: false
  };
}

async function getDatabasePath(db: DatabaseService, providedPath?: string): Promise<{ path: string; source: string }> {
  if (providedPath) {
    const path = resolve(providedPath);
    if (!existsSync(path)) {
      throw new Error(`Database file does not exist: ${path}`);
    }
    return { path, source: 'provided argument' };
  }

  // Check how the original database path was obtained
  const wasProvidedAsArg = process.argv.length > 2;
  const dbSourceType = (db as any).sourceType || (wasProvidedAsArg ? 'cli-arg' : 'tailpipe');
  
  if (dbSourceType === 'cli-arg' && wasProvidedAsArg) {
    // If the original path was from command line, reuse it
    return {
      path: resolve(process.argv[2]),
      source: 'original command line argument'
    };
  }

  // Either it was originally from tailpipe or we don't know the source
  logger.info('Using Tailpipe CLI for reconnection');
  const path = await getDatabasePathFromTailpipe();
  return { path, source: 'tailpipe CLI connection' };
}

export const tool: Tool = {
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
  },
  handler: async (db: DatabaseService, args: { database_path?: string }) => {
    logger.debug('Executing reconnect_tailpipe tool');

    try {
      // Close the current connection first
      logger.info('Closing current database connection...');
      await db.close();
      
      // Get the new database path
      const { path: newDatabasePath, source } = await getDatabasePath(db, args.database_path);
      logger.debug(`Reconnect: Using database path: ${newDatabasePath} from ${source}`);
      
      // Update the database path and source type
      db.databasePath = newDatabasePath;
      db.sourceType = source.includes('tailpipe') ? 'tailpipe' : 'cli-arg';
      
      logger.info(`Reconnecting to database: ${newDatabasePath}`);
      
      // Reinitialize and test connection
      await db.initializeDatabase();
      await db.executeQuery("SELECT 1");
      
      logger.info(`Successfully reconnected to database: ${newDatabasePath}`);
      
      return formatResult({
        path: newDatabasePath,
        source,
        status: "connected"
      });
    } catch (error) {
      logger.error('Failed to execute reconnect_tailpipe tool:', error instanceof Error ? error.message : String(error));
      return formatCommandError(error, 'reconnect');
    }
  }
};