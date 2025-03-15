import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import duckdb from 'duckdb';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

// Extended timeout for server startup
beforeAll(() => {
  jest.setTimeout(20000);
});

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

  afterEach(() => {
    // Kill MCP process if it's running
    if (mcpProcess) {
      mcpProcess.kill();
      mcpProcess = null;
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

  // Create and populate test database
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

  // Start MCP server and wait for it to initialize
  function startMCPServer(): Promise<ChildProcessWithoutNullStreams> {
    return new Promise((resolve, reject) => {
      const process = spawn('node', ['dist/index.js', dbPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stdoutData = '';
      let stderrData = '';
      let serverStarted = false;
      
      // Capture stdout and check for startup message
      process.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdoutData += chunk;
        
        if (chunk.includes('MCP server started') || chunk.includes('Server started')) {
          serverStarted = true;
          resolve(process);
        }
      });
      
      // Capture stderr and check for startup message (some logs go to stderr)
      process.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderrData += chunk;
        
        if (chunk.includes('MCP server started') || chunk.includes('Server started')) {
          serverStarted = true;
          resolve(process);
        }
      });
      
      // Handle error
      process.on('error', (err) => {
        reject(err);
      });
      
      // Handle unexpected exit
      process.on('close', (code) => {
        if (!serverStarted) {
          reject(new Error(`MCP server exited with code ${code}. stderr: ${stderrData}`));
        }
      });
      
      // Set timeout to avoid hanging
      setTimeout(() => {
        if (!serverStarted) {
          reject(new Error(`MCP server failed to start within timeout. stderr: ${stderrData}`));
        }
      }, 10000);
    });
  }

  test('should start server successfully with valid database', async () => {
    // Create test database
    await createTestDatabase();
    
    // Start MCP server and wait for startup message
    mcpProcess = await startMCPServer();
    
    // If we get here, server started successfully
    expect(mcpProcess).toBeDefined();
  }, 30000); // 30 second timeout for this specific test
});