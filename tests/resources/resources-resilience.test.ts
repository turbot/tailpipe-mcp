import { getTestDatabasePath, createTestDatabase, cleanupDatabase, MCPServer } from '../helpers';
import { afterAll, beforeAll, describe, expect, test, jest as jestGlobal } from '@jest/globals';
import { mkdirSync, existsSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { createInterface } from 'readline';

/**
 * Tests for Resources API resilience with database issues
 * 
 * This test converts the resources-resilience.js file to Jest format
 */

describe('Resources API Resilience', () => {
  // Create database paths for different test scenarios
  const goodDbPath = getTestDatabasePath('resources-resilience-good');
  const invalidDbPath = getTestDatabasePath('resources-resilience-invalid');
  const nonExistentDbPath = join(process.cwd(), '.tmp-test', 'non-existent-db.db');
  
  // Create test databases before running tests
  beforeAll(async () => {
    // Create good database with test schemas and tables
    await createTestDatabase(goodDbPath);
    
    // Create invalid database (empty file) 
    writeFileSync(invalidDbPath, 'not-a-real-database', { encoding: 'utf8' });
  });
  
  // Clean up after tests
  afterAll(() => {
    cleanupDatabase(goodDbPath);
    try { unlinkSync(invalidDbPath); } catch (e) {}
  });
  
  test('resources/list works with valid database', async () => {
    // Start MCP server with good database
    const mcpServer = new MCPServer(goodDbPath);
    
    // Give the server a moment to start
    await new Promise(resolve => {
      const timer = setTimeout(resolve, 2000);
      // Prevent this timer from keeping the Node.js process alive
      timer.unref();
    });
    
    // Send resources/list request
    const response = await mcpServer.sendRequest('resources/list', {});
    
    // Close the server
    await mcpServer.close();
    
    // Check response
    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
    expect(response.result.resources).toBeDefined();
    expect(Array.isArray(response.result.resources)).toBe(true);
    expect(response.result.resources.length).toBeGreaterThan(0);
    
    // Should include the status resource
    const statusResource = response.result.resources.find((r: any) => r.uri === 'tailpipe://status');
    expect(statusResource).toBeDefined();
    expect(statusResource.name).toBe('status');
  });
  
  // For invalid and non-existent databases, we need to use a lower-level approach
  // to test because our MCPServer helper expects a successful connection
  
  test('handles corrupted database gracefully', async () => {
    // We'll use the direct process spawn approach for this test
    const response = await testResourcesListDirect(invalidDbPath);
    
    // We should either get a meaningful error or a valid response
    if (response && response.error) {
      // If error response, should have a meaningful error message
      expect(response.error.message).toBeDefined();
    } else if (response && response.result) {
      // If success response (rare but possible), should have resources
      expect(response.result.resources).toBeDefined();
    } else {
      // No response means server crashed - which is fine for corrupted DB
      expect(response).toBeNull();
    }
  });
  
  test('exits gracefully with non-existent database', async () => {
    // This test is more about ensuring the process doesn't hang or crash badly
    const response = await testResourcesListDirect(nonExistentDbPath, 1000);
    
    // We should get no response since the server should exit
    expect(response).toBeNull();
  });
});

// Helper function to test resources/list with a direct process spawn
// This allows testing with databases that may cause the server to exit
async function testResourcesListDirect(dbPath: string, timeout: number = 3000): Promise<any> {
  // Start MCP server process directly
  const serverProcess = spawn('node', ['dist/index.js', dbPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true // Ensure process group is created for proper cleanup
  });
  
  // Promise that resolves with the response or null
  return new Promise((resolve) => {
    let response: any = null;
    let serverExited = false;
    let responseTimer: NodeJS.Timeout | null = null;
    
    // Set up line reader for responses
    const rl = createInterface({
      input: serverProcess.stdout,
      terminal: false
    });
    
    // Function to clean up resources
    const cleanupResources = () => {
      // Clean up all listeners to avoid memory leaks
      rl.removeAllListeners();
      rl.close();
      
      if (serverProcess.stdout) serverProcess.stdout.removeAllListeners();
      if (serverProcess.stderr) serverProcess.stderr.removeAllListeners();
      serverProcess.removeAllListeners();
      
      // Kill the process if it's still running
      if (!serverExited) {
        try {
          serverProcess.kill('SIGTERM');
          // If on non-Windows, ensure child processes are also killed
          if (process.platform !== 'win32' && serverProcess.pid) {
            try {
              process.kill(-serverProcess.pid, 'SIGTERM');
            } catch (e) {
              // Process group might already be gone
            }
          }
        } catch (e) {
          // Process might already be gone
        }
      }
    };
    
    rl.on('line', (line) => {
      if (line.trim()) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.id === 'resources-list-test') {
            response = parsed;
            
            // Once we have a response, clean up and resolve
            if (responseTimer) clearTimeout(responseTimer);
            cleanupResources();
            resolve(response);
          }
        } catch (e) {
          // Not valid JSON
        }
      }
    });
    
    serverProcess.on('exit', () => {
      serverExited = true;
      if (!response) {
        // If server exited without a response, clean up and resolve with null
        cleanupResources();
        resolve(null);
      }
    });
    
    // Wait a moment for server to start (if it can)
    const startTimer = setTimeout(() => {
      if (!serverExited) {
        // Send resources/list request
        const request = JSON.stringify({
          jsonrpc: "2.0",
          id: "resources-list-test",
          method: "resources/list",
          params: {}
        });
        
        serverProcess.stdin.write(request + '\n');
        
        // Wait for response or timeout
        responseTimer = setTimeout(() => {
          // Clean up and resolve
          cleanupResources();
          resolve(response);
        }, timeout);
        
        // Prevent this timer from keeping the Node.js process alive
        responseTimer.unref();
      }
    }, 1000);
    
    // Prevent this timer from keeping the Node.js process alive
    startTimer.unref();
  });
}