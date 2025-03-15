import { getTestDatabasePath, cleanupDatabase, MCPServer } from '../helpers';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import duckdb from 'duckdb';

/**
 * Tests for the list_tables tool
 * 
 * This test converts the list-tables.js file to Jest format
 */

describe('List Tables Tool', () => {
  // Test data - this will be populated in beforeAll
  const dbPath = getTestDatabasePath('list-tables');
  let mcpServer: MCPServer;
  
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
    // Create test database with multiple schemas and tables
    await createListTablesDatabase(dbPath);
    
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
  
  test('lists all tables across schemas', async () => {
    const response = await mcpServer.sendRequest('tools/call', {
      name: 'list_tables',
      arguments: {}
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
    
    // Should have at least 3 tables from our database
    expect(tables.length).toBeGreaterThanOrEqual(3);
    
    // Find the correct property names for schema and table
    const firstTable = tables[0];
    const schemaProperty = 'schema' in firstTable ? 'schema' : 'table_schema';
    const tableProperty = 'name' in firstTable ? 'name' : 'table_name';
    
    // Find tables from both schemas
    const awsBucketTable = tables.find((t: any) => 
      t[schemaProperty] === 'aws' && t[tableProperty] === 's3_bucket'
    );
    const awsInstanceTable = tables.find((t: any) => 
      t[schemaProperty] === 'aws' && t[tableProperty] === 'ec2_instance'
    );
    const azureStorageTable = tables.find((t: any) => 
      t[schemaProperty] === 'azure' && t[tableProperty] === 'storage_account'
    );
    
    expect(awsBucketTable).toBeDefined();
    expect(awsInstanceTable).toBeDefined();
    expect(azureStorageTable).toBeDefined();
  });
  
  test('filters tables by schema', async () => {
    const response = await mcpServer.sendRequest('tools/call', {
      name: 'list_tables',
      arguments: { 
        schema: 'aws' 
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
    
    // Should have exactly 2 tables from aws schema
    expect(tables.length).toBe(2);
    
    // Find the correct property names for schema and table
    const firstTable = tables[0];
    const schemaProperty = 'schema' in firstTable ? 'schema' : 'table_schema';
    const tableProperty = 'name' in firstTable ? 'name' : 'table_name';
    
    // All tables should be from aws schema
    tables.forEach((table: any) => {
      expect(table[schemaProperty]).toBe('aws');
    });
    
    // Should contain both aws tables
    const tableNames = tables.map((t: any) => t[tableProperty]);
    expect(tableNames).toContain('s3_bucket');
    expect(tableNames).toContain('ec2_instance');
    expect(tableNames).not.toContain('storage_account');
  });
  
  test('filters tables by name pattern', async () => {
    const response = await mcpServer.sendRequest('tools/call', {
      name: 'list_tables',
      arguments: { 
        filter: '%s3%' 
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
    
    // Should have exactly 1 table matching the s3 pattern
    expect(tables.length).toBe(1);
    
    // Find the correct property names for schema and table
    const firstTable = tables[0];
    const schemaProperty = 'schema' in firstTable ? 'schema' : 'table_schema';
    const tableProperty = 'name' in firstTable ? 'name' : 'table_name';
    
    // Check the filtered table
    expect(tables[0][schemaProperty]).toBe('aws');
    expect(tables[0][tableProperty]).toBe('s3_bucket');
  });
});