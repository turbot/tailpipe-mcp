import { getTestDatabasePath, createTestDatabase, cleanupDatabase, MCPServer, MCPResponse } from '../helpers';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import duckdb from 'duckdb';

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
        name: 'inspect_database',
        arguments: {}
      });
      
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      
      // Parse the result content
      const content = response.result.content?.find((item: any) => 
        item.type === 'text' && item.text
      );
      expect(content).toBeDefined();
      
      // Parse the schema list
      const schemas = JSON.parse(content.text);
      expect(Array.isArray(schemas)).toBe(true);
      
      // Should include our custom schemas and main
      expect(schemas).toContain('main');
      expect(schemas).toContain('app_data');
      expect(schemas).toContain('analytics');
    });
    
    test('filters schemas by pattern', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'inspect_database',
        arguments: {
          filter: 'app'
        }
      });
      
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      
      // Parse the result content
      const content = response.result.content?.find((item: any) => 
        item.type === 'text' && item.text
      );
      expect(content).toBeDefined();
      
      // Parse the filtered schema list
      const filteredSchemas = JSON.parse(content.text);
      expect(Array.isArray(filteredSchemas)).toBe(true);
      
      // Should only include app_data
      expect(filteredSchemas).toContain('app_data');
      expect(filteredSchemas).not.toContain('analytics');
      expect(filteredSchemas).not.toContain('main');
    });
  });
  
  describe('inspect_schema Tool', () => {
    test('lists tables in a schema', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'inspect_schema',
        arguments: {
          name: 'app_data'
        }
      });
      
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      
      // Parse the result content
      const content = response.result.content?.find((item: any) => 
        item.type === 'text' && item.text
      );
      expect(content).toBeDefined();
      
      // Parse the table list
      const tables = JSON.parse(content.text);
      expect(Array.isArray(tables)).toBe(true);
      
      // Find the correct property name for the table name - might be 'name' or 'table_name'
      const firstTable = tables[0];
      const tableNameProperty = 'table_name' in firstTable ? 'table_name' : 'name';
      
      // Should include our app_data tables
      const tableNames = tables.map((t: any) => t[tableNameProperty]);
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('products');
      expect(tableNames).toContain('user_sessions');
      expect(tables.length).toBe(3); // Should have exactly 3 tables
    });
    
    test('filters tables in a schema', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'inspect_schema',
        arguments: {
          name: 'app_data',
          filter: '%user%'
        }
      });
      
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      
      // Parse the result content
      const content = response.result.content?.find((item: any) => 
        item.type === 'text' && item.text
      );
      expect(content).toBeDefined();
      
      // Parse the filtered table list
      const tables = JSON.parse(content.text);
      expect(Array.isArray(tables)).toBe(true);
      
      // Find the correct property name for the table name - might be 'name' or 'table_name'
      const firstTable = tables[0];
      const tableNameProperty = 'table_name' in firstTable ? 'table_name' : 'name';
      
      // Should only include user-related tables
      const tableNames = tables.map((t: any) => t[tableNameProperty]);
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('user_sessions');
      expect(tableNames).not.toContain('products');
      expect(tables.length).toBe(2); // Should have exactly 2 tables
    });
    
    test('handles non-existent schema', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'inspect_schema',
        arguments: {
          name: 'nonexistent_schema'
        }
      });
      
      // Should still get a result, but it might be an error message or empty array
      expect(response.result).toBeDefined();
      
      // Parse the result content
      const content = response.result.content?.find((item: any) => 
        item.type === 'text' && item.text
      );
      expect(content).toBeDefined();
      
      // Check if it's an error message or empty array
      if (content.text.startsWith('Error')) {
        expect(content.text).toContain('not found');
      } else {
        // If not an error, should be an empty array
        const tables = JSON.parse(content.text);
        expect(Array.isArray(tables)).toBe(true);
        expect(tables.length).toBe(0); // Empty array
      }
    });
  });
  
  describe('inspect_table Tool', () => {
    test('shows columns for a table with schema specified', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'inspect_table',
        arguments: {
          schema: 'app_data',
          name: 'users'
        }
      });
      
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      
      // Parse the result content
      const content = response.result.content?.find((item: any) => 
        item.type === 'text' && item.text
      );
      expect(content).toBeDefined();
      
      // Parse the column list
      const columns = JSON.parse(content.text);
      expect(Array.isArray(columns)).toBe(true);
      
      // Should have all users table columns
      const columnNames = columns.map((c: any) => c.column_name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('username');
      expect(columnNames).toContain('email');
      expect(columnNames).toContain('created_at');
      expect(columns.length).toBe(4); // Should have exactly 4 columns
      
      // Check data types
      const idColumn = columns.find((c: any) => c.column_name === 'id');
      expect(idColumn.data_type.toLowerCase()).toContain('int');
      
      const usernameColumn = columns.find((c: any) => c.column_name === 'username');
      expect(usernameColumn.data_type.toLowerCase()).toContain('varchar');
    });
    
    test('auto-discovers schema when not specified', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'inspect_table',
        arguments: {
          name: 'products'
        }
      });
      
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      
      // Parse the result content
      const content = response.result.content?.find((item: any) => 
        item.type === 'text' && item.text
      );
      expect(content).toBeDefined();
      
      // Parse the column list
      const columns = JSON.parse(content.text);
      expect(Array.isArray(columns)).toBe(true);
      
      // Should have all products table columns
      const columnNames = columns.map((c: any) => c.column_name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('price');
      expect(columnNames).toContain('stock');
      expect(columns.length).toBe(4); // Should have exactly 4 columns
    });
  });
});