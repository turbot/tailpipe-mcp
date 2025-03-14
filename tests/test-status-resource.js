#!/usr/bin/env node

import { spawn } from 'child_process';
import duckdb from 'duckdb';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { createInterface } from 'readline';

// Create a unique test ID to avoid collisions
const TEST_ID = randomUUID().substring(0, 8);
const TEMP_DIR = join(process.cwd(), '.tmp-test');
const DB_PATH = join(TEMP_DIR, `status-test-${TEST_ID}.db`);

// Ensure temp directory exists
if (!existsSync(TEMP_DIR)) {
  mkdirSync(TEMP_DIR, { recursive: true });
}

// Create test database
async function createTestDatabase() {
  console.log(`📦 Creating test database at ${DB_PATH}`);
  
  return new Promise((resolve, reject) => {
    try {
      const db = new duckdb.Database(DB_PATH);
      const conn = db.connect();
      
      conn.exec(`
        -- Create a test table
        CREATE TABLE test_table (id INTEGER, name VARCHAR);
        INSERT INTO test_table VALUES (1, 'Test');
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

// Test status resource
async function testStatusResource() {
  console.log('\n🧪 Testing status resource...');
  
  // Start server process with explicit database path for consistent testing
  const serverProcess = spawn('node', ['dist/index.js', DB_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {...process.env, SKIP_TAILPIPE_CLI: 'true'} // Skip CLI check
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
        console.log('📄 Non-JSON line:', line);
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
    // Add jsonrpc version and ID if not provided
    const fullRequest = {
      jsonrpc: "2.0",
      id: request.id || `request-${Math.floor(Math.random() * 10000)}`,
      ...request
    };
    
    console.log('📤 Sending request:', JSON.stringify(fullRequest, null, 2));
    
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
    serverProcess.stdin.write(JSON.stringify(fullRequest) + '\n');
    
    // Wait for response
    return responsePromise;
  };
  
  try {
    // Test 1: List resources to verify status resource is included
    console.log('\n📋 Test 1: resources/list');
    const resourcesRequest = { method: 'resources/list', params: {} };
    const resourcesResponse = await sendRequest(resourcesRequest);
    
    // Verify status resource exists in the resources list
    if (!resourcesResponse.result || !resourcesResponse.result.resources) {
      throw new Error('Invalid resources/list response: missing result.resources');
    }
    
    const statusResource = resourcesResponse.result.resources.find(r => r.uri === 'tailpipe://status');
    if (!statusResource) {
      throw new Error('Status resource not found in resources list');
    }
    
    console.log(`✅ Found status resource: ${JSON.stringify(statusResource)}`);
    
    // Test 2: Read the status resource
    console.log('\n📋 Test 2: resources/read for status');
    const statusRequest = { method: 'resources/read', params: { uri: 'tailpipe://status' } };
    const statusResponse = await sendRequest(statusRequest);
    
    // Verify the status response
    if (!statusResponse.result || !statusResponse.result.contents) {
      throw new Error('Invalid resources/read response: missing result.contents');
    }
    
    // Parse the JSON content
    const statusContent = statusResponse.result.contents[0];
    if (!statusContent || statusContent.mimeType !== 'application/json') {
      throw new Error('Invalid status content: missing or wrong MIME type');
    }
    
    const statusData = JSON.parse(statusContent.text);
    console.log('📊 Status data:', JSON.stringify(statusData, null, 2));
    
    // Validate status data structure
    if (!statusData.database || !statusData.mcp_server || !statusData.tailpipe) {
      throw new Error('Invalid status data structure: missing expected sections');
    }
    
    // Validate database info
    if (!statusData.database.path || !statusData.database.connection_status) {
      throw new Error('Invalid database info in status data');
    }
    
    // Verify database path matches our test path
    console.log(`🔍 Checking if database path (${statusData.database.path}) contains our test ID (${TEST_ID})...`);
    if (!statusData.database.path.includes(TEST_ID)) {
      throw new Error(`Database path should contain test ID ${TEST_ID} but found: ${statusData.database.path}`);
    }
    
    console.log('✅ Status resource test passed');
    
  } catch (err) {
    console.error('❌ Error during tests:', err);
    throw err;
  } finally {
    // Cleanup server process
    console.log('\n🧹 Shutting down MCP server...');
    serverProcess.kill();
    rl.close();
  }
}

// Main test function
async function runTest() {
  try {
    // Create test database
    await createTestDatabase();
    
    // Run status resource test
    await testStatusResource();
    
    console.log('\n🎉 All tests completed successfully!');
    
    // Clean up
    console.log('🧹 Cleaning up test database...');
    try {
      unlinkSync(DB_PATH);
      console.log(`🗑️ Removed test database: ${DB_PATH}`);
    } catch (err) {
      console.error(`⚠️ Failed to remove test database: ${err.message}`);
    }
    
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Tests failed:', err);
    
    // Clean up even on failure
    try {
      unlinkSync(DB_PATH);
    } catch (e) {
      // Ignore cleanup errors
    }
    
    process.exit(1);
  }
}

// Run the tests
runTest();