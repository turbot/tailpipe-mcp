import { getTestDatabasePath, createTestDatabase, cleanupDatabase, MCPServer } from '../setup/test-helpers';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { DatabaseService } from '../../src/services/database.js';
import { ContentItem, MCPResponse } from '../setup/test-types';

/**
 * Connection resilience tests for Tailpipe MCP
 * 
 * This test converts the connection-resilience.js file to Jest format
 */

describe('Database Connection Resilience', () => {
  const testDbPath = getTestDatabasePath('resilience');
  let server: MCPServer;
  
  beforeAll(async () => {
    // Create test database with tables
    await createTestDatabase(testDbPath);
    
    // Initialize server
    server = new MCPServer(testDbPath);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for server init
  });
  
  afterAll(async () => {
    // Clean up resources
    await server.close();
    await cleanupDatabase(testDbPath);
  });
  
  test('executes first basic query successfully', async () => {
    const response = await server.sendRequest('tools/call', {
      name: 'query_tailpipe',
      arguments: {
        sql: 'SELECT COUNT(*) as count FROM test.example'
      }
    }) as MCPResponse;
    
    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
    
    const { content } = response.result!;
    expect(Array.isArray(content)).toBe(true);
    expect(content.length).toBeGreaterThan(0);
    
    const textContent = content.find((item: ContentItem) => item.type === 'text');
    expect(textContent).toBeDefined();
    expect(textContent?.text).toBeDefined();
    
    const results = JSON.parse(textContent!.text);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].count).toBeGreaterThan(0);
  });
  
  test('reuses connection for second query', async () => {
    const response = await server.sendRequest('tools/call', {
      name: 'query_tailpipe',
      arguments: {
        sql: 'SELECT COUNT(*) as count FROM test.example'
      }
    }) as MCPResponse;
    
    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
    
    const { content } = response.result!;
    expect(Array.isArray(content)).toBe(true);
    expect(content.length).toBeGreaterThan(0);
    
    const textContent = content.find((item: ContentItem) => item.type === 'text');
    expect(textContent).toBeDefined();
    expect(textContent?.text).toBeDefined();
    
    const results = JSON.parse(textContent!.text);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].count).toBeGreaterThan(0);
  });
  
  test('list_tables works after queries', async () => {
    const response = await server.sendRequest('tools/call', {
      name: 'list_tailpipe_tables',
      arguments: {}
    }) as MCPResponse;
    
    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
    
    const { content } = response.result!;
    expect(Array.isArray(content)).toBe(true);
    expect(content.length).toBeGreaterThan(0);
    
    const textContent = content.find((item: ContentItem) => item.type === 'text');
    expect(textContent).toBeDefined();
    expect(textContent?.text).toBeDefined();
    
    const tables = JSON.parse(textContent!.text);
    expect(Array.isArray(tables)).toBe(true);
    expect(tables.length).toBeGreaterThan(0);
    
    // Should include tables in test schema
    const testSchemaTables = tables.filter((table: any) => table.schema === 'test');
    expect(testSchemaTables.length).toBeGreaterThan(0);
  });
});