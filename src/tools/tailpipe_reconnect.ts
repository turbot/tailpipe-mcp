import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { DatabaseService, type DatabaseSourceType } from "../services/database.js";
import { logger } from "../services/logger.js";
import { formatCommandError } from "../utils/command.js";
import { validateAndFormat } from "../utils/format.js";
import { buildTailpipeCommand } from "../utils/tailpipe.js";

export const tool: Tool = {
  name: "tailpipe_reconnect",
  description: `Reconnect to the Tailpipe database, optionally using a new database path.`,
  inputSchema: {
    type: "object",
    properties: {
      database_path: {
        type: "string",
        description: "Optional new database path to connect to"
      }
    },
    additionalProperties: false
  },
  handler: async (db: DatabaseService, args: { database_path?: string }) => {
    logger.debug('Executing reconnect_tailpipe tool');

    try {
      // Close the current connection first
      logger.info('Closing current database connection...');
      await db.close();
      
      // Create a new database service instance
      const newDb = await DatabaseService.create(args.database_path);
      
      // Update the current database service with the new config
      await db.setDatabaseConfig({
        path: newDb.databasePath,
        sourceType: newDb.sourceType
      });
      
      // Close the temporary service
      await newDb.close();
      
      const result = {
        connection: {
          success: true,
          path: db.databasePath,
          source: db.sourceType === 'tailpipe' ? 'tailpipe CLI' : 'provided argument',
          status: "connected"
        },
        debug: {
          command: buildTailpipeCommand(`connect ${args.database_path || ''}`)
        }
      };
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result)
        }]
      };
    } catch (error) {
      logger.error('Failed to execute reconnect_tailpipe tool:', error instanceof Error ? error.message : String(error));
      return formatCommandError(error, 'reconnect_tailpipe');
    }
  }
};