import { DatabaseService } from "../services/database.js";
import { execSync } from "child_process";
import { resolve } from "path";
import { existsSync } from "fs";

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

// Get database path using Tailpipe CLI
async function getDatabasePathFromTailpipe(): Promise<string> {
  try {
    console.error('Getting new database path from Tailpipe CLI...');
    if (process.env.DEBUG_TAILPIPE === 'true') {
      console.error('PATH environment variable:', process.env.PATH);
      console.error('Which tailpipe:', execSync('which tailpipe || echo "not found"', { encoding: 'utf-8' }));
    }
    const output = execSync('tailpipe connect --output json', { encoding: 'utf-8' });
    
    try {
      const result = JSON.parse(output);
      
      if (result?.database_filepath) {
        const resolvedPath = resolve(result.database_filepath);
        console.error(`Using Tailpipe database path: ${resolvedPath}`);
        
        if (!existsSync(resolvedPath)) {
          throw new Error(`Tailpipe database file does not exist: ${resolvedPath}`);
        }
        
        return resolvedPath;
      } else {
        console.error('Tailpipe connect output JSON:', JSON.stringify(result));
        throw new Error('Tailpipe connect output missing database_filepath field');
      }
    } catch (parseError) {
      console.error('Failed to parse Tailpipe CLI output:', parseError instanceof Error ? parseError.message : String(parseError));
      console.error('Tailpipe output:', output);
      throw new Error('Failed to parse Tailpipe CLI output');
    }
  } catch (error) {
    console.error('Failed to run Tailpipe CLI:', error instanceof Error ? error.message : String(error));
    throw new Error('Failed to get database path from Tailpipe CLI');
  }
}

export async function handleReconnectTool(db: DatabaseService, args: { database_path?: string }) {
  try {
    // Close the current connection first
    console.error('Closing current database connection...');
    await db.close();
    
    // Determine the new database path
    let newDatabasePath: string;
    let source: string;
    
    if (args.database_path) {
      // Use the provided path
      newDatabasePath = resolve(args.database_path);
      source = 'provided argument';
      
      // Verify the database exists
      if (!existsSync(newDatabasePath)) {
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
      } else {
        // Either it was originally from tailpipe or we don't know the source
        // so use tailpipe CLI to get a fresh connection
        console.error('Using Tailpipe CLI for reconnection');
        try {
          // Get a fresh path from Tailpipe CLI
          newDatabasePath = await getDatabasePathFromTailpipe();
          source = 'tailpipe CLI connection';
        } catch (error) {
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
      console.error(`Reconnecting to database: ${newDatabasePath}`);
      
      // Reinitialize database connection
      await db.initializeDatabase();
      
      // Test the connection
      await db.executeQuery("SELECT 1");
      
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
      return {
        content: [{ 
          type: "text", 
          text: `Error reconnecting to database: ${error instanceof Error ? error.message : String(error)}` 
        }],
        isError: true
      };
    }
  } catch (error) {
    return {
      content: [{ 
        type: "text", 
        text: `Error during reconnection: ${error instanceof Error ? error.message : String(error)}` 
      }],
      isError: true
    };
  }
}