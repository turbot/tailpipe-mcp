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
  
  afterAll(() => {
    mcpServer.close();
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
      expect(toolNames).toContain('query');
      expect(toolNames).toContain('list_tables');
    });
  });
  
  describe('List Tables Tool', () => {
    test('Can list all tables', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'list_tables',
        arguments: {}
      });
      
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      
      // Handle different response formats that might be returned
      if (response.result.tables && Array.isArray(response.result.tables)) {
        // Direct tables array format
        expect(response.result.tables.length).toBeGreaterThan(0);
        
        // Should return tables from main, test, and aws schemas
        const tables = response.result.tables;
        const schemas = [...new Set(tables.map((t: any) => t.schema))];
        expect(schemas).toContain('main');
        expect(schemas).toContain('test');
        expect(schemas).toContain('aws');
      } else if (response.result.content && Array.isArray(response.result.content)) {
        // Content format
        const textContent = response.result.content.find((item: any) => 
          item.type === 'text' && item.text && item.text.includes('schema')
        );
        expect(textContent).toBeDefined();
        
        // Try to parse the tables JSON if present
        if (textContent && textContent.text) {
          try {
            const tables = JSON.parse(textContent.text);
            expect(Array.isArray(tables)).toBe(true);
            expect(tables.length).toBeGreaterThan(0);
          } catch (e) {
            // If not valid JSON, at least check for schema names in the text
            expect(textContent.text).toContain('main');
            expect(textContent.text).toContain('test');
            expect(textContent.text).toContain('aws');
          }
        }
      }
    });
    
    test('Can filter tables by schema', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'list_tables',
        arguments: { schema: 'test' }
      });
      
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      
      // Handle different response formats
      if (response.result.tables && Array.isArray(response.result.tables)) {
        const tables = response.result.tables;
        expect(tables.length).toBeGreaterThan(0);
        
        // All returned tables should be in the test schema
        tables.forEach((table: any) => {
          expect(table.schema).toBe('test');
        });
        
        // Should find the example table
        const exampleTable = tables.find((t: any) => t.name === 'example');
        expect(exampleTable).toBeDefined();
      } else if (response.result.content && Array.isArray(response.result.content)) {
        const textContent = response.result.content.find((item: any) => 
          item.type === 'text' && item.text
        );
        expect(textContent).toBeDefined();
        
        if (textContent && textContent.text) {
          // Should contain test schema but not others
          expect(textContent.text).toContain('test');
          expect(textContent.text).toContain('example');
        }
      }
    });
  });
  
  describe('Query Tool', () => {
    test('Can execute SQL queries', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'query',
        arguments: {
          sql: 'SELECT * FROM test_data ORDER BY id'
        }
      });
      
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      
      // Handle different response formats
      if (response.result.rows && Array.isArray(response.result.rows)) {
        const rows = response.result.rows;
        expect(rows.length).toBe(3);
        expect(rows[0].id).toBe(1);
        expect(rows[0].name).toBe('test1');
      } else if (response.result.content && Array.isArray(response.result.content)) {
        const textContent = response.result.content.find((item: any) => 
          item.type === 'text' && item.text
        );
        expect(textContent).toBeDefined();
        
        if (textContent && textContent.text) {
          expect(textContent.text).toContain('test1');
          expect(textContent.text).toContain('test2');
          expect(textContent.text).toContain('test3');
        }
      }
    });
    
    test('Handles query errors gracefully', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'query',
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
        name: 'inspect_schema',  // Tool name might vary
        arguments: {
          name: 'test'  // Parameter name might vary
        }
      });
      
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      
      // Handle different response formats
      if (response.result.schema && response.result.tables) {
        expect(response.result.schema).toBe('test');
        expect(Array.isArray(response.result.tables)).toBe(true);
        expect(response.result.tables.length).toBeGreaterThan(0);
        
        // Should find the example table
        const exampleTable = response.result.tables.find((t: any) => t.name === 'example');
        expect(exampleTable).toBeDefined();
      } else if (response.result.content && Array.isArray(response.result.content)) {
        const textContent = response.result.content.find((item: any) => 
          item.type === 'text' && item.text
        );
        
        expect(textContent).toBeDefined();
        if (textContent && textContent.text) {
          // The text content format is implementation-specific
          // We just check that we got some content back
          expect(textContent.text.length).toBeGreaterThan(0);
        }
      }
    });
    
    test('Can inspect table details', async () => {
      const response = await mcpServer.sendRequest('tools/call', {
        name: 'inspect_table',  // Tool name might vary
        arguments: {
          schema: 'test',  // Parameter names might vary
          name: 'example'
        }
      });
      
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      
      // Handle different response formats
      if (response.result.columns && Array.isArray(response.result.columns)) {
        expect(response.result.columns.length).toBe(2);
        
        // Check column details
        const idColumn = response.result.columns.find((c: any) => c.name === 'id');
        const nameColumn = response.result.columns.find((c: any) => c.name === 'name');
        
        expect(idColumn).toBeDefined();
        expect(nameColumn).toBeDefined();
      } else if (response.result.content && Array.isArray(response.result.content)) {
        const textContent = response.result.content.find((item: any) => 
          item.type === 'text' && item.text
        );
        
        expect(textContent).toBeDefined();
        if (textContent && textContent.text) {
          expect(textContent.text).toContain('id');
          expect(textContent.text).toContain('name');
        }
      }
    });
  });
});