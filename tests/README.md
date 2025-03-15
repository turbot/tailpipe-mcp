# Tailpipe MCP Test Suite

This directory contains the test suite for the Tailpipe MCP server. The tests are organized into categories and use Jest as the test runner.

## Test Structure

The tests are organized into the following directories:

- `db/`: Tests for database connections and the DatabaseService
- `tools/`: Tests for the MCP tools (list_tables, query, inspect_*)
- `server/`: Integration tests for the MCP server
- `resources/`: Tests for resources

## Running Tests

Tests can be run using npm scripts:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test categories
npm run test:db       # Run database tests
npm run test:tools    # Run tool tests
npm run test:resources # Run resource tests
npm run test:server   # Run server tests

# Run a specific test by name
npm test -- -t "DatabaseService"
```

## Legacy Tests

The original JavaScript-based tests are still available and can be run with:

```bash
npm run test:legacy
npm run test:legacy:duckdb
npm run test:legacy:consolidated
npm run test:legacy:simple
```

## Test Helpers

The `helpers.ts` file contains common utilities for tests:

- `getTestDatabasePath()`: Creates a unique database path for tests
- `createTestDatabase()`: Sets up a test database with sample data
- `cleanupDatabase()`: Cleans up test databases
- `MCPServer`: A class to communicate with the MCP server

## Temporary Files

All tests create files in a `.tmp-test` directory in the project root. Each test cleans up after itself, but you can manually clean up with:

```bash
npm run clean:tests
```

This removes the `.tmp-test` directory and all its contents.

## Jest Configuration

Jest is configured in package.json with the following settings:

- TypeScript support via ts-jest
- ESM module support
- Test files matching pattern `*.test.ts`

## Writing New Tests

When creating new tests:

1. Place them in the appropriate category directory
2. Use the `*.test.ts` naming convention
3. Use the helpers for database creation/cleanup
4. Follow the existing patterns for setup/teardown