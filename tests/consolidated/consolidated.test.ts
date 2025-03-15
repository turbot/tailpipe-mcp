import { getTestDatabasePath, createTestDatabase, cleanupDatabase, MCPServer } from '../helpers';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import duckdb from 'duckdb';

/**
 * Comprehensive test suite for Tailpipe MCP
 * 
 * This test converts the consolidated-test.js file to Jest format
 */

describe('Consolidated MCP Tests', () => {
  const dbPath = getTestDatabasePath('consolidated');
  let mcpServer: MCPServer;
  
  // Additional functions for direct DuckDB testing
  const queryAndLog = async (connection: duckdb.Connection, sql: string, label: string) => {
    return new Promise<any[]>((resolve, reject) => {
      connection.all(sql, (err: Error | null, rows: any[]) => {
        if (err) {
          console.error(`❌ Query error (${label}):`, err);
          reject(err);
          return;
        }
        
        resolve(rows);
      });
    });
  };
  
  beforeAll(async () => {
    // Create test database
    await createTestDatabase(dbPath);
    
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
  
  describe('Direct DuckDB Tests', () => {
    test('can query test data directly', async () => {
      const db = new duckdb.Database(dbPath, { access_mode: 'READ_ONLY' });
      const conn = db.connect();
      
      try {
        // Verify database contents
        const testDataQuery = `SELECT * FROM test_data ORDER BY id`;
        const results = await queryAndLog(conn, testDataQuery, 'Test data table contents');
        
        // Check the results
        expect(results).toHaveLength(3);
        expect(results[0].name).toBe('test1');
        expect(results[1].name).toBe('test2');
        expect(results[2].name).toBe('test3');
      } finally {
        conn.close();
        await new Promise<void>(resolve => db.close(() => resolve()));
      }
    });
    
    test('can list tables directly', async () => {
      const db = new duckdb.Database(dbPath, { access_mode: 'READ_ONLY' });
      const conn = db.connect();
      
      try {
        // Run the list tables query we use in MCP
        const listTablesQuery = `
          SELECT 
            table_schema as schema,
            table_name as name
          FROM information_schema.tables 
          WHERE table_schema NOT IN ('information_schema')
          ORDER BY table_schema, table_name
        `;
        const results = await queryAndLog(conn, listTablesQuery, 'List tables query result');
        
        // Check the results
        expect(results.length).toBeGreaterThan(0);
        
        // Check if we have the expected tables
        const foundTables = results.map(row => `${row.schema}.${row.name}`);
        expect(foundTables).toContain('main.test_data');
        expect(foundTables).toContain('test.example');
        expect(foundTables).toContain('aws.test_resources');
      } finally {
        conn.close();
        await new Promise<void>(resolve => db.close(() => resolve()));
      }
    });
  });
  
  describe('MCP Server Tests', () => {
    test('hello endpoint returns valid response', async () => {
      const response = await mcpServer.sendRequest('hello', {});
      
      // The hello endpoint is optional in the MCP specification
      if (response.error && response.error.code === -32601) {
        // Test is conditional - Hello is optional in MCP spec
        expect(response.error.code).toBe(-32601); // Method not found
      } else {
        expect(response.error).toBeUndefined();
        expect(response.result).toBeDefined();
        expect(response.jsonrpc).toBe('2.0');
      }
    });
    
    test('tools/list returns available tools', async () => {
      const response = await mcpServer.sendRequest('tools/list', {});
      
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      expect(response.result.tools).toBeDefined();
      expect(Array.isArray(response.result.tools)).toBe(true);
      expect(response.result.tools.length).toBeGreaterThan(0);
      
      // Check common tool names
      const toolNames = response.result.tools.map((tool: any) => tool.name);
      expect(toolNames).toContain('query');
      expect(toolNames).toContain('list_tables');
    });
    
    test('list_tables tool works with all schemas', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'list_tables',
        arguments: {}
      });
      
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      
      // Handle different response formats
      if (response.result.content && Array.isArray(response.result.content)) {
        // Find text content with tables data
        const textContent = response.result.content.find((item: any) => 
          item.type === 'text' && item.text && item.text.includes('schema')
        );
        expect(textContent).toBeDefined();
        
        // Parse and check tables
        const tables = JSON.parse(textContent.text);
        expect(Array.isArray(tables)).toBe(true);
        expect(tables.length).toBeGreaterThan(0);
      } else if (response.result.tables && Array.isArray(response.result.tables)) {
        expect(response.result.tables.length).toBeGreaterThan(0);
      } else {
        fail('Invalid list_tables response format');
      }
    });
    
    test('list_tables tool works with schema filter', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'list_tables',
        arguments: { schema: 'test' }
      });
      
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      
      // Handle different response formats
      if (response.result.content && Array.isArray(response.result.content)) {
        // Find text content with tables data
        const textContent = response.result.content.find((item: any) => 
          item.type === 'text' && item.text
        );
        expect(textContent).toBeDefined();
        
        // Parse and check tables
        const tables = JSON.parse(textContent.text);
        expect(Array.isArray(tables)).toBe(true);
        
        // Should only find tables in the test schema
        tables.forEach((table: any) => {
          expect(table.schema).toBe('test');
        });
      } else if (response.result.tables && Array.isArray(response.result.tables)) {
        // Should only find tables in the test schema
        response.result.tables.forEach((table: any) => {
          expect(table.schema).toBe('test');
        });
      } else {
        fail('Invalid list_tables response format');
      }
    });
    
    test('query tool works', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'query',
        arguments: {
          sql: 'SELECT * FROM test_data ORDER BY id'
        }
      });
      
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      
      // Handle different response formats
      if (response.result.content && Array.isArray(response.result.content)) {
        const textContent = response.result.content.find((item: any) => 
          item.type === 'text' && item.text
        );
        expect(textContent).toBeDefined();
        
        try {
          // Try to parse as JSON to validate
          const data = JSON.parse(textContent.text);
          expect(Array.isArray(data)).toBe(true);
          expect(data.length).toBe(3); // We should have 3 rows from test_data
        } catch (err) {
          // If not valid JSON, check text contains expected data
          expect(textContent.text).toContain('test1');
          expect(textContent.text).toContain('test2');
          expect(textContent.text).toContain('test3');
        }
      } else if (response.result.rows && Array.isArray(response.result.rows)) {
        expect(response.result.rows.length).toBe(3);
      } else {
        fail('Query response is in unexpected format');
      }
    });
    
    test('inspectSchema tool works', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'inspect_schema',
        arguments: {
          name: 'test'
        }
      });
      
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      
      // Handle different response formats
      if (response.result.content && Array.isArray(response.result.content)) {
        const textContent = response.result.content.find((item: any) => 
          item.type === 'text' && item.text
        );
        expect(textContent).toBeDefined();
      } else if (response.result.schema && response.result.tables) {
        expect(response.result.schema).toBe('test');
        expect(Array.isArray(response.result.tables)).toBe(true);
      } else {
        fail('Schema inspection response in unexpected format');
      }
    });
    
    test('inspectTable tool works', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'inspect_table',
        arguments: {
          schema: 'test',
          name: 'example'
        }
      });
      
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      
      // Handle different response formats
      if (response.result.content && Array.isArray(response.result.content)) {
        const textContent = response.result.content.find((item: any) => 
          item.type === 'text' && item.text
        );
        expect(textContent).toBeDefined();
        
        try {
          // Try to parse as JSON to validate
          const data = JSON.parse(textContent.text);
          expect(Array.isArray(data)).toBe(true);
          // Should at least have id and name columns
          expect(data.length).toBeGreaterThanOrEqual(2);
        } catch (err) {
          // If not valid JSON, check text contains expected column names
          expect(textContent.text).toContain('id');
          expect(textContent.text).toContain('name');
        }
      } else if (response.result.columns && Array.isArray(response.result.columns)) {
        expect(response.result.columns.length).toBeGreaterThanOrEqual(2);
      } else {
        fail('Table inspection response in unexpected format');
      }
    });
  });
});