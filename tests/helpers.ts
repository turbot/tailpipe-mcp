import { spawn, ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { unlinkSync, existsSync } from 'fs';
import { Readable, Writable } from 'stream';
import duckdb from 'duckdb';

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

// Helper to create a test database with sample data
export function createTestDatabase(dbPath: string): Promise<void> {
  console.log(`Creating test database at ${dbPath}`);
  
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

// Helper to clean up a test database
export function cleanupDatabase(dbPath: string): void {
  if (existsSync(dbPath)) {
    try {
      unlinkSync(dbPath);
      console.log(`Removed test database: ${dbPath}`);
    } catch (err) {
      console.error(`Warning: Could not remove test database: ${err instanceof Error ? err.message : String(err)}`);
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
    
    // Log stderr for debugging
    if (this.serverProcess.stderr) {
      this.serverProcess.stderr.on('data', (data) => {
        // Uncomment for debugging: console.error(`Server stderr: ${data.toString().trim()}`);
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
      setTimeout(() => {
        if (this.responseResolvers.has(id)) {
          resolve({ error: { message: 'Request timed out' } });
          this.responseResolvers.delete(id);
        }
      }, 5000);
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
  close(): void {
    this.serverProcess.kill();
    this.readline.close();
  }
}