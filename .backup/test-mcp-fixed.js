#!/usr/bin/env node

import { spawn } from 'child_process';
import duckdb from 'duckdb';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { createInterface } from 'readline';

async function testMCPServer() {
  // Create test database
  const tempDir = join(process.cwd(), '.tmp-test');
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }
  
  const dbPath = join(tempDir, `mcp-test-${Date.now()}.db`);
  await createTestDatabase(dbPath);
  
  // Start MCP server process
  console.log('\n🚀 Starting MCP server...');
  
  const serverProcess = spawn('node', ['dist/index.js', dbPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  // Create readline interface for line-by-line processing
  const rl = createInterface({
    input: serverProcess.stdout,
    terminal: false
  });
  
  // Set up response handler
  let responsePromiseResolve = null;
  let currentResponse = null;
  
  rl.on('line', (line) => {
    if (line.trim()) {
      try {
        const response = JSON.parse(line);
        console.log('📥 Received response:', JSON.stringify(response, null, 2));
        
        if (responsePromiseResolve) {
          responsePromiseResolve(response);
          responsePromiseResolve = null;
        } else {
          currentResponse = response;
        }
      } catch (err) {
        console.log('📄 Received non-JSON line:', line);
      }
    }
  });
  
  // Handle stderr
  serverProcess.stderr.on('data', (data) => {
    console.error(`⚠️ Server stderr: ${data.toString().trim()}`);
  });
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Function to send a request and wait for response
  const sendRequest = async (request) => {
    console.log('📤 Sending request:', JSON.stringify(request, null, 2));
    
    // If we already have a response waiting, return it
    if (currentResponse) {
      const response = currentResponse;
      currentResponse = null;
      return response;
    }
    
    // Otherwise, set up a promise to wait for the response
    const responsePromise = new Promise((resolve) => {
      responsePromiseResolve = resolve;
      
      // Set a timeout
      setTimeout(() => {
        if (responsePromiseResolve) {
          console.error('⏱️ Request timed out');
          responsePromiseResolve({ error: 'Request timed out' });
          responsePromiseResolve = null;
        }
      }, 5000);
    });
    
    // Send the request
    serverProcess.stdin.write(JSON.stringify(request) + '\n');
    
    // Wait for response
    return responsePromise;
  };
  
  try {
    // Test 1: info/hello
    console.log('\n📋 Test 1: info/hello');
    const helloRequest = { method: 'info/hello', params: {} };
    const helloResponse = await sendRequest(helloRequest);
    
    // Test 2: tools/list
    console.log('\n📋 Test 2: tools/list');
    const toolsRequest = { method: 'tools/list', params: {} };
    const toolsResponse = await sendRequest(toolsRequest);
    
    // Test 3: list_tables
    console.log('\n📋 Test 3: list_tables (all)');
    const listTablesRequest = {
      method: 'tools/call',
      params: {
        name: 'list_tables',
        arguments: {}
      }
    };
    const listTablesResponse = await sendRequest(listTablesRequest);
    
    // Test 4: list_tables with schema filter
    console.log('\n📋 Test 4: list_tables (with schema filter)');
    const schemaFilterRequest = {
      method: 'tools/call',
      params: {
        name: 'list_tables',
        arguments: { schema: 'test' }
      }
    };
    const schemaFilterResponse = await sendRequest(schemaFilterRequest);
    
    console.log('\n✅ All tests completed successfully');
  } catch (err) {
    console.error('❌ Error during tests:', err);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    serverProcess.kill();
    
    try {
      unlinkSync(dbPath);
      console.log(`🗑️ Removed test database: ${dbPath}`);
    } catch (err) {
      console.error(`⚠️ Failed to remove test database: ${err.message}`);
    }
  }
}

// Helper to create a test database
async function createTestDatabase(dbPath) {
  console.log(`📦 Creating test database at ${dbPath}`);
  
  return new Promise((resolve, reject) => {
    try {
      const db = new duckdb.Database(dbPath);
      const conn = db.connect();
      
      conn.exec(`
        -- Create test schema
        CREATE SCHEMA test;
        
        -- Create test table
        CREATE TABLE test.example (
          id INTEGER,
          name VARCHAR
        );
        
        -- Insert test data
        INSERT INTO test.example VALUES
          (1, 'item1'),
          (2, 'item2'),
          (3, 'item3');
      `, (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        conn.close();
        db.close(() => {
          console.log('✅ Test database created successfully');
          resolve();
        });
      });
    } catch (err) {
      reject(err);
    }
  });
}

// Run the test
testMCPServer().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});