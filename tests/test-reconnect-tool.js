#!/usr/bin/env node

import { spawn } from 'child_process';
import duckdb from 'duckdb';
import { mkdirSync, existsSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { createInterface } from 'readline';

// Create unique test IDs to avoid collisions
const TEST_ID_1 = randomUUID().substring(0, 8);
const TEST_ID_2 = randomUUID().substring(0, 8);
const TEMP_DIR = join(process.cwd(), '.tmp-test');
const DB_PATH_1 = join(TEMP_DIR, `reconnect-test-1-${TEST_ID_1}.db`);
const DB_PATH_2 = join(TEMP_DIR, `reconnect-test-2-${TEST_ID_2}.db`);

// Ensure temp directory exists
if (!existsSync(TEMP_DIR)) {
  mkdirSync(TEMP_DIR, { recursive: true });
}

// Create test databases with different data
async function createTestDatabases() {
  console.log('📦 Creating test databases:');
  
  // Create first database with "test_db1" table
  await new Promise((resolve, reject) => {
    try {
      console.log(`Creating first database at ${DB_PATH_1}`);
      const db = new duckdb.Database(DB_PATH_1);
      const conn = db.connect();
      
      conn.exec(`
        CREATE TABLE test_db1 (id INTEGER, name VARCHAR);
        INSERT INTO test_db1 VALUES (1, 'DB1');
      `, (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        conn.close();
        db.close(() => {
          console.log('✅ First test database created successfully');
          resolve();
        });
      });
    } catch (err) {
      reject(err);
    }
  });
  
  // Create second database with "test_db2" table
  await new Promise((resolve, reject) => {
    try {
      console.log(`Creating second database at ${DB_PATH_2}`);
      const db = new duckdb.Database(DB_PATH_2);
      const conn = db.connect();
      
      conn.exec(`
        CREATE TABLE test_db2 (id INTEGER, name VARCHAR);
        INSERT INTO test_db2 VALUES (2, 'DB2');
      `, (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        conn.close();
        db.close(() => {
          console.log('✅ Second test database created successfully');
          resolve();
        });
      });
    } catch (err) {
      reject(err);
    }
  });
  
  // Create mock tailpipe connect script
  const mockScriptPath = join(TEMP_DIR, 'tailpipe');  // Name it exactly 'tailpipe' so it's found in PATH
  const mockScript = `#!/usr/bin/env node
// Mock script that returns the second database path when called with tailpipe connect
console.error('Mock tailpipe called with args:', process.argv.slice(2));
if (process.argv[2] === 'connect' && process.argv[3] === '--output' && process.argv[4] === 'json') {
  console.log(JSON.stringify({ database_filepath: "${DB_PATH_2.replace(/\\/g, '\\\\')}" }));
} else if (process.argv[2] === '--version') {
  console.log("Tailpipe v9.9.9 (mock)");
} else {
  console.error('Mock tailpipe script called with unexpected args:', process.argv.slice(2));
  process.exit(1);
}`;

  console.log('Creating mock tailpipe script at:', mockScriptPath);
  writeFileSync(mockScriptPath, mockScript, { mode: 0o755 });
  console.log('✅ Mock tailpipe script created');
  
  return mockScriptPath;
}

// Test the reconnect tool
async function testReconnectTool(mockScriptPath) {
  console.log('\n🧪 Testing reconnect tool...');
  
  // Start server process with first database and modified PATH to use mock tailpipe script
  const serverProcess = spawn('node', ['dist/index.js', DB_PATH_1], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env, 
      PATH: `${TEMP_DIR}:${process.env.PATH}`, // Put our mock script first in PATH
      SKIP_TAILPIPE_CLI: 'false', // Ensure CLI is used when reconnect is called without args
      DEBUG_TAILPIPE: 'true' // Help with debugging the test
    }
  });
  
  // Create readline interface for line-by-line processing
  const rl = createInterface({
    input: serverProcess.stdout,
    terminal: false
  });
  
  // Set up response handler
  let responsePromiseResolve = null;
  
  rl.on('line', (line) => {
    if (line.trim()) {
      try {
        const response = JSON.parse(line);
        console.log('📥 Received response:', JSON.stringify(response, null, 2));
        
        if (responsePromiseResolve) {
          responsePromiseResolve(response);
          responsePromiseResolve = null;
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
    
    // Set up a promise to wait for the response
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
    // Test 1: Query first database to verify tables
    console.log('\n📋 Test 1: Query the first database');
    const query1Response = await sendRequest({
      method: 'tools/call',
      params: {
        name: 'query',
        arguments: { sql: 'SELECT name FROM sqlite_master WHERE type=\'table\'' }
      }
    });
    
    // Check if test_db1 exists
    console.log('Checking for test_db1 table...');
    let hadTestDb1 = false;
    if (query1Response.result && query1Response.result.content) {
      const content = query1Response.result.content[0].text;
      hadTestDb1 = content.includes('test_db1');
      console.log(`Found test_db1: ${hadTestDb1}`);
    }
    
    if (!hadTestDb1) {
      throw new Error('First database does not contain test_db1 table');
    }
    
    // Test 2: Use reconnect tool with explicit path to second database
    console.log('\n📋 Test 2: Reconnect to second database using explicit path');
    const reconnect1Response = await sendRequest({
      method: 'tools/call',
      params: {
        name: 'reconnect',
        arguments: { database_path: DB_PATH_2 }
      }
    });
    
    // Verify the response shows success
    if (!reconnect1Response.result || reconnect1Response.result.isError) {
      throw new Error('Failed to reconnect to second database');
    }
    
    // Test 3: Query to verify we're now connected to the second database
    console.log('\n📋 Test 3: Query the second database');
    const query2Response = await sendRequest({
      method: 'tools/call',
      params: {
        name: 'query',
        arguments: { sql: 'SELECT name FROM sqlite_master WHERE type=\'table\'' }
      }
    });
    
    // Check if test_db2 exists
    console.log('Checking for test_db2 table...');
    let hadTestDb2 = false;
    if (query2Response.result && query2Response.result.content) {
      const content = query2Response.result.content[0].text;
      hadTestDb2 = content.includes('test_db2');
      console.log(`Found test_db2: ${hadTestDb2}`);
    }
    
    if (!hadTestDb2) {
      throw new Error('Failed to find test_db2 table after reconnect');
    }
    
    // Test 4: Use reconnect tool to go back to first database
    console.log('\n📋 Test 4: Reconnect back to first database');
    const reconnect2Response = await sendRequest({
      method: 'tools/call',
      params: {
        name: 'reconnect',
        arguments: { database_path: DB_PATH_1 }
      }
    });
    
    // Test 5: Query to verify we're back to the first database
    console.log('\n📋 Test 5: Query the first database again');
    const query3Response = await sendRequest({
      method: 'tools/call',
      params: {
        name: 'query',
        arguments: { sql: 'SELECT name FROM sqlite_master WHERE type=\'table\'' }
      }
    });
    
    // Check if test_db1 exists again
    console.log('Checking for test_db1 table again...');
    let hadTestDb1Again = false;
    if (query3Response.result && query3Response.result.content) {
      const content = query3Response.result.content[0].text;
      hadTestDb1Again = content.includes('test_db1');
      console.log(`Found test_db1 again: ${hadTestDb1Again}`);
    }
    
    if (!hadTestDb1Again) {
      throw new Error('Failed to find test_db1 table after reconnecting back');
    }
    
    // Test 6: Use reconnect tool with no arguments (should use tailpipe CLI)
    console.log('\n📋 Test 6: Reconnect using mock tailpipe CLI');
    const reconnect3Response = await sendRequest({
      method: 'tools/call',
      params: {
        name: 'reconnect',
        arguments: {}
      }
    });
    
    // Test 7: Verify the reconnection was successful
    console.log('\n📋 Test 7: Verify reconnection completed successfully');
    
    const reconnectResponse = JSON.parse(reconnect3Response.result.content[0].text);
    
    // Check if the reconnection was successful according to the response
    if (!reconnectResponse.success) {
      throw new Error('Reconnection failed according to the response');
    }
    
    // Verify the source information was included
    if (!reconnectResponse.database || !reconnectResponse.database.source) {
      throw new Error('Database source information missing from response');
    }
    
    console.log(`Reconnection source: ${reconnectResponse.database.source}`);
    console.log('✅ Database reconnection successful');
    
    console.log('\n✅ Reconnect tool test passed');
    
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
  let mockScriptPath = null;
  
  try {
    // Create test databases
    mockScriptPath = await createTestDatabases();
    
    // Run reconnect tool test
    await testReconnectTool(mockScriptPath);
    
    console.log('\n🎉 All tests completed successfully!');
    
    // Clean up
    cleanup();
    
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Tests failed:', err);
    
    // Clean up even on failure
    cleanup();
    
    process.exit(1);
  }
}

// Clean up test files
function cleanup() {
  console.log('🧹 Cleaning up test files...');
  try {
    unlinkSync(DB_PATH_1);
    console.log(`🗑️ Removed test database 1: ${DB_PATH_1}`);
  } catch (err) {
    console.error(`⚠️ Failed to remove test database 1: ${err.message}`);
  }
  
  try {
    unlinkSync(DB_PATH_2);
    console.log(`🗑️ Removed test database 2: ${DB_PATH_2}`);
  } catch (err) {
    console.error(`⚠️ Failed to remove test database 2: ${err.message}`);
  }
  
  try {
    unlinkSync(join(TEMP_DIR, 'tailpipe'));
    console.log(`🗑️ Removed mock tailpipe script`);
  } catch (err) {
    console.error(`⚠️ Failed to remove mock tailpipe script: ${err.message}`);
  }
}

// Run the tests
runTest();