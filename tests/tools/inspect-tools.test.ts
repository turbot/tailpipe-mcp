import { getTestDatabasePath, createTestDatabase, cleanupDatabase, MCPServer, MCPResponse } from '../setup/test-helpers';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import duckdb from 'duckdb';
import { DatabaseService } from '../../src/services/database.js';
import { ContentItem } from '../setup/test-types';

/**
 * Tests for the inspect tools: inspect_database, inspect_schema, inspect_table
 * 
 * This test converts the inspect-tools.js file to Jest format
 */

describe('Inspect Tools', () => {
  // Test data - this will be populated in beforeAll
  const dbPath = getTestDatabasePath('inspect-tools');
  let mcpServer: MCPServer;
  
  // Create a more complex test database than the standard one
  async function createInspectToolsDatabase(dbPath: string): Promise<void> {
    const db = new duckdb.Database(dbPath);
    const conn = db.connect();
    
    return new Promise<void>((resolve, reject) => {
      try {
        conn.exec(`
          -- Create app_data schema with tables
          CREATE SCHEMA app_data;
          
          CREATE TABLE app_data.users (
            id INTEGER PRIMARY KEY,
            username VARCHAR,
            email VARCHAR,
            created_at TIMESTAMP
          );
          
          CREATE TABLE app_data.user_sessions (
            id INTEGER PRIMARY KEY,
            user_id INTEGER,
            session_token VARCHAR,
            last_active TIMESTAMP
          );
          
          CREATE TABLE app_data.products (
            id INTEGER PRIMARY KEY,
            name VARCHAR,
            price DECIMAL(10,2),
            stock INTEGER
          );
          
          -- Create analytics schema with tables
          CREATE SCHEMA analytics;
          
          CREATE TABLE analytics.page_views (
            id INTEGER PRIMARY KEY,
            page_url VARCHAR,
            user_id INTEGER,
            viewed_at TIMESTAMP
          );
          
          CREATE TABLE analytics.conversions (
            id INTEGER PRIMARY KEY,
            user_id INTEGER,
            product_id INTEGER,
            amount DECIMAL(10,2),
            conversion_time TIMESTAMP
          );
          
          -- Create some data in the main schema too
          CREATE TABLE main.settings (
            key VARCHAR PRIMARY KEY,
            value VARCHAR,
            description VARCHAR
          );
          
          -- Insert some sample data
          INSERT INTO app_data.users VALUES 
            (1, 'user1', 'user1@example.com', '2023-01-01 10:00:00'),
            (2, 'user2', 'user2@example.com', '2023-01-02 11:30:00');
            
          INSERT INTO app_data.products VALUES
            (1, 'Product A', 19.99, 100),
            (2, 'Product B', 29.99, 50);
            
          INSERT INTO analytics.page_views VALUES
            (1, '/home', 1, '2023-01-01 12:00:00'),
            (2, '/products', 1, '2023-01-01 12:05:00');
            
          INSERT INTO main.settings VALUES
            ('theme', 'dark', 'UI theme setting'),
            ('language', 'en', 'Default language');
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
    // Enable debug logging
    process.env.TAILPIPE_MCP_LOG_LEVEL = 'debug';
    
    // Create test database with multiple schemas and tables
    await createInspectToolsDatabase(dbPath);
    
    // Start MCP server
    mcpServer = new MCPServer(dbPath);
    
    // Wait for server to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
  });
  
  afterAll(async () => {
    // Clean up resources
    await mcpServer.close();
    cleanupDatabase(dbPath);
  });
  
  describe('inspect_database Tool', () => {
    test('lists all schemas in database', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'inspect_tailpipe_database',
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
      
      const schemas = JSON.parse(textContent!.text);
      expect(Array.isArray(schemas)).toBe(true);
      expect(schemas.length).toBeGreaterThan(0);
      
      // Should include our custom schemas
      expect(schemas).toContain('app_data');
      expect(schemas).toContain('analytics');
      expect(schemas).toContain('main');
    });
    
    test('filters schemas by pattern', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'inspect_tailpipe_database',
        arguments: {
          filter: 'app'
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
      
      const schemas = JSON.parse(textContent!.text);
      expect(Array.isArray(schemas)).toBe(true);
      expect(schemas.length).toBeGreaterThan(0);
      
      // All schemas should match pattern
      schemas.forEach((schema: string) => {
        expect(schema.toLowerCase()).toContain('app');
      });
    });
  });
  
  describe('inspect_schema Tool', () => {
    test('lists tables in a schema', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'inspect_tailpipe_schema',
        arguments: {
          name: 'app_data'
        }
      });
      
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
      
      // Check for expected tables
      const tableNames = tables.map((t: any) => t.table_name);
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('user_sessions');
      expect(tableNames).toContain('products');
    });
    
    test('filters tables in a schema', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'inspect_tailpipe_schema',
        arguments: {
          name: 'app_data',
          filter: '%user%'
        }
      });
      
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
      
      // All tables should match pattern
      tables.forEach((table: any) => {
        expect(table.table_name.toLowerCase()).toContain('user');
      });
    });
    
    test('handles non-existent schema', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'inspect_tailpipe_schema',
        arguments: {
          name: 'non_existent_schema'
        }
      }) as MCPResponse;

      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      expect(response.result?.content).toBeDefined();
      expect(Array.isArray(response.result?.content)).toBe(true);
      expect(response.result?.content?.length).toBeGreaterThan(0);

      const textContent = response.result?.content?.find((item: ContentItem) => item.type === 'text');
      expect(textContent).toBeDefined();
      expect(textContent?.text).toBe('[]');
    });
  });
  
  describe('inspect_table Tool', () => {
    test('shows columns for a table with schema specified', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'inspect_tailpipe_table',
        arguments: {
          name: 'users',
          schema: 'app_data'
        }
      });
      
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      
      const { content } = response.result!;
      expect(Array.isArray(content)).toBe(true);
      expect(content.length).toBeGreaterThan(0);
      
      const textContent = content.find((item: ContentItem) => item.type === 'text');
      expect(textContent).toBeDefined();
      expect(textContent?.text).toBeDefined();
      
      const columns = JSON.parse(textContent!.text);
      expect(Array.isArray(columns)).toBe(true);
      expect(columns.length).toBeGreaterThan(0);
      
      // Check column properties
      const firstColumn = columns[0];
      expect(firstColumn.column_name).toBeDefined();
      expect(firstColumn.data_type).toBeDefined();
      
      // Check for expected columns
      const columnNames = columns.map((c: any) => c.column_name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('username');
      expect(columnNames).toContain('email');
      expect(columnNames).toContain('created_at');
    });
    
    test('auto-discovers schema when not specified', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'inspect_tailpipe_table',
        arguments: {
          name: 'settings'
        }
      });
      
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      
      const { content } = response.result!;
      expect(Array.isArray(content)).toBe(true);
      expect(content.length).toBeGreaterThan(0);
      
      const textContent = content.find((item: ContentItem) => item.type === 'text');
      expect(textContent).toBeDefined();
      expect(textContent?.text).toBeDefined();
      
      const columns = JSON.parse(textContent!.text);
      expect(Array.isArray(columns)).toBe(true);
      expect(columns.length).toBeGreaterThan(0);
      
      // Check column properties
      const firstColumn = columns[0];
      expect(firstColumn.column_name).toBeDefined();
      expect(firstColumn.data_type).toBeDefined();
      
      // Check for expected columns
      const columnNames = columns.map((c: any) => c.column_name);
      expect(columnNames).toContain('key');
      expect(columnNames).toContain('value');
      expect(columnNames).toContain('description');
    });
    
    test('returns empty array for non-existent table', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'inspect_tailpipe_table',
        arguments: {
          name: 'non_existent_table',
          schema: 'test'
        }
      }) as MCPResponse;

      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      expect(response.result?.content).toBeDefined();
      expect(Array.isArray(response.result?.content)).toBe(true);
      expect(response.result?.content?.length).toBeGreaterThan(0);

      const textContent = response.result?.content?.find((item: ContentItem) => item.type === 'text');
      expect(textContent).toBeDefined();
      expect(textContent?.text).toBe('[]');
    });
  });
});