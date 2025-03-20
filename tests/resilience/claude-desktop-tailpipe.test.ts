import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { mkdirSync, existsSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';
import { describe, expect, test, beforeAll, afterAll, afterEach } from '@jest/globals';

// Extended timeout for the test - 30 seconds

describe('Claude Desktop Tailpipe Resilience Test', () => {
  let dbPath: string;
  let mcpProcess: ChildProcessWithoutNullStreams;

  beforeAll(() => {
    // Create temp directory for test
    const tempDir = join(process.cwd(), '.tmp-test');
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
    
    // Make the database file name match the pattern seen in Claude Desktop
    dbPath = join(tempDir, `tailpipe_20250313151518.db`);
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

  // Create an invalid database file
  function createInvalidDatabaseFile(): void {
    // Create a minimal but invalid database file
    // The goal is to test that even with a broken DB file, the server 
    // will still handle requests gracefully
    writeFileSync(dbPath, Buffer.from('INVALID TAILPIPE DATABASE', 'utf8'));
    console.log(`Created test file at ${dbPath}`);
  }

  // Start MCP server and capture responses
  function startMCPServer(): Promise<{
    process: ChildProcessWithoutNullStreams,
    responsesPromise: Promise<Record<string, any>>
  }> {
    return new Promise((resolve) => {
      console.log('Starting MCP server...');
      
      const process = spawn('node', ['dist/index.js', dbPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      // Track responses
      const responses: Record<string, any> = {};
      
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
            
            if (parsed.id) {
              responses[parsed.id] = parsed;
            }
          } catch (e) {
            // Not JSON or other issue, just ignore
          }
        }
      });
      
      process.stderr.on('data', (data) => {
        const stderr = data.toString().trim();
        console.error(`Server stderr: ${stderr}`);
      });
      
      // Wait for server to start
      setTimeout(() => {
        // Create a promise that will resolve when we have all expected responses
        const responsesPromise = new Promise<Record<string, any>>((resolveResponses) => {
          const requiredResponses = ['initialize', 'resources-list', 'tools-list', 'list-tables'];
          
          // Check every 500ms if we have all required responses
          const checkInterval = setInterval(() => {
            const missingResponses = requiredResponses.filter(id => !responses[id]);
            if (missingResponses.length === 0) {
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
        
        resolve({ process, responsesPromise });
      }, 1000);
    });
  }

  test('should handle requests with invalid database file', async () => {
    // Create invalid database file
    createInvalidDatabaseFile();
    
    // Start MCP server
    const { process, responsesPromise } = await startMCPServer();
    mcpProcess = process;
    
    // Send initialize request
    const initializeRequest = {
      jsonrpc: "2.0",
      id: "initialize",
      method: 'initialize',
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "claude-ai",
          version: "0.1.0"
        }
      }
    };
    mcpProcess.stdin.write(JSON.stringify(initializeRequest) + '\n');
    
    // Wait before next request
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Send resources/list request
    const resourcesRequest = {
      jsonrpc: "2.0",
      id: "resources-list",
      method: 'resources/list',
      params: {}
    };
    mcpProcess.stdin.write(JSON.stringify(resourcesRequest) + '\n');
    
    // Wait before next request
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Send tools/list request
    const toolsRequest = {
      jsonrpc: "2.0",
      id: "tools-list",
      method: 'tools/list',
      params: {}
    };
    mcpProcess.stdin.write(JSON.stringify(toolsRequest) + '\n');
    
    // Wait before next request
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Try the list_tables tool
    const listTablesRequest = {
      jsonrpc: "2.0",
      id: "list-tables",
      method: 'tools/call',
      params: {
        name: 'list_tables',
        arguments: {}
      }
    };
    mcpProcess.stdin.write(JSON.stringify(listTablesRequest) + '\n');
    
    // Wait for all responses
    const responses = await responsesPromise;
    
    // Verify initialize response
    expect(responses['initialize']).toBeDefined();
    expect(responses['initialize'].result).toBeDefined();
    
    // Verify resources/list response
    expect(responses['resources-list']).toBeDefined();
    expect(responses['resources-list'].result).toBeDefined();
    expect(responses['resources-list'].result.resources).toBeInstanceOf(Array);
    
    // Verify tools/list response
    expect(responses['tools-list']).toBeDefined();
    expect(responses['tools-list'].result).toBeDefined();
    expect(responses['tools-list'].result.tools).toBeInstanceOf(Array);
    
    // The list-tables may error with invalid DB, but should return a response
    expect(responses['list-tables']).toBeDefined();
    
    // If list-tables returns an error, it should have the proper error format
    if (responses['list-tables'].error) {
      expect(responses['list-tables'].error.code).toBeDefined();
      expect(responses['list-tables'].error.message).toBeDefined();
    }
    // If list-tables returns a result, it should have the proper format
    else if (responses['list-tables'].result) {
      expect(responses['list-tables'].result.content).toBeInstanceOf(Array);
    }
  }, 30000);
});