import { getTestDatabasePath, cleanupDatabase, MCPServer } from '../helpers';
import { describe, expect, test, beforeAll, afterAll } from '@jest/globals';
import duckdb from 'duckdb';

/**
 * Minimal test for list_tables tool
 * 
 * This is a focused test on just the list_tables tool functionality
 * with minimal setup. Converted from minimal-list-tables.js to Jest format.
 */

describe('List Tables Tool (Minimal)', () => {
  // Create a test database path
  const dbPath = getTestDatabasePath('minimal-list-tables');
  let mcpServer: MCPServer;
  
  beforeAll(async () => {
    // Create a minimal test database with a custom schema
    await createMinimalTestDatabase(dbPath);
    
    // Start MCP server
    mcpServer = new MCPServer(dbPath);
    
    // Wait for server to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
  });
  
  afterAll(() => {
    // Clean up resources
    mcpServer.close();
    cleanupDatabase(dbPath);
  });
  
  test('tools/list returns list_tables tool', async () => {
    // Send tools/list request
    const response = await mcpServer.sendRequest('tools/list', {});
    
    // Verify success
    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
    expect(response.result.tools).toBeDefined();
    expect(Array.isArray(response.result.tools)).toBe(true);
    
    // Find the list_tables tool
    const listTablesTools = response.result.tools.filter((tool: any) => 
      tool.name === 'list_tables');
    
    // Verify the tool is present
    expect(listTablesTools.length).toBeGreaterThan(0);
    
    // Get the first instance (there should be only one)
    const listTablesTool = listTablesTools[0];
    
    // Verify tool properties
    expect(listTablesTool.name).toBe('list_tables');
    expect(listTablesTool.description).toBeDefined();
    
    // Input schema should be defined
    expect(listTablesTool.inputSchema).toBeDefined();
  });
  
  test('list_tables tool returns tables from test schema', async () => {
    // Send list_tables tool request
    const response = await mcpServer.sendRequest('tools/call', {
      name: 'list_tables',
      arguments: {}
    });
    
    // Verify success response
    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
    
    // Response should have content array with text item
    expect(response.result.content).toBeDefined();
    expect(Array.isArray(response.result.content)).toBe(true);
    expect(response.result.content.length).toBeGreaterThan(0);
    
    // First content item should be text
    const textContent = response.result.content.find((item: any) => item.type === 'text');
    expect(textContent).toBeDefined();
    expect(textContent.text).toBeDefined();
    
    // Parse the JSON response
    const tables = JSON.parse(textContent.text);
    expect(Array.isArray(tables)).toBe(true);
    
    // Find our test.example table
    const testTable = tables.find(
      (table: any) => table.schema === 'test' && table.name === 'example'
    );
    expect(testTable).toBeDefined();
    
    // Verify table properties
    expect(testTable.schema).toBe('test');
    expect(testTable.name).toBe('example');
  });
  
  test('list_tables with schema filter returns only test schema tables', async () => {
    // Send list_tables tool request with schema filter
    const response = await mcpServer.sendRequest('tools/call', {
      name: 'list_tables',
      arguments: { schema: 'test' }
    });
    
    // Verify success
    expect(response.error).toBeUndefined();
    
    // Parse tables from response
    const textContent = response.result.content.find((item: any) => item.type === 'text');
    const tables = JSON.parse(textContent.text);
    
    // All tables should be from test schema
    tables.forEach((table: any) => {
      expect(table.schema).toBe('test');
    });
    
    // Should include our example table
    const exampleTable = tables.find((table: any) => table.name === 'example');
    expect(exampleTable).toBeDefined();
  });
});

/**
 * Helper to create a minimal test database
 */
async function createMinimalTestDatabase(dbPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      const db = new duckdb.Database(dbPath);
      const conn = db.connect();
      
      conn.exec(`
        -- Create test schema and table
        CREATE SCHEMA test;
        CREATE TABLE test.example (id INTEGER, name VARCHAR);
        INSERT INTO test.example VALUES 
          (1, 'test1'),
          (2, 'test2');
          
        -- Create a table in main schema too
        CREATE TABLE main_table (value TEXT);
        INSERT INTO main_table VALUES ('main data');
      `, (err: Error | null) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Close connection and database
        conn.close();
        db.close(() => {
          resolve();
        });
      });
    } catch (err) {
      reject(err);
    }
  });
}