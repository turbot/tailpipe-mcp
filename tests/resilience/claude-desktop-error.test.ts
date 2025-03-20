import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import duckdb from 'duckdb';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';
import { describe, expect, test, beforeAll, afterAll, afterEach } from '@jest/globals';
import { logger } from '../../src/services/logger.js';
import { MCPServer } from '../helpers';

// Extended timeout for the test - 30 seconds

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
    }
  });

  afterAll(() => {
    try {
      if (existsSync(dbPath)) {
        unlinkSync(dbPath);
      }
    } catch (err) {
      logger.error(`Failed to remove temporary database: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  // Create a test database
  function createTestDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Create a new DuckDB database
        const db = new duckdb.Database(dbPath);
        const conn = db.connect();
        
        logger.debug('Creating test tables...');
        
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
            resolve();
          });
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  // Start MCP server and return process
  async function startMCPServer(): Promise<{
    process: ChildProcessWithoutNullStreams,
    responsePromise: Promise<any[]>
  }> {
    return new Promise((resolve) => {
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
        logger.error(`Server stderr: ${stderr}`);
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

        mcpProcess = process;
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
    
    // Simulate the Claude Desktop request sequence
    await simulateClaudeDesktopSequence(process);
    
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

export function cleanupDatabase(dbPath: string): void {
  try {
    unlinkSync(dbPath);
  } catch (err) {
    // Ignore errors if file doesn't exist
  }
}

export function createTestDatabase(dbPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const db = new duckdb.Database(dbPath);
    const connection = db.connect();
    
    connection.all('SELECT 1 as test', (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

export function startMCPServer(dbPath: string): Promise<MCPServer> {
  return new Promise((resolve) => {
    const mcpServer = new MCPServer(dbPath);
    resolve(mcpServer);
  });
}