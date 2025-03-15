import { getTestDatabasePath, createTestDatabase, cleanupDatabase, MCPServer } from '../helpers';

async function debugStatusResource() {
  const dbPath = getTestDatabasePath('status-debug');
  let mcpServer: MCPServer;
  
  try {
    // Create test database
    await createTestDatabase(dbPath);
    
    // Start MCP server
    mcpServer = new MCPServer(dbPath);
    
    // Wait for server to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test resources/list
    console.log('\n--- Testing resources/list ---');
    const listResponse = await mcpServer.sendRequest('resources/list', {});
    console.log('Response:', JSON.stringify(listResponse, null, 2));
    
    // Test status resource
    console.log('\n--- Testing resources/read status ---');
    const statusResponse = await mcpServer.sendRequest('resources/read', {
      uri: 'tailpipe://status'
    });
    console.log('Response:', JSON.stringify(statusResponse, null, 2));
  } finally {
    // Clean up
    if (mcpServer) {
      mcpServer.close();
    }
    cleanupDatabase(dbPath);
  }
}

// Run debug
debugStatusResource().catch(console.error);