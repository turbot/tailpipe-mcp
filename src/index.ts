#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DatabaseService, getDatabasePathFromTailpipe } from "./services/database.js";
import { setupTools } from "./tools/index.js";
import { setupPrompts } from "./prompts/index.js";
import { setupResourceHandlers } from "./resources/index.js";
import { existsSync } from "fs";
import { resolve } from "path";
import { logger } from "./services/logger.js";

// Parse command line arguments
const args = process.argv.slice(2);
const providedDatabasePath = args[0] || process.env.TAILPIPE_MCP_DATABASE_PATH;

// Get the database path, either from command line or from Tailpipe CLI
async function getDatabasePath(): Promise<string> {
  // If a database path was provided directly, use that
  if (providedDatabasePath) {
    const resolvedPath = resolve(providedDatabasePath);
    if (!existsSync(resolvedPath)) {
      logger.error('Database file does not exist:', resolvedPath);
      logger.error('Please provide a valid DuckDB database file path');
      process.exit(1);
    }
    logger.info(`Using provided database path: ${resolvedPath}`);
    return resolvedPath;
  }
  
  // Otherwise, use the shared function to get the database path from Tailpipe CLI
  try {
    logger.info('No database path provided, attempting to use Tailpipe CLI...');
    return await getDatabasePathFromTailpipe();
  } catch (error) {
    logger.error('Failed to get database path from Tailpipe CLI:', error instanceof Error ? error.message : String(error));
    logger.error('Please install Tailpipe CLI or provide a database path directly.');
    process.exit(1);
  }
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
    logger.error("Failed to initialize database connection:", error.message);
  } else {
    logger.error("Failed to initialize database connection:", error);
  }
  process.exit(1);
}

// Initialize server
const server = new Server(
  {
    name: "tailpipe",
    version: "0.1.0",
    description: "Use Tailpipe to explore and query your cloud and security logs with SQL.",
    vendor: "Turbot",
    homepage: "https://github.com/turbot/tailpipe-mcp",
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
      resources: {}
    }
  }
);

// Set up handlers
setupTools(server, db);
setupPrompts(server);
setupResourceHandlers(server, db);

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
  logger.info("MCP server started successfully"); // Using stderr doesn't interfere with MCP protocol
}

// Immediately invoked function to allow for top-level await
(async () => {
  try {
    await runServer();
  } catch (error) {
    logger.error("Server error:", error instanceof Error ? error.message : String(error));
    await db.close().catch(e => {
      logger.error("Error closing database:", e instanceof Error ? e.message : String(e));
    });
    process.exit(1);
  }
})();
