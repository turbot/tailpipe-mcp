import { getTestDatabasePath, createTestDatabase, cleanupDatabase, MCPServer } from '../../setup/test-helpers';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';

/**
 * Resources API Tests for Tailpipe MCP
 * 
 * This test converts the test-resources.js file to Jest format
 */

describe('Resources API', () => {
  const dbPath = getTestDatabasePath('resources-api');
  let mcpServer: MCPServer;
  
  beforeAll(async () => {
    // Create test database
    await createTestDatabase(dbPath);
    
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
  
  test('resources/list returns available resources', async () => {
    const response = await mcpServer.sendRequest('resources/list', {});
    
    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
    
    // Resources list should contain resource types
    expect(Array.isArray(response.result.resources)).toBe(true);
    
    // Check for specific expected resources like status
    const resourceTypes = response.result.resources.map((r: any) => r.name);
    expect(resourceTypes).toContain('status');
  });
  
  test('resources/read can read status resource', async () => {
    const response = await mcpServer.sendRequest('resources/read', {
      uri: 'tailpipe://status'
    });
    
    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
    
    // Status resource should be in contents array with JSON text
    expect(response.result.contents).toBeDefined();
    expect(Array.isArray(response.result.contents)).toBe(true);
    expect(response.result.contents.length).toBeGreaterThanOrEqual(1);
    
    // Get first content item
    const content = response.result.contents[0];
    expect(content.uri).toBe('tailpipe://status');
    expect(content.mimeType).toBe('application/json');
    expect(content.text).toBeDefined();
    
    // Parse the JSON text to get status data
    const statusData = JSON.parse(content.text);
    
    // Check database info
    expect(statusData.database).toBeDefined();
    expect(statusData.database.path).toBe(dbPath);
    expect(statusData.database.connection_status).toBe('Connected');
    
    // Check MCP server info
    expect(statusData.mcp_server).toBeDefined();
    expect(statusData.mcp_server.version).toBeDefined();
    expect(statusData.mcp_server.start_time).toBeDefined();
  });
});