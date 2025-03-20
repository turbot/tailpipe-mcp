import { getTestDatabasePath, createTestDatabase, cleanupDatabase, MCPServer, sleep } from '../helpers';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import duckdb from 'duckdb';
import { DatabaseService } from '../../src/services/database';
import { ContentItem, Tool } from '../types';

/**
 * Comprehensive test suite for Tailpipe MCP
 * 
 * This test converts the consolidated-test.js file to Jest format
 */

describe('Consolidated Tests', () => {
  let server: MCPServer;
  let testDatabasePath: string;

  beforeAll(async () => {
    testDatabasePath = getTestDatabasePath('consolidated');
    await createTestDatabase(testDatabasePath);
    server = new MCPServer(testDatabasePath);
    await sleep(2000); // Wait for server to initialize
  });

  afterAll(async () => {
    await server.close();
    await cleanupDatabase(testDatabasePath);
  });

  describe('tools/list', () => {
    it('returns available tools', async () => {
      const response = await server.sendRequest('tools/list', {});

      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      expect(response.result?.tools).toBeDefined();
      expect(Array.isArray(response.result?.tools)).toBe(true);
      expect(response.result?.tools?.length).toBeGreaterThan(0);

      const toolNames = response.result?.tools?.map((t: Tool) => t.name) || [];
      expect(toolNames).toContain('query_tailpipe');
      expect(toolNames).toContain('list_tailpipe_tables');
      expect(toolNames).toContain('inspect_tailpipe_database');
      expect(toolNames).toContain('inspect_tailpipe_schema');
      expect(toolNames).toContain('inspect_tailpipe_table');
    });
  });

  describe('list_tailpipe_tables', () => {
    it('lists tables in test schema', async () => {
      const response = await server.sendRequest('tools/call', {
        name: 'list_tailpipe_tables',
        arguments: {
          schema: 'test',
        },
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      expect(response.result?.content).toBeDefined();
      expect(Array.isArray(response.result?.content)).toBe(true);
      expect(response.result?.content?.length).toBeGreaterThan(0);

      const textContent = response.result?.content?.find((item: ContentItem) => item.type === 'text');
      expect(textContent).toBeDefined();
      const tables = JSON.parse(textContent!.text);
      expect(Array.isArray(tables)).toBe(true);
      expect(tables.length).toBeGreaterThan(0);
      expect(tables.some((t: any) => t.schema === 'test' && t.name === 'example')).toBe(true);
    });
  });

  describe('inspect_tailpipe_database', () => {
    it('lists available schemas', async () => {
      const response = await server.sendRequest('tools/call', {
        name: 'inspect_tailpipe_database',
        arguments: {},
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      expect(response.result?.content).toBeDefined();
      expect(Array.isArray(response.result?.content)).toBe(true);
      expect(response.result?.content?.length).toBeGreaterThan(0);

      const textContent = response.result?.content?.find((item: ContentItem) => item.type === 'text');
      expect(textContent).toBeDefined();
      expect(textContent?.text).toContain('test');
    });
  });

  describe('inspect_tailpipe_schema', () => {
    it('lists tables in test schema', async () => {
      const response = await server.sendRequest('tools/call', {
        name: 'inspect_tailpipe_schema',
        arguments: {
          name: 'test',
        },
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      expect(response.result?.content).toBeDefined();
      expect(Array.isArray(response.result?.content)).toBe(true);
      expect(response.result?.content?.length).toBeGreaterThan(0);

      const textContent = response.result?.content?.find((item: ContentItem) => item.type === 'text');
      expect(textContent).toBeDefined();
      expect(textContent?.text).toContain('example');
    });
  });

  describe('inspect_tailpipe_table', () => {
    it('shows table details', async () => {
      const response = await server.sendRequest('tools/call', {
        name: 'inspect_tailpipe_table',
        arguments: {
          name: 'example',
          schema: 'test',
        },
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      expect(response.result?.content).toBeDefined();
      expect(Array.isArray(response.result?.content)).toBe(true);
      expect(response.result?.content?.length).toBeGreaterThan(0);

      const textContent = response.result?.content?.find((item: ContentItem) => item.type === 'text');
      expect(textContent).toBeDefined();
      const tableInfo = JSON.parse(textContent!.text);
      expect(Array.isArray(tableInfo)).toBe(true);
      expect(tableInfo.length).toBeGreaterThan(0);
      expect(tableInfo.some((col: any) => col.column_name === 'id')).toBe(true);
      expect(tableInfo.some((col: any) => col.column_name === 'name')).toBe(true);
    });
  });
});