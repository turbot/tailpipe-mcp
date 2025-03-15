import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import duckdb from 'duckdb';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';

// Extended timeout for the test
beforeAll(() => {
  jest.setTimeout(30000);
});

// This test specifically simulates the sequence of calls seen in Claude Desktop logs
// that was causing the error with resources/list
describe('Claude Desktop Error Regression Test', () => {
  let dbPath: string;
  let mcpProcess: ChildProcessWithoutNullStreams;

  beforeAll(() => {
    // Create temp directory for our test
    const tempDir = join(process.cwd(), '.tmp-test');
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
    
    dbPath = join(tempDir, `claude-desktop-test-${Date.now()}.db`);
  });

  afterEach(() => {
    // Kill MCP process if it's running
    if (mcpProcess) {
      mcpProcess.kill();
    }
  });

  afterAll(() => {
    // Clean up database
    try {
      if (existsSync(dbPath)) {
        unlinkSync(dbPath);
        console.log(`Removed temporary database: ${dbPath}`);
      }
    } catch (err) {
      console.error(`Warning: Could not remove temporary database: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  // Create a test database
  function createTestDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`Creating test database at ${dbPath}...`);
      
      try {
        const db = new duckdb.Database(dbPath);
        const conn = db.connect();
        
        console.log('Creating test tables...');
        conn.exec(`
          -- Create a simple schema and tables
          CREATE SCHEMA test_schema;
          
          CREATE TABLE test_schema.users (
            id INTEGER PRIMARY KEY,
            username VARCHAR,
            email VARCHAR
          );
          
          CREATE TABLE main.products (
            id INTEGER PRIMARY KEY,
            name VARCHAR,
            price DOUBLE
          );
          
          -- Insert some sample data
          INSERT INTO test_schema.users VALUES 
            (1, 'user1', 'user1@example.com'),
            (2, 'user2', 'user2@example.com');
            
          INSERT INTO main.products VALUES
            (1, 'Product A', 19.99),
            (2, 'Product B', 29.99);
        `, (err) => {
          if (err) {
            reject(err);
            return;
          }
          
          conn.close();
          db.close(() => {
            console.log('Database created successfully');
            resolve();
          });
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  // Start MCP server and return process
  function startMCPServer(): Promise<{
    process: ChildProcessWithoutNullStreams,
    responsePromise: Promise<any[]>
  }> {
    return new Promise((resolve) => {
      console.log('Starting MCP server...');
      
      const process = spawn('node', ['dist/index.js', dbPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      // Track responses
      const responses: any[] = [];
      
      // Use readline for proper line-by-line processing
      const rl = createInterface({
        input: process.stdout,
        terminal: false
      });
      
      rl.on('line', (line) => {
        if (line.trim()) {
          try {
            // Try to parse the JSON response
            const parsed = JSON.parse(line);
            responses.push(parsed);
          } catch (e) {
            // Not JSON or other issue, just log
          }
        }
      });
      
      process.stderr.on('data', (data) => {
        const stderr = data.toString().trim();
        console.error(`Server stderr: ${stderr}`);
      });
      
      // Wait for server to start
      setTimeout(() => {
        // Prepare a promise that resolves when we have all responses
        const responsePromise = new Promise<any[]>((resolveResponses) => {
          // Check for responses every 500ms
          const checkInterval = setInterval(() => {
            if (responses.length >= 4) {
              clearInterval(checkInterval);
              resolveResponses(responses);
            }
          }, 500);

          // Set a timeout to avoid hanging
          setTimeout(() => {
            clearInterval(checkInterval);
            resolveResponses(responses);
          }, 10000);
        });

        resolve({ process, responsePromise });
      }, 1000);
    });
  }

  // Simulate the exact sequence of requests that Claude Desktop makes
  async function simulateClaudeDesktopSequence(process: ChildProcessWithoutNullStreams): Promise<void> {
    // Step 1: Send initialize request
    const initializeRequest = {
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "claude-ai",
          version: "0.1.0"
        }
      },
      jsonrpc: "2.0",
      id: 0
    };
    process.stdin.write(JSON.stringify(initializeRequest) + '\n');
    
    // Wait a bit to simulate client processing
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Step 2: Send resources/list request
    const resourcesListRequest = {
      method: "resources/list",
      params: {},
      jsonrpc: "2.0",
      id: "resources-list"
    };
    process.stdin.write(JSON.stringify(resourcesListRequest) + '\n');
    
    // Wait a bit to simulate client processing
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Step 3: Send prompts/list request
    const promptsListRequest = {
      method: "prompts/list",
      params: {},
      jsonrpc: "2.0",
      id: "prompts-list" 
    };
    process.stdin.write(JSON.stringify(promptsListRequest) + '\n');
    
    // Wait a bit to simulate client processing
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Step 4: Send tools/list request
    const toolsListRequest = {
      method: "tools/list",
      params: {},
      jsonrpc: "2.0",
      id: "tools-list"
    };
    process.stdin.write(JSON.stringify(toolsListRequest) + '\n');
  }

  test('should handle Claude Desktop request sequence correctly', async () => {
    // Create test database
    await createTestDatabase();
    
    // Start MCP server
    const { process, responsePromise } = await startMCPServer();
    mcpProcess = process;
    
    // Simulate the Claude Desktop request sequence
    await simulateClaudeDesktopSequence(mcpProcess);
    
    // Wait for all responses to be received
    const responses = await responsePromise;
    
    // Verify we got the expected number of responses
    expect(responses.length).toBeGreaterThanOrEqual(4);
    
    // Find resources/list response
    const resourcesResponse = responses.find(r => r.id === 'resources-list');
    expect(resourcesResponse).toBeDefined();
    
    // Check if resources/list response has the correct format
    expect(resourcesResponse.result).toBeDefined();
    expect(resourcesResponse.result.resources).toBeInstanceOf(Array);
    
    // Note: Even with an empty database, resources API should return resources
    // (possibly empty array, but in a valid format)
    expect(Array.isArray(resourcesResponse.result.resources)).toBe(true);
  }, 30000);
});