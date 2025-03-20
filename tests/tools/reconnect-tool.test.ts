import { getTestDatabasePath, cleanupDatabase, MCPServer, createTestDatabase } from '../helpers';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { mkdirSync, existsSync, unlinkSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { randomUUID } from 'crypto';
import duckdb from 'duckdb';
import { DatabaseService } from '../../src/services/database';
import { ContentItem, MCPResponse } from '../types';

/**
 * Tests for the reconnect tool
 */

describe('Reconnect Tool', () => {
  // Create database paths for different test scenarios
  const testDb1Path = getTestDatabasePath('reconnect-1');
  const testDb2Path = getTestDatabasePath('reconnect-2');
  let server: MCPServer;
  
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
    await createDatabase(testDb1Path, 'test_db1', 'DB1');
    await createDatabase(testDb2Path, 'test_db2', 'DB2');
    
    // Start MCP server with the first database
    server = new MCPServer(testDb1Path);
    
    // Wait for server to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
  });
  
  afterAll(async () => {
    // Clean up resources
    await server.close();
    cleanupDatabase(testDb1Path);
    cleanupDatabase(testDb2Path);
  });
  
  test('confirms connection to first database initially', async () => {
    const response = await server.sendRequest('tools/call', {
      name: 'reconnect_tailpipe',
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
    
    const result = JSON.parse(textContent!.text);
    expect(result.success).toBe(true);
    expect(result.message).toBeDefined();
    expect(result.database).toBeDefined();
    expect(result.database.path).toBeDefined();
    expect(result.database.source).toBeDefined();
    expect(result.status).toBe('Connected');
  });
  
  test('reconnects to second database with explicit path', async () => {
    const secondDbPath = getTestDatabasePath('reconnect-second');
    await createTestDatabase(secondDbPath);

    const reconnectResponse = await server.sendRequest('tools/call', {
      name: 'reconnect_tailpipe',
      arguments: {
        database_path: secondDbPath
      }
    }) as MCPResponse;

    expect(reconnectResponse.error).toBeUndefined();
    expect(reconnectResponse.result).toBeDefined();
    
    const { content } = reconnectResponse.result!;
    expect(Array.isArray(content)).toBe(true);
    expect(content.length).toBeGreaterThan(0);
    
    const textContent = content.find((item: ContentItem) => item.type === 'text');
    expect(textContent).toBeDefined();
    expect(textContent?.text).toBeDefined();
    
    const result = JSON.parse(textContent!.text);
    expect(result.success).toBe(true);
    expect(result.message).toBeDefined();
    expect(result.database).toBeDefined();
    expect(result.database.path).toBeDefined();
    expect(result.database.source).toBeDefined();
    expect(result.status).toBe('Connected');
  });
  
  test('reconnects back to first database with explicit path', async () => {
    const reconnectResponse = await server.sendRequest('tools/call', {
      name: 'reconnect_tailpipe',
      arguments: {
        database_path: testDb1Path
      }
    }) as MCPResponse;

    expect(reconnectResponse.error).toBeUndefined();
    expect(reconnectResponse.result).toBeDefined();
    
    const { content } = reconnectResponse.result!;
    expect(Array.isArray(content)).toBe(true);
    expect(content.length).toBeGreaterThan(0);
    
    const textContent = content.find((item: ContentItem) => item.type === 'text');
    expect(textContent).toBeDefined();
    expect(textContent?.text).toBeDefined();
    
    const result = JSON.parse(textContent!.text);
    expect(result.success).toBe(true);
    expect(result.message).toBeDefined();
    expect(result.database).toBeDefined();
    expect(result.database.path).toBeDefined();
    expect(result.database.source).toBeDefined();
    expect(result.status).toBe('Connected');
  });
  
  test('returns appropriate error for non-existent database path', async () => {
    const nonExistentPath = getTestDatabasePath('nonexistent');
    const reconnectResponse = await server.sendRequest('tools/call', {
      name: 'reconnect_tailpipe',
      arguments: {
        database_path: nonExistentPath
      }
    }) as MCPResponse;

    expect(reconnectResponse.error).toBeUndefined();
    expect(reconnectResponse.result).toBeDefined();
    expect(reconnectResponse.result!.isError).toBe(true);
    
    const { content } = reconnectResponse.result!;
    expect(Array.isArray(content)).toBe(true);
    expect(content.length).toBeGreaterThan(0);
    
    const textContent = content.find((item: ContentItem) => item.type === 'text');
    expect(textContent).toBeDefined();
    expect(textContent?.text).toBeDefined();
    expect(textContent!.text).toContain('Database file does not exist');
  });
  
  test('handles reconnect with no arguments (implicit reconnect)', async () => {
    const reconnectResponse = await server.sendRequest('tools/call', {
      name: 'reconnect_tailpipe',
      arguments: {}
    }) as MCPResponse;

    expect(reconnectResponse.error).toBeUndefined();
    expect(reconnectResponse.result).toBeDefined();
    
    const { content } = reconnectResponse.result!;
    expect(Array.isArray(content)).toBe(true);
    expect(content.length).toBeGreaterThan(0);
    
    const textContent = content.find((item: ContentItem) => item.type === 'text');
    expect(textContent).toBeDefined();
    expect(textContent?.text).toBeDefined();
    
    const result = JSON.parse(textContent!.text);
    expect(result.success).toBe(true);
    expect(result.message).toBeDefined();
    expect(result.database).toBeDefined();
    expect(result.database.path).toBeDefined();
    expect(result.database.source).toBeDefined();
    expect(result.status).toBe('Connected');
  });

  describe('reconnect_tailpipe Tool', () => {
    test('reconnects to same database', async () => {
      const response = await server.sendRequest('tools/call', {
        name: 'reconnect_tailpipe',
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
      
      const result = JSON.parse(textContent!.text);
      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
      expect(result.database).toBeDefined();
      expect(result.database.path).toBeDefined();
      expect(result.database.source).toBeDefined();
      expect(result.status).toBe('Connected');
    });

    test('reconnects to new database', async () => {
      const newDbPath = getTestDatabasePath('reconnect-new');
      await createTestDatabase(newDbPath);

      // Reconnect to new database
      const reconnectResponse = await server.sendRequest('tools/call', {
        name: 'reconnect_tailpipe',
        arguments: {
          database_path: newDbPath
        }
      }) as MCPResponse;

      expect(reconnectResponse.error).toBeUndefined();
      expect(reconnectResponse.result).toBeDefined();
      
      // Query to verify connection to new database
      const verifyQuery = await server.sendRequest('tools/call', {
        name: 'query_tailpipe',
        arguments: {
          sql: 'SELECT COUNT(*) as count FROM test.example'
        }
      }) as MCPResponse;

      expect(verifyQuery.error).toBeUndefined();
      expect(verifyQuery.result).toBeDefined();
      
      const { content } = verifyQuery.result!;
      expect(Array.isArray(content)).toBe(true);
      expect(content.length).toBeGreaterThan(0);
      
      const textContent = content.find((item: ContentItem) => item.type === 'text');
      expect(textContent).toBeDefined();
      expect(textContent?.text).toBeDefined();
      
      const results = JSON.parse(textContent!.text);
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].count).toBeGreaterThan(0);

      // Clean up new database
      await cleanupDatabase(newDbPath);
    });

    test('handles non-existent database gracefully', async () => {
      const response = await server.sendRequest('tools/call', {
        name: 'reconnect_tailpipe',
        arguments: {
          database_path: '/Users/nathan/src/tailpipe-mcp/.tmp-test/nonexistent-27b362e3.db'
        }
      }) as MCPResponse;

      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      expect(response.result!.isError).toBe(true);
      
      const { content } = response.result!;
      expect(Array.isArray(content)).toBe(true);
      expect(content.length).toBeGreaterThan(0);
      
      const textContent = content.find((item: ContentItem) => item.type === 'text');
      expect(textContent).toBeDefined();
      expect(textContent?.text).toBeDefined();
      expect(textContent?.text).toContain('Database file does not exist');
    });
  });
});