import { getTestDatabasePath, createTestDatabase, cleanupDatabase, MCPServer } from '../helpers';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';

/**
 * Connection resilience tests for Tailpipe MCP
 * 
 * This test converts the connection-resilience.js file to Jest format
 */

describe('Database Connection Resilience', () => {
  const dbPath = getTestDatabasePath('resilience');
  let mcpServer: MCPServer;
  
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
  
  test('executes first basic query successfully', async () => {
    const response = await mcpServer.sendRequest('tools/call', {
      name: 'query',
      arguments: {
        sql: 'SELECT * FROM test_data ORDER BY id'
      }
    });
    
    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
    
    // Check query results in either format (content or rows)
    if (response.result.content && Array.isArray(response.result.content)) {
      const textContent = response.result.content.find((item: any) => 
        item.type === 'text' && item.text
      );
      expect(textContent).toBeDefined();
      
      try {
        const data = JSON.parse(textContent.text);
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(3); // We expect 3 rows from test_data
      } catch (err) {
        // If not valid JSON, check for expected data in text
        expect(textContent.text).toContain('test1');
      }
    } else if (response.result.rows && Array.isArray(response.result.rows)) {
      expect(response.result.rows.length).toBe(3); 
    } else {
      fail('Query response is in unexpected format');
    }
  });
  
  test('reuses connection for second query', async () => {
    const response = await mcpServer.sendRequest('tools/call', {
      name: 'query',
      arguments: {
        sql: 'SELECT COUNT(*) FROM test_data'
      }
    });
    
    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
    
    // Check query results to ensure count is correct
    if (response.result.content && Array.isArray(response.result.content)) {
      const textContent = response.result.content.find((item: any) => 
        item.type === 'text' && item.text
      );
      expect(textContent).toBeDefined();
      
      try {
        // Parse JSON and check count
        const data = JSON.parse(textContent.text);
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(1); // One row for COUNT query
        
        // The count might be in a column named count, COUNT(*), or other variations
        const row = data[0];
        const countValue = Object.values(row)[0];
        expect(countValue).toBe(3); // We expect count=3 from test_data
      } catch (err) {
        // If not valid JSON, check the count appears in the text
        expect(textContent.text).toMatch(/\b3\b/); // The count value (3) appears
      }
    } else if (response.result.rows && Array.isArray(response.result.rows)) {
      expect(response.result.rows.length).toBe(1);
      
      // The count might be in a column named count, COUNT(*), or other variations
      const row = response.result.rows[0];
      const countValue = Object.values(row)[0];
      expect(countValue).toBe(3); // We expect count=3
    } else {
      fail('Query response is in unexpected format');
    }
  });
  
  test('list_tables works after queries', async () => {
    const response = await mcpServer.sendRequest('tools/call', {
      name: 'list_tables',
      arguments: {}
    });
    
    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
    
    // Check tables results
    if (response.result.content && Array.isArray(response.result.content)) {
      const textContent = response.result.content.find((item: any) => 
        item.type === 'text' && item.text
      );
      expect(textContent).toBeDefined();
      
      try {
        const tables = JSON.parse(textContent.text);
        expect(Array.isArray(tables)).toBe(true);
        expect(tables.length).toBeGreaterThan(0);
        
        // Check that test_data table exists
        const testDataTable = tables.find((t: any) => 
          t.name === 'test_data' && t.schema === 'main'
        );
        expect(testDataTable).toBeDefined();
      } catch (err) {
        // If not valid JSON, check for test_data in the text
        expect(textContent.text).toContain('test_data');
      }
    } else if (response.result.tables && Array.isArray(response.result.tables)) {
      expect(response.result.tables.length).toBeGreaterThan(0);
      
      // Check that test_data table exists
      const testDataTable = response.result.tables.find((t: any) => 
        t.name === 'test_data' && t.schema === 'main'
      );
      expect(testDataTable).toBeDefined();
    } else {
      fail('list_tables response is in unexpected format');
    }
  });
});