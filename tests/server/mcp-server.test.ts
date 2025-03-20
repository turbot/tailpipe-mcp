import { getTestDatabasePath, createTestDatabase, cleanupDatabase, MCPServer } from '../helpers';

describe('MCP Server Integration Tests', () => {
  const dbPath = getTestDatabasePath('mcp-server');
  let mcpServer: MCPServer;
  
  beforeAll(async () => {
    await createTestDatabase(dbPath);
    mcpServer = new MCPServer(dbPath);
    
    // Wait for server to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
  });
  
  afterAll(async () => {
    await mcpServer.close();
    cleanupDatabase(dbPath);
  });
  
  describe('Basic MCP Protocol', () => {
    test('Hello endpoint returns valid response', async () => {
      const response = await mcpServer.sendRequest('hello', {});
      
      // The hello endpoint is optional in the MCP specification
      // So we don't fail if it's not found
      if (response.error && response.error.code === -32601) {
        // Test is conditional - Hello is optional in MCP spec
        expect(response.error.code).toBe(-32601); // Method not found
      } else {
        expect(response.error).toBeUndefined();
        expect(response.result).toBeDefined();
        expect(response.jsonrpc).toBe('2.0');
      }
    });
    
    test('Can retrieve available tools with tools/list', async () => {
      const response = await mcpServer.sendRequest('tools/list', {});
      
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      expect(response.result.tools).toBeDefined();
      expect(Array.isArray(response.result.tools)).toBe(true);
      expect(response.result.tools.length).toBeGreaterThan(0);
      
      // Check common tool names (assuming they exist)
      const toolNames = response.result.tools.map((tool: any) => tool.name);
      expect(toolNames).toContain('query_tailpipe');
      expect(toolNames).toContain('list_tailpipe_tables');
    });
  });
  
  describe('List Tables Tool', () => {
    test('Can list all tables', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'list_tailpipe_tables',
        arguments: {}
      });
      
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      
      // Handle different response formats that might be returned
      const content = response.result.content?.find((item: any) => 
        item.type === 'text' && item.text
      );
      expect(content).toBeDefined();
      
      // Parse the table list
      const tables = JSON.parse(content.text);
      expect(Array.isArray(tables)).toBe(true);
      expect(tables.length).toBeGreaterThan(0);
      
      // Should have some tables in the test schema
      const testTables = tables.filter((t: any) => t.schema === 'test');
      expect(testTables.length).toBeGreaterThan(0);
    });
    
    test('Can filter tables by schema', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'list_tailpipe_tables',
        arguments: {
          schema: 'test'
        }
      });
      
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      
      // Handle different response formats
      const content = response.result.content?.find((item: any) => 
        item.type === 'text' && item.text
      );
      expect(content).toBeDefined();
      
      // Parse the table list
      const tables = JSON.parse(content.text);
      expect(Array.isArray(tables)).toBe(true);
      expect(tables.length).toBeGreaterThan(0);
      
      // All tables should be in the test schema
      tables.forEach((table: any) => {
        expect(table.schema).toBe('test');
      });
    });
  });
  
  describe('Query Tool', () => {
    test('Can execute SQL queries', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'query_tailpipe',
        arguments: {
          sql: 'SELECT * FROM test.example'
        }
      });
      
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      
      // Handle different response formats
      const content = response.result.content?.find((item: any) => 
        item.type === 'text' && item.text
      );
      expect(content).toBeDefined();
      
      // Parse the query results
      const rows = JSON.parse(content.text);
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBeGreaterThan(0);
    });
    
    test('Handles query errors gracefully', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'query_tailpipe',
        arguments: {
          sql: 'SELECT * FROM non_existent_table'
        }
      });
      
      // Either the error should be in the JSON-RPC error field
      // or in the result with an error indication
      if (response.error) {
        expect(response.error.message).toBeDefined();
      } else if (response.result) {
        // If using content format, look for error message in text
        if (response.result.content && Array.isArray(response.result.content)) {
          const errorContent = response.result.content.find((item: any) => 
            (item.type === 'text' && item.text && 
             (item.text.toLowerCase().includes('error') || 
              item.text.toLowerCase().includes('failed') ||
              item.text.toLowerCase().includes('not exist')))
          );
          expect(errorContent).toBeDefined();
        } else {
          // Should have an error field or message
          expect(
            response.result.error || 
            response.result.message || 
            response.result.errorMessage
          ).toBeDefined();
        }
      }
    });
  });
  
  describe('Inspection Tools', () => {
    test('Can inspect database schema', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'inspect_tailpipe_database',
        arguments: {}
      });
      
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      
      // Handle different response formats
      const content = response.result.content?.find((item: any) => 
        item.type === 'text' && item.text
      );
      expect(content).toBeDefined();
      
      // Parse the schema list
      const schemas = JSON.parse(content.text);
      expect(Array.isArray(schemas)).toBe(true);
      expect(schemas.length).toBeGreaterThan(0);
      
      // Should include test schema
      expect(schemas).toContain('test');
    });
    
    test('Can inspect table details', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'inspect_tailpipe_table',
        arguments: {
          name: 'example',
          schema: 'test'
        }
      });
      
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      
      // Handle different response formats
      const content = response.result.content?.find((item: any) => 
        item.type === 'text' && item.text
      );
      expect(content).toBeDefined();
      
      // Parse the table info
      const tableInfo = JSON.parse(content.text);
      expect(tableInfo).toBeDefined();
      expect(Array.isArray(tableInfo)).toBe(true);
      expect(tableInfo.length).toBeGreaterThan(0);
    });
  });
});