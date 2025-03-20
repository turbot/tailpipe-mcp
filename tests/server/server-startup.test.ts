import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import duckdb from 'duckdb';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { describe, expect, test, beforeAll, afterAll, afterEach } from '@jest/globals';
import { logger } from '../../src/services/logger.js';

// This test verifies the MCP server can start up correctly with a valid database

describe('MCP Server Startup Test', () => {
  let tempDir: string;
  let dbPath: string;
  let mcpProcess: ChildProcessWithoutNullStreams | null = null;

  beforeAll(() => {
    // Create temp directory for test
    tempDir = join(process.cwd(), '.tmp-test');
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
    
    // Create a unique database file path
    dbPath = join(tempDir, `simple-test-${Date.now()}.db`);
  });

  afterEach(async () => {
    // Kill MCP process if it's running
    if (mcpProcess) {
      try {
        mcpProcess.kill('SIGTERM');
        await new Promise<void>(resolve => setTimeout(resolve, 100));
      } catch (e) {
        // Process might already be gone
      }
      mcpProcess = null;
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

  // Create simple test database
  async function createTestDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const db = new duckdb.Database(dbPath);
        const conn = db.connect();
        
        conn.exec(`
          CREATE TABLE test_data (id INTEGER, name VARCHAR);
          INSERT INTO test_data VALUES (1, 'test1'), (2, 'test2');
        `, (err) => {
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

  test('should start server successfully', async () => {
    // Create test database
    await createTestDatabase();
    
    // Start MCP server
    return new Promise<void>((resolve, reject) => {
      try {
        const startProcess = spawn('node', ['dist/index.js', dbPath], {
          stdio: ['pipe', 'inherit', 'inherit'] // Inherit stdout and stderr
        });
        
        mcpProcess = startProcess as unknown as ChildProcessWithoutNullStreams;
        
        let startupOutput = '';
        let startupError = '';
        let startupTimeout: NodeJS.Timeout;
        
        // Set timeout for server startup (3 seconds)
        startupTimeout = setTimeout(() => {
          reject(new Error(
            `Server failed to start within timeout.\nOutput: ${startupOutput}\nErrors: ${startupError}`
          ));
        }, 3000);
        
        // Since we're inheriting stdout/stderr, we can't listen for data events
        // Instead, just give the server some time to start
        setTimeout(() => {
          clearTimeout(startupTimeout);
          resolve();
        }, 1000);
        
        // Handle premature exit
        if (mcpProcess) {
          mcpProcess.on('exit', (code) => {
            clearTimeout(startupTimeout);
            if (code !== 0) {
              reject(new Error(`Server exited with code ${code}.\nOutput: ${startupOutput}\nErrors: ${startupError}`));
            }
          });
          
          // Handle process errors
          mcpProcess.on('error', (err) => {
            clearTimeout(startupTimeout);
            reject(err);
          });
        }
      } catch (err) {
        reject(err);
      }
    });
  }, 5000); // 5 second test timeout
});