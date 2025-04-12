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
    logger.info(`Database path provided via ${process.env.TAILPIPE_MCP_DATABASE_PATH ? 'environment variable' : 'command line argument'}: ${providedDatabasePath}`);
    const resolvedPath = resolve(providedDatabasePath);
    logger.info(`Resolved database path to: ${resolvedPath}`);
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
    const tailpipePath = await getDatabasePathFromTailpipe();
    logger.info(`Successfully obtained database path from Tailpipe CLI: ${tailpipePath}`);
    return tailpipePath;
  } catch (error) {
    logger.error('Failed to get database path from Tailpipe CLI:', error instanceof Error ? error.message : String(error));
    logger.error('Please install Tailpipe CLI or provide a database path directly.');
    process.exit(1);
  }
}

// Initialize database service
async function initializeDatabase(): Promise<DatabaseService> {
  try {
    logger.info("Getting database path...");
    const databasePath = await getDatabasePath();
    logger.info(`Database path resolved to: ${databasePath}`);
    
    // Track how the path was obtained so reconnect can use the same method
    const sourceType = providedDatabasePath ? 'cli-arg' : 'tailpipe';
    logger.info(`Database path source type: ${sourceType}`);
    
    logger.info("Creating new DatabaseService instance and initializing connection...");
    const dbService = new DatabaseService(databasePath, sourceType);
    
    // The constructor will handle initialization and testing
    // Let's verify the connection works with a simple query
    try {
      logger.info("Testing database connection...");
      await dbService.executeQuery("SELECT 1 as test");
      logger.info("Database connection verified successfully");
    } catch (testError) {
      logger.error("Database connection test failed:", testError instanceof Error ? testError.message : String(testError));
      throw testError;
    }
    
    return dbService;
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error("Database initialization failed:", error.message);
    } else {
      logger.error("Database initialization failed:", error);
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

// Store transport reference for cleanup
let transport: StdioServerTransport;

// Handle graceful shutdown
function setupShutdownHandlers(db: DatabaseService) {
  const gracefulShutdown = async () => {
    logger.info("Shutting down MCP server...");

    if (transport) {
      try {
        await transport.close();
        logger.info("Transport connection closed");
      } catch (error) {
        logger.error(`Error closing transport: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (db) {
      try {
        await db.close();
        logger.info("Database connection closed");
      } catch (error) {
        logger.error(`Error closing database: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => {
    logger.info("Received SIGTERM signal");
    gracefulShutdown();
  });
  process.on('SIGINT', () => {
    logger.info("Received SIGINT signal");
    gracefulShutdown();
  });
}

// Start server
async function startServer() {
  try {
    logger.info("Starting MCP server...");
    
    // Initialize database
    logger.info("Initializing database connection...");
    const db = await initializeDatabase();
    logger.info("Database connection initialized successfully");
    
    // Set up shutdown handlers
    logger.info("Setting up shutdown handlers...");
    setupShutdownHandlers(db);
    logger.info("Shutdown handlers configured");

    // Record server start time for status resource
    process.env.SERVER_START_TIME = new Date().toISOString();
    logger.info(`Server start time recorded: ${process.env.SERVER_START_TIME}`);

    // Set up handlers
    logger.info("Configuring server handlers...");
    setupTools(server, db);
    setupPrompts(server);
    setupResourceHandlers(server, db);
    logger.info("Server handlers configured");

    // Connect transport
    logger.info("Initializing transport connection...");
    transport = new StdioServerTransport();

    // Connect to transport and handle any errors
    try {
      await server.connect(transport);
      logger.info("Transport connection established");
    } catch (error) {
      logger.error(`Failed to connect transport: ${error instanceof Error ? error.message : String(error)}`);
      // Don't crash the process, just log the error
    }
    
    logger.info("MCP server started successfully");
  } catch (error: unknown) {
    logger.error(`Failed to start server: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

startServer();
