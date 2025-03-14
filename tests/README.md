# Tailpipe MCP Test Suite

This directory contains various test scripts to help test the Tailpipe MCP server functionality.

## Available Tests

All tests can be run from the project root using npm scripts:

### `npm test` (conversation.js)
A complete end-to-end test that:
- Creates a temporary test database with sample data
- Starts the MCP server
- Runs a series of MCP protocol requests (hello, tools listing, queries)
- Displays both requests and responses
- Automatically cleans up when done

This is the main test to verify the full functionality of the MCP server.

### `npm run test:duckdb` (duckdb.js)
Tests only the DuckDB functionality:
- Creates a database
- Creates a table with sample data
- Runs a simple query
- Verifies results

Use this test to isolate issues with the DuckDB connection.

### `npm run test:simple` (simple.js)
A minimal test that:
- Creates a basic database
- Starts the MCP server
- Exits after startup confirmation

Useful for quick validation of basic functionality.

### `npm run test:setup` (manual-setup.js)
Setup tool for manual testing:
- Creates a test database with sample data
- Outputs the database path
- Provides instructions for manual testing
- Creates a file with sample MCP requests

Use this for interactive testing and debugging.

### `npm run test:mcp` (mcp.js)
More detailed MCP server test that:
- Creates a test database with more complex data
- Tests individual MCP protocol endpoints
- Includes detailed logging of request/response flows

## Temporary Files

All tests create files in a `.tmp-test` directory in the project root. Each test script is designed to automatically clean up after itself, but if tests are interrupted or fail, you might need to clean up manually.

You can easily clean up any leftover test files with:

```bash
npm run clean:tests
```

This will remove the `.tmp-test` directory and all its contents.