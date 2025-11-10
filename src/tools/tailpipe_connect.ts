import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { DatabaseService, type DatabaseSourceType } from "../services/database.js";
import { logger } from "../services/logger.js";
import { formatCommandError } from "../utils/command.js";
import { validateAndFormat } from "../utils/format.js";
import { buildTailpipeCommand } from "../utils/tailpipe.js";

export const tool: Tool = {
  name: "tailpipe_connect",
  description: "Initialize DuckDB using a Tailpipe init SQL script, optionally specifying a new init script path.",
  inputSchema: {
    type: "object",
    properties: {
      init_script_path: {
        type: "string",
        description: "Optional path to the Tailpipe init SQL script. If not provided, refreshes the current connection."
      }
    },
    additionalProperties: false
  },
  handler: async (db: DatabaseService, args: { init_script_path?: string }) => {
    logger.debug('Executing connect_tailpipe tool');

    try {
      // Close the current connection first
      logger.info('Closing current database connection...');
      await db.close();
      
      // Create a new database service instance
      const newDb = await DatabaseService.create(args.init_script_path);
      
      // Update the current database service with the new config
      await db.setDatabaseConfig({
        initScriptPath: newDb.initScriptPath,
        sourceType: newDb.sourceType
      });
      
      // Close the temporary service
      await newDb.close();
      
      const result = {
        connection: {
          success: true,
          init_script_path: db.initScriptPath,
          source: db.sourceType === 'tailpipe' ? 'tailpipe CLI' : 'provided argument',
          status: "connected"
        },
        debug: {
          command: buildTailpipeCommand(`connect ${args.init_script_path || ''}`)
        }
      };
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result)
        }]
      };
    } catch (error) {
      logger.error('Failed to execute connect_tailpipe tool:', error instanceof Error ? error.message : String(error));
      return formatCommandError(error, 'connect_tailpipe');
    }
  }
};