import { spawn, ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { unlinkSync, existsSync } from 'fs';
import { Readable, Writable } from 'stream';
import duckdb from 'duckdb';
import { logger } from '../src/services/logger.js';

// Type augmentation for DuckDB Connection to add missing types from the connection object
declare module 'duckdb' {
  interface Connection {
    exec(sql: string, callback: (err: Error | null) => void): void;
  }
}

// Types
export interface MCPResponse {
  jsonrpc?: string;
  id?: string;
  result?: any;
  error?: any;
}

// Helper to create a unique database path
export function getTestDatabasePath(testName: string): string {
  const testId = randomUUID().substring(0, 8);
  return join(process.cwd(), '.tmp-test', `${testName}-${testId}.db`);
}

/**
 * Helper to wait for a specified duration with a timer that won't keep the process alive
 * @param ms Timeout duration in milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    const timeout = setTimeout(resolve, ms);
    timeout.unref(); // Prevent timer from keeping the process alive
  });
}

// Helper to create a test database with sample data
export function createTestDatabase(dbPath: string): Promise<void> {
  logger.info(`Creating test database at ${dbPath}`);
  
  return new Promise((resolve, reject) => {
    try {
      const db = new duckdb.Database(dbPath);
      const conn = db.connect();
      
      conn.exec(`
        -- Create main table
        CREATE TABLE test_data (
          id INTEGER, 
          name VARCHAR, 
          value DOUBLE
        );
        INSERT INTO test_data VALUES 
          (1, 'test1', 10.5),
          (2, 'test2', 20.5),
          (3, 'test3', 30.5);
        
        -- Create custom schema
        CREATE SCHEMA test;
        CREATE TABLE test.example (
          id INTEGER,
          name VARCHAR
        );
        INSERT INTO test.example VALUES
          (1, 'item1'),
          (2, 'item2'),
          (3, 'item3');
          
        -- Create another custom schema
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
      `, (err: Error | null) => {
        if (err) {
          logger.error(`Error creating test database: ${err.message}`);
          reject(err);
          return;
        }
        
        try {
          // Close the connection before the database
          conn.close();
          
          // Use a timeout to avoid hanging if close doesn't callback
          const timeout = setTimeout(() => {
            logger.warn(`Database close timed out for ${dbPath}`);
            resolve();
          }, 500);
          
          // Make sure the timeout doesn't keep the process alive
          timeout.unref();
          
          // Close the database
          db.close((closeErr) => {
            clearTimeout(timeout);
            if (closeErr) {
              logger.warn(`Error closing test database: ${closeErr.message}`);
            } else {
              logger.debug(`Successfully closed test database: ${dbPath}`);
            }
            resolve();
          });
        } catch (closeErr) {
          logger.warn(`Exception during test database close: ${closeErr instanceof Error ? closeErr.message : String(closeErr)}`);
          resolve(); // Still resolve to allow tests to proceed
        }
      });
    } catch (err) {
      logger.error(`Failed to set up test database: ${err instanceof Error ? err.message : String(err)}`);
      reject(err);
    }
  });
}

// Helper to clean up a test database
export function cleanupDatabase(dbPath: string): void {
  if (existsSync(dbPath)) {
    try {
      unlinkSync(dbPath);
      logger.info(`Removed test database: ${dbPath}`);
    } catch (err) {
      logger.warn(`Could not remove test database: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

// Helper to start MCP server and handle communications
export class MCPServer {
  private serverProcess: ChildProcess;
  private readline: ReturnType<typeof createInterface>;
  private responseResolvers: Map<string, (response: MCPResponse) => void> = new Map();
  
  constructor(dbPath: string) {
    // Start server process
    this.serverProcess = spawn('node', ['dist/index.js', dbPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {...process.env, SKIP_TAILPIPE_CLI: 'true'}
    });
    
    // Create readline interface for line-by-line processing
    if (!this.serverProcess.stdout) {
      throw new Error('Failed to get stdout from server process');
    }
    
    this.readline = createInterface({
      input: this.serverProcess.stdout as NodeJS.ReadableStream,
      terminal: false
    });
    
    // Set up response handler
    this.readline.on('line', (line) => {
      if (line.trim()) {
        try {
          const response = JSON.parse(line);
          
          // Find the resolver for this response's ID
          if (response.id && this.responseResolvers.has(response.id)) {
            const resolver = this.responseResolvers.get(response.id);
            if (resolver) {
              resolver(response);
              this.responseResolvers.delete(response.id);
            }
          }
        } catch (err) {
          // Non-JSON line, ignored
        }
      }
    });
    
    // Capture stderr for debugging
    if (this.serverProcess.stderr) {
      this.serverProcess.stderr.on('data', (data) => {
        // In test helpers, we collect but don't display stderr logs
        // Logger's test mode will capture these internally for inspection
      });
    }
  }
  
  // Send a request to the server and wait for response
  async sendRequest(method: string, params: any = {}): Promise<MCPResponse> {
    const id = `request-${Math.floor(Math.random() * 10000)}`;
    
    const request = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };
    
    // Create a promise to wait for the response
    const responsePromise = new Promise<MCPResponse>((resolve) => {
      this.responseResolvers.set(id, resolve);
      
      // Set a timeout to prevent hanging tests
      const timeoutId = setTimeout(() => {
        if (this.responseResolvers.has(id)) {
          resolve({ error: { message: 'Request timed out' } });
          this.responseResolvers.delete(id);
        }
      }, 5000);
      
      // Prevent this timer from keeping the Node.js process alive
      timeoutId.unref();
    });
    
    // Send the request
    if (this.serverProcess.stdin) {
      this.serverProcess.stdin.write(JSON.stringify(request) + '\n');
    } else {
      throw new Error('Failed to get stdin from server process');
    }
    
    // Wait for response
    return responsePromise;
  }
  
  // Close the server
  async close(): Promise<void> {
    // Clean up any pending request resolvers
    for (const [id, resolver] of this.responseResolvers.entries()) {
      resolver({ error: { message: 'Server closing' } });
    }
    this.responseResolvers.clear();
    
    // Close readline interface and remove all listeners
    this.readline.removeAllListeners();
    this.readline.close();
    
    // Clean up all streams
    if (this.serverProcess.stdin) {
      this.serverProcess.stdin.removeAllListeners();
      this.serverProcess.stdin.end();
    }
    
    if (this.serverProcess.stdout) {
      this.serverProcess.stdout.removeAllListeners();
    }
    
    if (this.serverProcess.stderr) {
      this.serverProcess.stderr.removeAllListeners();
    }
    
    // Remove all process listeners
    this.serverProcess.removeAllListeners();
    
    // Attempt graceful termination first
    let exited = false;
    try {
      this.serverProcess.kill('SIGTERM');
      
      // Wait for process to exit gracefully with a timeout
      await new Promise<void>(resolve => {
        const timeout = setTimeout(() => {
          // If process hasn't exited, force kill
          if (!exited) {
            try {
              this.serverProcess.kill('SIGKILL');
            } catch (e) {
              // Process might already be gone
            }
          }
          resolve();
        }, 500);
        
        // Prevent timer from keeping process alive
        timeout.unref();
        
        // Clean up if process exits
        this.serverProcess.once('exit', () => {
          exited = true;
          clearTimeout(timeout);
          resolve();
        });
      });
    } catch (e) {
      // Process might already be gone
    }
  }
}