import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { mkdirSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import duckdb from 'duckdb';
import { randomUUID } from 'crypto';

// Create a temp directory for our test
const testDir = join(process.cwd(), '.tmp-test');

// Test timeout increased for e2e tests
beforeAll(() => {
  jest.setTimeout(30000);
});

describe('MCP Server E2E Tests', () => {
  let dbPath: string;
  let mcpProcess: ChildProcessWithoutNullStreams;

  beforeAll(async () => {
    // Create test directory if it doesn't exist
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }

    // Create a unique database file path
    dbPath = join(testDir, `test-${randomUUID()}.db`);
    console.log(`Creating test database at ${dbPath}`);

    // Set up the test database
    await setupTestDatabase();
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

  afterEach(() => {
    // Kill MCP process if it's running
    if (mcpProcess) {
      mcpProcess.kill();
    }
  });

  // Create and populate test database
  async function setupTestDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Create a new DuckDB database
        const db = new duckdb.Database(dbPath);
        const conn = db.connect();
        
        // Create test tables and data
        conn.exec(`
          CREATE TABLE test_data (id INTEGER, name VARCHAR, value DOUBLE);
          INSERT INTO test_data VALUES 
            (1, 'test1', 10.5),
            (2, 'test2', 20.5),
            (3, 'test3', 30.5);
          
          CREATE SCHEMA aws;
          CREATE TABLE aws.test_resources (
            id VARCHAR, 
            region VARCHAR, 
            type VARCHAR,
            created_at TIMESTAMP
          );
          INSERT INTO aws.test_resources VALUES
            ('r-1234', 'us-east-1', 'instance', '2023-01-01 12:00:00'),
            ('r-5678', 'us-west-2', 'bucket', '2023-02-15 09:30:00');
        `, (err) => {
          if (err) {
            reject(err);
            return;
          }
          
          // Close connection
          conn.close();
          db.close(() => {
            console.log('Test database created successfully');
            resolve();
          });
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  // Send MCP request and handle response
  function sendMCPRequest(process: ChildProcessWithoutNullStreams, request: any): Promise<any> {
    return new Promise((resolve, reject) => {
      // Add jsonrpc version and ID if not provided
      const fullRequest = {
        jsonrpc: "2.0",
        id: request.id || `request-${Math.floor(Math.random() * 1000)}`,
        ...request
      };
      
      // Track full lines received
      const lines: string[] = [];
      let messageHandler: (data: Buffer) => void;
      let timeoutId: NodeJS.Timeout;
      
      // Set up the message handler to process line by line
      messageHandler = (data: Buffer) => {
        const chunk = data.toString();
        const newLines = chunk.split('\n').filter(l => l.trim());
        
        lines.push(...newLines);
        
        // Try to find a matching response for our request
        for (let i = 0; i < lines.length; i++) {
          try {
            const parsed = JSON.parse(lines[i]);
            
            // Check if this is a response to our request
            if (parsed.id === fullRequest.id) {
              process.stdout.removeListener('data', messageHandler);
              clearTimeout(timeoutId);
              resolve(parsed);
              return;
            }
          } catch (err) {
            // Not valid JSON, skip this line
          }
        }
      };

      // Listen for responses
      process.stdout.on('data', messageHandler);
      
      // Set a timeout to avoid hanging (20 seconds should be plenty)
      timeoutId = setTimeout(() => {
        process.stdout.removeListener('data', messageHandler);
        reject(new Error(`Request timed out after 20 seconds. Request ID: ${fullRequest.id}`));
      }, 20000);
      
      // Send the request
      process.stdin.write(JSON.stringify(fullRequest) + '\n');
    });
  }

  // Start the MCP server
  async function startMCPServer(): Promise<ChildProcessWithoutNullStreams> {
    return new Promise((resolve, reject) => {
      // Start the MCP server process
      console.log('Starting MCP server...');
      console.log(`Command: node dist/index.js ${dbPath}`);
      
      const process = spawn('node', ['dist/index.js', dbPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      // Add a data listener to detect server startup
      let startupComplete = false;
      let stderrOutput = '';
      
      process.stderr.on('data', (data) => {
        const stderr = data.toString();
        stderrOutput += stderr;
        
        // Check for startup message in stderr
        if (stderr.includes('MCP server started successfully')) {
          startupComplete = true;
        }
      });
      
      process.stdout.on('data', (data) => {
        const output = data.toString();
        
        if (output.includes('MCP server started') || output.includes('Server started')) {
          startupComplete = true;
        }
      });
      
      process.on('error', (err) => {
        reject(err);
      });
      
      // Wait for server to start (poll every 500ms for up to 10 seconds)
      const checkStartup = async () => {
        for (let i = 0; i < 20; i++) {
          if (startupComplete) {
            resolve(process);
            return;
          }
          await new Promise(r => setTimeout(r, 500));
        }
        reject(new Error(`Server failed to start within timeout. stderr: ${stderrOutput}`));
      };
      
      checkStartup();
    });
  }

  test('should get info/hello response', async () => {
    // Start MCP server
    mcpProcess = await startMCPServer();
    
    // Send info/hello request
    const response = await sendMCPRequest(mcpProcess, {
      method: "info/hello",
      params: {}
    });
    
    // Verify response
    expect(response).toBeDefined();
    expect(response.result).toBeDefined();
    expect(response.result.name).toBe("tailpipe-mcp");
  }, 30000);

  test('should list available tools', async () => {
    // Start MCP server
    mcpProcess = await startMCPServer();
    
    // Get tools list
    const response = await sendMCPRequest(mcpProcess, {
      method: "tools/list",
      params: {}
    });
    
    // Verify response
    expect(response).toBeDefined();
    expect(response.result).toBeDefined();
    expect(response.result.tools).toBeInstanceOf(Array);
    expect(response.result.tools.length).toBeGreaterThan(0);
    
    // Verify required tools are present
    const toolNames = response.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('query');
    expect(toolNames).toContain('list_tables');
  }, 30000);

  test('should execute query successfully', async () => {
    // Start MCP server
    mcpProcess = await startMCPServer();
    
    // Execute query
    const response = await sendMCPRequest(mcpProcess, {
      method: "tools/call",
      params: {
        name: "query",
        arguments: {
          sql: "SELECT * FROM test_data"
        }
      }
    });
    
    // Verify response
    expect(response).toBeDefined();
    expect(response.result).toBeDefined();
    expect(response.result.content).toBeInstanceOf(Array);
    
    // Verify content includes JSON results
    const resultText = response.result.content[0]?.text;
    expect(resultText).toBeDefined();
    
    const parsedResults = JSON.parse(resultText);
    expect(parsedResults).toBeInstanceOf(Array);
    expect(parsedResults.length).toBe(3); // We inserted 3 rows
  }, 30000);

  test('should list tables successfully', async () => {
    // Start MCP server
    mcpProcess = await startMCPServer();
    
    // List tables
    const response = await sendMCPRequest(mcpProcess, {
      method: "tools/call",
      params: {
        name: "list_tables",
        arguments: {}
      }
    });
    
    // Verify response
    expect(response).toBeDefined();
    expect(response.result).toBeDefined();
    expect(response.result.content).toBeInstanceOf(Array);
    
    // Verify content includes JSON results
    const resultText = response.result.content[0]?.text;
    expect(resultText).toBeDefined();
    
    const parsedResults = JSON.parse(resultText);
    expect(parsedResults).toBeInstanceOf(Array);
    
    // We should have at least our test_data table and aws.test_resources
    const tableNames = parsedResults.map((t: any) => `${t.schema}.${t.name}`);
    expect(tableNames).toContain('main.test_data');
    expect(tableNames).toContain('aws.test_resources');
  }, 30000);
});