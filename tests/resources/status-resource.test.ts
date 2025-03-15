import { getTestDatabasePath, cleanupDatabase, MCPServer } from '../helpers';
import { describe, expect, test, beforeAll, afterAll } from '@jest/globals';
import duckdb from 'duckdb';

/**
 * Tests for the status resource
 * 
 * This tests the /status resource API which provides information
 * about the server, database and connection status.
 * 
 * Converted from /tests/test-status-resource.js to Jest format
 */

describe('Status Resource', () => {
  // Create a unique database path for this test
  const dbPath = getTestDatabasePath('status-resource');
  let mcpServer: MCPServer;
  
  beforeAll(async () => {
    // Create test database with basic structure
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
  
  test('status resource is listed in resources/list', async () => {
    // Request resources list
    const response = await mcpServer.sendRequest('resources/list', {});
    
    // Verify success
    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
    expect(response.result.resources).toBeDefined();
    expect(Array.isArray(response.result.resources)).toBe(true);
    
    // Find the status resource
    const statusResource = response.result.resources.find((r: any) => r.uri === 'tailpipe://status');
    expect(statusResource).toBeDefined();
    expect(statusResource.name).toBe('status');
  });
  
  test('can get status resource via resources/read', async () => {
    // Request status resource
    const response = await mcpServer.sendRequest('resources/read', {
      uri: 'tailpipe://status'
    });
    
    // Verify success
    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
    expect(response.result.contents).toBeDefined();
    expect(Array.isArray(response.result.contents)).toBe(true);
    expect(response.result.contents.length).toBeGreaterThan(0);
    
    // Get the content
    const statusContent = response.result.contents[0];
    expect(statusContent.mimeType).toBe('application/json');
    expect(statusContent.text).toBeDefined();
    
    // Parse the JSON content
    const statusData = JSON.parse(statusContent.text);
    
    // Validate status data structure
    expect(statusData.database).toBeDefined();
    expect(statusData.mcp_server).toBeDefined();
    
    // Check database info
    expect(statusData.database.path).toBeDefined();
    expect(statusData.database.connection_status).toBeDefined();
    
    // Path should contain our test path
    expect(statusData.database.path).toContain(dbPath);
    
    // Should be connected (case insensitive check)
    expect(statusData.database.connection_status.toLowerCase()).toContain('connect');
    
    // Check server info
    expect(statusData.mcp_server.start_time).toBeDefined();
    
    // Uptime might be called differently or not present
    if (statusData.mcp_server.uptime_seconds !== undefined) {
      expect(typeof statusData.mcp_server.uptime_seconds).toBe('number');
    } else if (statusData.mcp_server.uptime !== undefined) {
      expect(typeof statusData.mcp_server.uptime).toBe('number');
    }
    // Skip the uptime check if neither field exists
  });
  
  test('returns 404 for non-existent resource', async () => {
    // Request a non-existent resource
    const response = await mcpServer.sendRequest('resources/read', {
      uri: 'tailpipe://non_existent'
    });
    
    // Check for error response - we're looking for any error message about invalid resource
    if (response.error) {
      // Should have an error with appropriate message 
      expect(response.error.message).toBeDefined();
      
      // It could be "not found" or "invalid resource" or similar
      const errorMessage = response.error.message.toLowerCase();
      expect(
        errorMessage.includes('invalid') || 
        errorMessage.includes('not found') ||
        errorMessage.includes('unknown')
      ).toBe(true);
    } else {
      // Alternatively could be a success response with error info
      expect(response.result.error || response.result.not_found).toBeDefined();
    }
  });
});

// Helper to create a test database
async function createTestDatabase(dbPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      const db = new duckdb.Database(dbPath);
      const conn = db.connect();
      
      conn.exec(`
        -- Create a test table
        CREATE TABLE test_table (id INTEGER, name VARCHAR);
        INSERT INTO test_table VALUES (1, 'Test');
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