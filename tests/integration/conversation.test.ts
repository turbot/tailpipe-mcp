import { getTestDatabasePath, cleanupDatabase, MCPServer } from '../helpers';
import { describe, expect, test, beforeAll, afterAll } from '@jest/globals';
import duckdb from 'duckdb';

/**
 * Conversation flow tests
 * 
 * Tests a sequence of MCP requests that simulate a real conversation flow.
 * Converted from conversation.js to Jest format.
 */

describe('MCP Conversation Flow', () => {
  // Create a unique database path for this test
  const dbPath = getTestDatabasePath('conversation-flow');
  let mcpServer: MCPServer;
  
  beforeAll(async () => {
    // Create a test database with sample data
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

  test('executes a full conversation flow with multiple requests', async () => {
    // Define the test messages in sequence
    const testMessages = [
      { 
        description: 'Hello request', 
        request: { method: 'info/hello', params: {} },
        validation: (response: any) => {
          // The hello endpoint is optional in the MCP spec
          if (response.error && response.error.code === -32601) {
            // Method not found is acceptable
            expect(response.error.code).toBe(-32601);
          } else {
            expect(response.error).toBeUndefined();
            expect(response.result).toBeDefined();
          }
        }
      },
      { 
        description: 'List tools', 
        request: { method: 'tools/list', params: {} },
        validation: (response: any) => {
          expect(response.error).toBeUndefined();
          expect(response.result).toBeDefined();
          expect(response.result.tools).toBeDefined();
          expect(Array.isArray(response.result.tools)).toBe(true);
          expect(response.result.tools.length).toBeGreaterThan(0);
          
          // Check if necessary tools exist
          const toolNames = response.result.tools.map((t: any) => t.name);
          expect(toolNames).toContain('query');
          expect(toolNames).toContain('list_tables');
        }
      },
      { 
        description: 'Execute a simple query', 
        request: { 
          method: 'tools/call', 
          params: { 
            name: 'query', 
            arguments: { sql: 'SELECT * FROM test_data' } 
          } 
        },
        validation: (response: any) => {
          expect(response.error).toBeUndefined();
          expect(response.result).toBeDefined();
          expect(response.result.content).toBeDefined();
          
          // Find the text content
          const textContent = response.result.content.find((item: any) => item.type === 'text');
          expect(textContent).toBeDefined();
          expect(textContent.text).toBeDefined();
          
          // Check query results contain expected data
          expect(textContent.text).toContain('test1');
          expect(textContent.text).toContain('test2');
        }
      },
      { 
        description: 'List tables', 
        request: { 
          method: 'tools/call', 
          params: { 
            name: 'list_tables', 
            arguments: {} 
          } 
        },
        validation: (response: any) => {
          expect(response.error).toBeUndefined();
          expect(response.result).toBeDefined();
          expect(response.result.content).toBeDefined();
          
          // Find the text content
          const textContent = response.result.content.find((item: any) => item.type === 'text');
          expect(textContent).toBeDefined();
          
          // Parse tables JSON
          const tables = JSON.parse(textContent.text);
          expect(Array.isArray(tables)).toBe(true);
          
          // Find test_data table
          const testDataTable = tables.find((t: any) => t.name === 'test_data');
          expect(testDataTable).toBeDefined();
          
          // Find aws schema table
          const awsTable = tables.find((t: any) => t.schema === 'aws' && t.name === 'resources');
          expect(awsTable).toBeDefined();
        }
      },
      { 
        description: 'Query AWS schema', 
        request: { 
          method: 'tools/call', 
          params: { 
            name: 'query', 
            arguments: { sql: 'SELECT * FROM aws.resources' } 
          } 
        },
        validation: (response: any) => {
          expect(response.error).toBeUndefined();
          expect(response.result).toBeDefined();
          expect(response.result.content).toBeDefined();
          
          // Find the text content
          const textContent = response.result.content.find((item: any) => item.type === 'text');
          expect(textContent).toBeDefined();
          
          // Check results contain expected AWS resource data
          expect(textContent.text).toContain('instance');
          expect(textContent.text).toContain('bucket');
          expect(textContent.text).toContain('us-east-1');
          expect(textContent.text).toContain('us-west-2');
        }
      }
    ];
    
    // Execute each message in sequence
    for (const [index, message] of testMessages.entries()) {
      // Log the current step
      console.log(`Test ${index + 1}: ${message.description}`);
      
      // Send the request
      const response = await mcpServer.sendRequest(
        message.request.method,
        message.request.params
      );
      
      // Run the validation for this step
      message.validation(response);
    }
  });
});

/**
 * Helper to create a test database with sample data
 */
async function createTestDatabase(dbPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      const db = new duckdb.Database(dbPath);
      const conn = db.connect();
      
      conn.exec(`
        -- Create main table
        CREATE TABLE test_data (id INTEGER, name VARCHAR, value DOUBLE);
        INSERT INTO test_data VALUES 
          (1, 'test1', 10.5),
          (2, 'test2', 20.5);
        
        -- Create custom AWS schema
        CREATE SCHEMA aws;
        CREATE TABLE aws.resources (id VARCHAR, region VARCHAR, type VARCHAR);
        INSERT INTO aws.resources VALUES 
          ('r-123', 'us-east-1', 'instance'),
          ('r-456', 'us-west-2', 'bucket');
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