#!/usr/bin/env node

import { spawn } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import duckdb from 'duckdb';
import { randomUUID } from 'crypto';

// Create a temp directory for our test
const testDir = join(process.cwd(), '.tmp-test');
try {
  mkdirSync(testDir, { recursive: true });
} catch (err) {
  // Directory may already exist
}

// Create a unique database file path
const dbPath = join(testDir, `test-${randomUUID()}.db`);
console.log(`Creating test database at ${dbPath}`);

// Create and populate test database
async function setupTestDatabase() {
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
function sendMCPRequest(mcpProcess, request) {
  return new Promise((resolve, reject) => {
    // Add jsonrpc version and ID if not provided
    const fullRequest = {
      jsonrpc: "2.0",
      id: request.id || `request-${Math.floor(Math.random() * 1000)}`,
      ...request
    };
    
    // Track full lines received
    const lines = [];
    let messageHandler;
    let timeoutId;
    
    // Set up the message handler to process line by line
    messageHandler = (data) => {
      const chunk = data.toString();
      const newLines = chunk.split('\n').filter(l => l.trim());
      
      lines.push(...newLines);
      console.log('Received lines:', newLines.length);
      
      // Try to find a matching response for our request
      for (let i = 0; i < lines.length; i++) {
        try {
          const parsed = JSON.parse(lines[i]);
          
          // Check if this is a response to our request
          if (parsed.id === fullRequest.id) {
            mcpProcess.stdout.removeListener('data', messageHandler);
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
    mcpProcess.stdout.on('data', messageHandler);
    
    // Set a timeout to avoid hanging (20 seconds should be plenty)
    timeoutId = setTimeout(() => {
      mcpProcess.stdout.removeListener('data', messageHandler);
      reject(new Error(`Request timed out after 20 seconds. Request ID: ${fullRequest.id}`));
    }, 20000);
    
    // Send the request
    console.log('Sending request:', JSON.stringify(fullRequest));
    mcpProcess.stdin.write(JSON.stringify(fullRequest) + '\n');
  });
}

// Run the MCP server and test queries
async function runMCPTest() {
  try {
    // Create test database
    await setupTestDatabase();
    
    // Start the MCP server process
    console.log('Starting MCP server...');
    console.log(`Command: node dist/index.js ${dbPath}`);
    const mcpProcess = spawn('node', ['dist/index.js', dbPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Handle server process errors/exit
    mcpProcess.stderr.on('data', (data) => {
      const stderr = data.toString();
      console.error(`MCP server stderr: ${stderr}`);
      
      // Check for startup message in stderr
      if (stderr.includes('MCP server started successfully')) {
        startupComplete = true;
      }
    });
    
    mcpProcess.on('error', (err) => {
      console.error('Failed to start MCP server:', err);
      process.exit(1);
    });
    
    // Give server time to initialize and watch for startup
    console.log('Waiting for server to initialize...');
    
    // Add a data listener to detect server startup
    let startupComplete = false;
    mcpProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('Server stdout:', output);
      if (output.includes('MCP server started') || output.includes('Server started')) {
        startupComplete = true;
      }
    });
    
    // Wait for a reasonable startup time
    for (let i = 0; i < 10; i++) {
      if (startupComplete) break;
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log(`Waiting for server... (${(i+1) * 0.5}s)`);
    }
    
    console.log('Proceeding with tests...');
    
    // ====== Test 1: Send hello request ======
    console.log('\n--- Test 1: Sending hello request ---');
    const helloResponse = await sendMCPRequest(mcpProcess, {
      method: "info/hello",
      params: {}
    });
    console.log('Hello response:', JSON.stringify(helloResponse, null, 2));
    
    // ====== Test 2: List available tools ======
    console.log('\n--- Test 2: Requesting tools list ---');
    const toolsResponse = await sendMCPRequest(mcpProcess, {
      method: "tools/list",
      params: {}
    });
    console.log('Tools available:', toolsResponse.result.tools.map(t => t.name).join(', '));
    
    // ====== Test 3: Execute a basic query ======
    console.log('\n--- Test 3: Executing a simple query ---');
    const queryResponse = await sendMCPRequest(mcpProcess, {
      method: "tools/call",
      params: {
        name: "query",
        arguments: {
          sql: "SELECT * FROM test_data"
        }
      }
    });
    console.log('Query response:', JSON.stringify(queryResponse, null, 2));
    
    // ====== Test 4: List tables ======
    console.log('\n--- Test 4: Listing tables ---');
    const tablesResponse = await sendMCPRequest(mcpProcess, {
      method: "tools/call",
      params: {
        name: "list_tables",
        arguments: {}
      }
    });
    console.log('Tables response:', JSON.stringify(tablesResponse, null, 2));
    
    // Clean up
    console.log('\nTests completed successfully');
    mcpProcess.kill();
    process.exit(0);
    
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
}

// Run the tests
runMCPTest();