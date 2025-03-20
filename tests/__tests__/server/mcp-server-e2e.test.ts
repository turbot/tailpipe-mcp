import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { mkdirSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import duckdb from 'duckdb';
import { randomUUID } from 'crypto';
import { describe, expect, test, beforeAll, afterAll, afterEach } from '@jest/globals';
import { LogLevel, logger } from '../../src/services/logger.js';

// Create a temp directory for our test
const testDir = join(process.cwd(), '.tmp-test');

describe('MCP Server E2E Tests', () => {
  let dbPath: string;
  let mcpProcess: ChildProcessWithoutNullStreams | null = null;

  beforeAll(async () => {
    // Configure logger for tests
    logger.configure({
      level: LogLevel.ERROR, // Only show errors during tests
      isTestEnvironment: true // Store logs in memory instead of printing
    });
    
    // Create test directory if it doesn't exist
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }

    // Create a unique database file path
    dbPath = join(testDir, `test-${randomUUID()}.db`);
    logger.debug(`Creating test database at ${dbPath}`);

    // Set up the test database
    await setupTestDatabase();
  });

  afterAll(() => {
    // Clean up database
    try {
      if (existsSync(dbPath)) {
        unlinkSync(dbPath);
        logger.debug(`Removed temporary database: ${dbPath}`);
      }
    } catch (err) {
      logger.error(`Warning: Could not remove temporary database: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  afterEach(async () => {
    // Kill MCP process if it's running
    if (mcpProcess) {
      try {
        // First try to kill process nicely
        mcpProcess.kill('SIGTERM');
        
        // Give it a chance to exit cleanly
        await new Promise<void>(resolve => {
          const timeout = setTimeout(() => {
            // If it hasn't exited, force kill
            try {
              mcpProcess?.kill('SIGKILL');
            } catch (e) {
              // Process might already be gone
            }
            resolve();
          }, 500);
          
          // Clear timeout if process exits cleanly
          mcpProcess?.once('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      } catch (e) {
        // Process might already be gone
      }
      
      mcpProcess = null;
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
            logger.debug('Test database created successfully');
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
      
      // Set a timeout to avoid hanging
      timeoutId = setTimeout(() => {
        process.stdout.removeListener('data', messageHandler);
        reject(new Error(`Request timed out after 5 seconds. Request ID: ${fullRequest.id}`));
      }, 5000);
      
      // Send the request
      process.stdin.write(JSON.stringify(fullRequest) + '\n');
    });
  }

  // Start the MCP server with output visible
  async function startServerWithVisibleOutput(): Promise<void> {
    const spawnProcess = spawn('node', ['dist/index.js', dbPath], {
      stdio: ['pipe', 'inherit', 'inherit']
    });
    
    mcpProcess = spawnProcess as unknown as ChildProcessWithoutNullStreams;
    
    // Wait for server to start
    await new Promise<void>(resolve => setTimeout(resolve, 1000));
  }

  // Start MCP server for request tests
  async function startServer(): Promise<ChildProcessWithoutNullStreams> {
    const process = spawn('node', ['dist/index.js', dbPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    mcpProcess = process;
    
    // Wait for server to start
    await new Promise<void>(resolve => setTimeout(resolve, 1000));
    
    return process;
  }

  test('should list available tools', async () => {
    // Start MCP server
    const server = await startServer();
    
    // Get tools list
    const response = await sendMCPRequest(server, {
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
    expect(toolNames).toContain('query_tailpipe');
    expect(toolNames).toContain('list_tailpipe_tables');
  }, 10000);

  test('should execute query successfully', async () => {
    // Start MCP server
    const server = await startServer();
    
    // Execute query
    const response = await sendMCPRequest(server, {
      method: "tools/call",
      params: {
        name: "query_tailpipe",
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
  }, 10000);

  test('should list tables successfully', async () => {
    // Start MCP server
    const server = await startServer();
    
    // List tables
    const response = await sendMCPRequest(server, {
      method: "tools/call",
      params: {
        name: "list_tailpipe_tables",
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
  }, 10000);
});