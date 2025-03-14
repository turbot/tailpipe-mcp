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

const DEFAULT_DATABASE_PATH = "./tailpipe.db";

// Parse command line arguments
const args = process.argv.slice(2);
const databasePath = args[0] || DEFAULT_DATABASE_PATH;

// Validate database path
const resolvedPath = resolve(databasePath);

if (!existsSync(resolvedPath)) {
  console.error('Database file does not exist:', resolvedPath);
  console.error('Please provide a valid DuckDB database file path');
  process.exit(1);
}

// Initialize database service
let db: DatabaseService;
try {
  db = new DatabaseService(resolvedPath);
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
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Signal successful startup for tests
  console.error("MCP server started successfully"); // Use stderr so it doesn't interfere with MCP protocol
}

runServer().catch((error) => {
  console.error("Server error:", error);
  db.close().finally(() => process.exit(1));
});
