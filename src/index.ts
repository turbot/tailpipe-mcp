#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DatabaseService } from "./services/database.js";
import { setupTools } from "./tools/index.js";
import { setupPrompts } from "./prompts/index.js";
import { setupResourceTemplatesList } from "./resourceTemplates/list.js";
import { setupResourceHandlers } from "./resources/index.js";
import { existsSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";

// Parse command line arguments
const args = process.argv.slice(2);
const providedDatabasePath = args[0];

// Get the database path, either from command line or from Tailpipe CLI
async function getDatabasePath(): Promise<string> {
  // If a database path was provided directly, use that
  if (providedDatabasePath) {
    const resolvedPath = resolve(providedDatabasePath);
    if (!existsSync(resolvedPath)) {
      console.error('Database file does not exist:', resolvedPath);
      console.error('Please provide a valid DuckDB database file path');
      process.exit(1);
    }
    console.error(`Using provided database path: ${resolvedPath}`);
    return resolvedPath;
  }
  
  // Skip Tailpipe CLI if environment variable is set (for testing purposes)
  if (process.env.SKIP_TAILPIPE_CLI === 'true') {
    console.error('SKIP_TAILPIPE_CLI is set, not attempting to use Tailpipe CLI');
    console.error('Please provide a database path directly when SKIP_TAILPIPE_CLI is set');
    process.exit(1);
  }
  
  // Otherwise, try to use the Tailpipe CLI to get the database path
  try {
    console.error('No database path provided, attempting to use Tailpipe CLI...');
    const output = execSync('tailpipe connect --output json', { encoding: 'utf-8' });
    
    try {
      const result = JSON.parse(output);
      
      if (result?.database_filepath) {
        const resolvedPath = resolve(result.database_filepath);
        console.error(`Using Tailpipe database path: ${resolvedPath}`);
        
        if (!existsSync(resolvedPath)) {
          console.error('Tailpipe database file does not exist:', resolvedPath);
          process.exit(1);
        }
        
        return resolvedPath;
      } else {
        console.error('Tailpipe connect output JSON:', JSON.stringify(result));
        throw new Error('Tailpipe connect output missing database_filepath field');
      }
    } catch (parseError) {
      console.error('Failed to parse Tailpipe CLI output:', parseError instanceof Error ? parseError.message : String(parseError));
      console.error('Tailpipe output:', output);
      process.exit(1);
    }
  } catch (cliError) {
    console.error('Failed to run Tailpipe CLI. Is it installed?');
    console.error(cliError instanceof Error ? cliError.message : String(cliError));
    console.error('Please install Tailpipe CLI or provide a database path directly.');
    process.exit(1);
  }
  
  // This line should never be reached due to the previous error handling
  return '';
}

// Initialize database service
let db: DatabaseService;
try {
  const databasePath = await getDatabasePath();
  // Track how the path was obtained so reconnect can use the same method
  const sourceType = providedDatabasePath ? 'cli-arg' : 'tailpipe';
  db = new DatabaseService(databasePath, sourceType);
} catch (error: unknown) {
  if (error instanceof Error) {
    console.error("Failed to initialize database connection:", error.message);
  } else {
    console.error("Failed to initialize database connection:", error);
  }
  process.exit(1);
}

// Initialize server
const server = new Server(
  {
    name: "tailpipe",
    version: "0.1.0",
    description: "Exploring and query Tailpipe data. Provides tools to browse schemas, inspect tables, and execute read-only SQL queries against your Tailpipe database.",
    vendor: "Turbot",
    homepage: "https://github.com/turbot/tailpipe-mcp",
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
      resources: {},
    }
  }
);

// Set up handlers
setupTools(server, db);
setupResourceTemplatesList(server);
setupResourceHandlers(server, db);
setupPrompts(server);

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  await db.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await db.close();
  process.exit(0);
});

// Start the server
async function runServer() {
  // Record server start time for status resource
  process.env.SERVER_START_TIME = new Date().toISOString();
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Signal successful startup for tests
  console.error("MCP server started successfully"); // Use stderr so it doesn't interfere with MCP protocol
}

// Immediately invoked function to allow for top-level await
(async () => {
  try {
    await runServer();
  } catch (error) {
    console.error("Server error:", error instanceof Error ? error.message : String(error));
    await db.close().catch(e => {
      console.error("Error closing database:", e instanceof Error ? e.message : String(e));
    });
    process.exit(1);
  }
})();
