import { MCPServer, getTestDatabasePath, createTestDatabase, cleanupDatabase } from '../helpers';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import duckdb from 'duckdb';
import { DatabaseService } from '../../src/services/database';
import { ContentItem, Tool, MCPResponse } from '../types';

/**
 * Conversation flow tests
 * 
 * Tests a sequence of MCP requests that simulate a real conversation flow.
 * Converted from conversation.js to Jest format.
 */

describe('Conversation Flow', () => {
  let server: MCPServer;
  let testDatabasePath: string;

  beforeAll(async () => {
    testDatabasePath = getTestDatabasePath('conversation');
    await createTestDatabase(testDatabasePath);
    server = new MCPServer(testDatabasePath);
  });

  afterAll(async () => {
    await server.close();
    await cleanupDatabase(testDatabasePath);
  });

  test('executes a full conversation flow', async () => {
    // Step 1: List available tools
    const listResponse = await server.sendRequest('tools/list', {}) as MCPResponse;

    expect(listResponse.error).toBeUndefined();
    expect(listResponse.result).toBeDefined();
    expect(listResponse.result?.tools).toBeDefined();
    expect(Array.isArray(listResponse.result?.tools)).toBe(true);
    expect(listResponse.result?.tools?.length).toBeGreaterThan(0);

    const toolNames = listResponse.result?.tools?.map((t: Tool) => t.name) || [];
    expect(toolNames).toContain('query_tailpipe');
    expect(toolNames).toContain('list_tailpipe_tables');

    // Step 2: List tables
    const listTablesResponse = await server.sendRequest('tools/call', {
      name: 'list_tailpipe_tables',
      arguments: {
        schema: 'test',
      },
    }) as MCPResponse;

    expect(listTablesResponse.error).toBeUndefined();
    expect(listTablesResponse.result).toBeDefined();
    expect(listTablesResponse.result?.content).toBeDefined();
    expect(Array.isArray(listTablesResponse.result?.content)).toBe(true);
    expect(listTablesResponse.result?.content?.length).toBeGreaterThan(0);

    const listTextContent = listTablesResponse.result?.content?.find((item: ContentItem) => item.type === 'text');
    expect(listTextContent).toBeDefined();
    const tables = JSON.parse(listTextContent!.text);
    expect(Array.isArray(tables)).toBe(true);
    expect(tables.some((t: any) => t.schema === 'test' && t.name === 'example')).toBe(true);

    // Step 3: Execute a query
    const queryResponse = await server.sendRequest('tools/call', {
      name: 'query_tailpipe',
      arguments: {
        sql: 'SELECT COUNT(*) as count FROM test.example',
      },
    }) as MCPResponse;

    expect(queryResponse.error).toBeUndefined();
    expect(queryResponse.result).toBeDefined();
    expect(queryResponse.result?.content).toBeDefined();
    expect(Array.isArray(queryResponse.result?.content)).toBe(true);
    expect(queryResponse.result?.content?.length).toBeGreaterThan(0);

    const queryTextContent = queryResponse.result?.content?.find((item: ContentItem) => item.type === 'text');
    expect(queryTextContent).toBeDefined();
    const results = JSON.parse(queryTextContent!.text);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(1);
    expect(results[0].count).toBeGreaterThan(0);
  });
});

/**
 * Helper to create a test database with sample data
 */
async function createConversationTestDatabase(dbPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      const db = new duckdb.Database(dbPath);
      const conn = db.connect();
      
      conn.exec(`
        -- Create main table
        CREATE TABLE test_data (id INTEGER, name VARCHAR, value DOUBLE);
        INSERT INTO test_data VALUES 
          (1, 'test1', 10.5),
          (2, 'test2', 20.5);
        
        -- Create custom AWS schema
        CREATE SCHEMA aws;
        CREATE TABLE aws.resources (id VARCHAR, region VARCHAR, type VARCHAR);
        INSERT INTO aws.resources VALUES 
          ('r-123', 'us-east-1', 'instance'),
          ('r-456', 'us-west-2', 'bucket');
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