#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DatabaseService, getDatabasePathFromTailpipe } from "./services/database.js";
import { setupTools, tools } from "./tools/index.js";
import { setupPrompts, prompts } from "./prompts/index.js";
import { setupResourceHandlers, resources } from "./resources/index.js";
import { existsSync } from "fs";
import { resolve } from "path";
import { logger } from "./services/logger.js";

// Server metadata
const SERVER_INFO = {
  name: "tailpipe",
  version: "0.1.0",
  description: "Use Tailpipe to explore and query your cloud and security logs with SQL.",
  vendor: "Turbot",
  homepage: "https://github.com/turbot/tailpipe-mcp",
} as const;

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
async function initializeDatabase(): Promise<DatabaseService> {
  try {
    const databasePath = await getDatabasePath();
    // Track how the path was obtained so reconnect can use the same method
    const sourceType = providedDatabasePath ? 'cli-arg' : 'tailpipe';
    return new DatabaseService(databasePath, sourceType);
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error("Failed to initialize database connection:", error.message);
    } else {
      logger.error("Failed to initialize database connection:", error);
    }
    process.exit(1);
  }
}

// Create MCP server
const server = new Server(
  SERVER_INFO,
  {
    capabilities: {
      tools,
      prompts,
      resources
    }
  }
);

// Handle graceful shutdown
function setupShutdownHandlers(db: DatabaseService) {
  const gracefulShutdown = async () => {
    await db.close();
    process.exit(0);
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}

// Start server
async function startServer() {
  try {
    // Initialize database
    const db = await initializeDatabase();
    
    // Set up shutdown handlers
    setupShutdownHandlers(db);

    // Record server start time for status resource
    process.env.SERVER_START_TIME = new Date().toISOString();

    // Set up handlers
    setupTools(server, db);
    setupPrompts(server);
    setupResourceHandlers(server, db);

    // Connect transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    logger.info("MCP server started successfully");
  } catch (error: unknown) {
    logger.error(`Failed to start server: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

startServer();
