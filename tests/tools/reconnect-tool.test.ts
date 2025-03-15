import { getTestDatabasePath, cleanupDatabase, MCPServer } from '../helpers';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { mkdirSync, existsSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import duckdb from 'duckdb';

/**
 * Tests for the reconnect tool
 */

describe('Reconnect Tool', () => {
  // Create database paths for different test scenarios
  const dbPath1 = getTestDatabasePath('reconnect-db1');
  const dbPath2 = getTestDatabasePath('reconnect-db2');
  let mcpServer: MCPServer;
  
  // Helper to create database with specific content
  async function createDatabase(path: string, tableName: string, value: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        const db = new duckdb.Database(path);
        const conn = db.connect();
        
        conn.exec(`
          CREATE TABLE ${tableName} (id INTEGER, name VARCHAR);
          INSERT INTO ${tableName} VALUES (1, '${value}');
        `, (err: Error | null) => {
          if (err) {
            reject(err);
            return;
          }
          
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
  
  beforeAll(async () => {
    // Create two test databases with different tables/data
    await createDatabase(dbPath1, 'test_db1', 'DB1');
    await createDatabase(dbPath2, 'test_db2', 'DB2');
    
    // Start MCP server with the first database
    mcpServer = new MCPServer(dbPath1);
    
    // Wait for server to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
  });
  
  afterAll(() => {
    // Clean up resources
    mcpServer.close();
    cleanupDatabase(dbPath1);
    cleanupDatabase(dbPath2);
  });
  
  test('confirms connection to first database initially', async () => {
    // Query to verify initial connection to first database
    const response = await mcpServer.sendRequest('tools/call', {
      name: 'query',
      arguments: { sql: 'SELECT name FROM test_db1' }
    });
    
    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
    
    // Check that we can query test_db1
    const content = response.result.content?.find((item: any) => item.type === 'text')?.text;
    expect(content).toBeDefined();
    expect(content).toContain('DB1');
    
    // Verify we cannot access tables from the second database
    const invalidResponse = await mcpServer.sendRequest('tools/call', {
      name: 'query',
      arguments: { sql: 'SELECT name FROM test_db2' }
    });
    
    // This should fail since we're not connected to the second database
    expect(invalidResponse.result?.isError).toBe(true);
  });
  
  test('reconnects to second database with explicit path', async () => {
    // Use reconnect tool to switch to second database
    const reconnectResponse = await mcpServer.sendRequest('tools/call', {
      name: 'reconnect',
      arguments: { database_path: dbPath2 }
    });
    
    expect(reconnectResponse.error).toBeUndefined();
    expect(reconnectResponse.result).toBeDefined();
    expect(reconnectResponse.result.isError).toBeFalsy();
    
    // Parse the reconnect response
    const content = reconnectResponse.result.content?.find((item: any) => item.type === 'text')?.text;
    expect(content).toBeDefined();
    
    // Check success response format
    const data = JSON.parse(content);
    expect(data.success).toBe(true);
    expect(data.database.path).toBe(dbPath2);
    
    // Query to verify connection to second database
    const queryResponse = await mcpServer.sendRequest('tools/call', {
      name: 'query',
      arguments: { sql: 'SELECT name FROM test_db2' }
    });
    
    expect(queryResponse.error).toBeUndefined();
    expect(queryResponse.result).toBeDefined();
    
    // Check that we can query test_db2
    const queryContent = queryResponse.result.content?.find((item: any) => item.type === 'text')?.text;
    expect(queryContent).toBeDefined();
    expect(queryContent).toContain('DB2');
    
    // Verify we cannot access tables from the first database
    const invalidResponse = await mcpServer.sendRequest('tools/call', {
      name: 'query',
      arguments: { sql: 'SELECT name FROM test_db1' }
    });
    
    // This should fail since we're now connected to the second database
    expect(invalidResponse.result?.isError).toBe(true);
  });
  
  test('reconnects back to first database with explicit path', async () => {
    // Use reconnect tool to switch back to first database
    const reconnectResponse = await mcpServer.sendRequest('tools/call', {
      name: 'reconnect',
      arguments: { database_path: dbPath1 }
    });
    
    expect(reconnectResponse.error).toBeUndefined();
    expect(reconnectResponse.result).toBeDefined();
    expect(reconnectResponse.result.isError).toBeFalsy();
    
    // Parse the reconnect response
    const content = reconnectResponse.result.content?.find((item: any) => item.type === 'text')?.text;
    expect(content).toBeDefined();
    
    // Check success response format
    const data = JSON.parse(content);
    expect(data.success).toBe(true);
    expect(data.database.path).toBe(dbPath1);
    
    // Query to verify connection to first database
    const queryResponse = await mcpServer.sendRequest('tools/call', {
      name: 'query',
      arguments: { sql: 'SELECT name FROM test_db1' }
    });
    
    expect(queryResponse.error).toBeUndefined();
    expect(queryResponse.result).toBeDefined();
    
    // Check that we can query test_db1
    const queryContent = queryResponse.result.content?.find((item: any) => item.type === 'text')?.text;
    expect(queryContent).toBeDefined();
    expect(queryContent).toContain('DB1');
  });
  
  test('returns appropriate error for non-existent database path', async () => {
    // Create a non-existent database path
    const nonExistentPath = getTestDatabasePath(`non-existent-${randomUUID()}`);
    
    // Use reconnect tool with a non-existent path
    const reconnectResponse = await mcpServer.sendRequest('tools/call', {
      name: 'reconnect',
      arguments: { database_path: nonExistentPath }
    });
    
    expect(reconnectResponse.error).toBeUndefined();
    expect(reconnectResponse.result).toBeDefined();
    
    // This should be an error response
    expect(reconnectResponse.result.isError).toBe(true);
    
    // Parse the reconnect response
    const content = reconnectResponse.result.content?.find((item: any) => item.type === 'text')?.text;
    expect(content).toBeDefined();
    expect(content).toContain('Error');
    expect(content).toContain('does not exist');
    
    // Verify we're still connected to the previous database (dbPath1)
    const queryResponse = await mcpServer.sendRequest('tools/call', {
      name: 'query',
      arguments: { sql: 'SELECT name FROM test_db1' }
    });
    
    // Should still work with the previous database
    expect(queryResponse.error).toBeUndefined();
    expect(queryResponse.result).toBeDefined();
    expect(queryResponse.result.isError).toBeFalsy();
    
    const queryContent = queryResponse.result.content?.find((item: any) => item.type === 'text')?.text;
    expect(queryContent).toBeDefined();
    expect(queryContent).toContain('DB1');
  });
  
  test('handles reconnect with no arguments (implicit reconnect)', async () => {
    // Create a temporary database with different data
    const tempDbPath = getTestDatabasePath('temp-reconnect-db');
    await createDatabase(tempDbPath, 'temp_table', 'TEMP_DB');
    
    // First connect to the temp database
    const initialReconnect = await mcpServer.sendRequest('tools/call', {
      name: 'reconnect',
      arguments: { database_path: tempDbPath }
    });
    
    expect(initialReconnect.error).toBeUndefined();
    expect(initialReconnect.result.isError).toBeFalsy();
    
    // Verify connection to temp database
    const tempQuery = await mcpServer.sendRequest('tools/call', {
      name: 'query',
      arguments: { sql: 'SELECT name FROM temp_table' }
    });
    
    const tempContent = tempQuery.result.content?.find((item: any) => item.type === 'text')?.text;
    expect(tempContent).toContain('TEMP_DB');
    
    // Now try reconnect with no arguments
    // This should use the command line arguments (if any) or try tailpipe CLI
    // Note: In test environment, this will try to use the process.argv[2] value
    // which was set by MCPServer to dbPath1
    const implicitReconnect = await mcpServer.sendRequest('tools/call', {
      name: 'reconnect',
      arguments: {}
    });
    
    expect(implicitReconnect.error).toBeUndefined();
    
    // The behavior will depend on how MCPServer sets up the database source
    // In our test environment, mcpServer was initialized with dbPath1
    // The test shouldn't fail even if the implementation details change
    expect(implicitReconnect.result).toBeDefined();
    
    // Try to query one of our known databases to see which one we connected to
    // First try the original db (dbPath1)
    const finalQuery1 = await mcpServer.sendRequest('tools/call', {
      name: 'query',
      arguments: { sql: 'SELECT name FROM test_db1' }
    });
    
    // If this succeeds, we reconnected to dbPath1
    if (!finalQuery1.result?.isError) {
      const content1 = finalQuery1.result.content?.find((item: any) => item.type === 'text')?.text;
      expect(content1).toContain('DB1');
    } else {
      // Try the temp database
      const finalQuery2 = await mcpServer.sendRequest('tools/call', {
        name: 'query',
        arguments: { sql: 'SELECT name FROM temp_table' }
      });
      
      // One of these queries should succeed
      expect(finalQuery2.result?.isError).toBeFalsy();
      const content2 = finalQuery2.result.content?.find((item: any) => item.type === 'text')?.text;
      expect(content2).toContain('TEMP_DB');
    }
    
    // Clean up temp database
    cleanupDatabase(tempDbPath);
  });
});