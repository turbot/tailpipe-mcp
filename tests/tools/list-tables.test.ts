import { MCPServer } from '../setup/test-helpers';
import { getTestDatabasePath, createTestDatabase, cleanupDatabase } from '../setup/test-helpers';
import { DatabaseService } from '../../src/services/database';
import { ContentItem, MCPResponse } from '../types';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import duckdb from 'duckdb';

/**
 * Tests for the list_tables tool
 * 
 * This test converts the list-tables.js file to Jest format
 */

describe('List Tables Tool', () => {
  const testDbPath = getTestDatabasePath('list-tables');
  let server: MCPServer;
  
  // Create a database with multiple schemas and tables for testing
  async function createListTablesDatabase(dbPath: string): Promise<void> {
    const db = new duckdb.Database(dbPath);
    const conn = db.connect();
    
    return new Promise<void>((resolve, reject) => {
      try {
        conn.exec(`
          -- Create AWS schema with tables
          CREATE SCHEMA aws;
          
          CREATE TABLE aws.s3_bucket (
            id VARCHAR, 
            name VARCHAR,
            region VARCHAR
          );
          
          CREATE TABLE aws.ec2_instance (
            id VARCHAR,
            type VARCHAR,
            region VARCHAR
          );
          
          -- Create Azure schema with tables
          CREATE SCHEMA azure;
          
          CREATE TABLE azure.storage_account (
            id VARCHAR,
            name VARCHAR,
            location VARCHAR
          );
          
          -- Insert some sample data
          INSERT INTO aws.s3_bucket VALUES 
            ('b-123', 'my-bucket', 'us-east-1'),
            ('b-456', 'other-bucket', 'us-west-2');
            
          INSERT INTO aws.ec2_instance VALUES
            ('i-123', 't2.micro', 'us-east-1'),
            ('i-456', 'm5.large', 'us-west-2');
            
          INSERT INTO azure.storage_account VALUES
            ('sa-123', 'mystorageacct', 'eastus'),
            ('sa-456', 'otherstorage', 'westus');
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
    // Create test database with tables
    await createTestDatabase(testDbPath);
    
    // Initialize server
    server = new MCPServer(testDbPath);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for server init
  });
  
  afterAll(async () => {
    await cleanupDatabase(testDbPath);
  });
  
  describe('list_tailpipe_tables Tool', () => {
    test('lists all tables across schemas', async () => {
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

    test('filters tables by schema', async () => {
      const response = await server.sendRequest('tools/call', {
        name: 'list_tailpipe_tables',
        arguments: {
          schema: 'test'
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
      
      const tables = JSON.parse(textContent!.text);
      expect(Array.isArray(tables)).toBe(true);
      expect(tables.length).toBeGreaterThan(0);
      
      // All tables should be in test schema
      tables.forEach((table: any) => {
        expect(table.schema).toBe('test');
      });
    });

    test('filters tables by name pattern', async () => {
      const response = await server.sendRequest('tools/call', {
        name: 'list_tailpipe_tables',
        arguments: {
          filter: '%example%'
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
      
      const tables = JSON.parse(textContent!.text);
      expect(Array.isArray(tables)).toBe(true);
      expect(tables.length).toBeGreaterThan(0);
      
      // All tables should match pattern
      tables.forEach((table: any) => {
        expect(table.name.toLowerCase()).toContain('example');
      });
    });
  });
});