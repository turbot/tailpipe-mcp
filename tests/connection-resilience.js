#!/usr/bin/env node

import { spawn } from 'child_process';
import duckdb from 'duckdb';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';

// Test the connection resilience
async function testConnectionResilience() {
  console.log('🧪 Testing database connection resilience...');
  const tempDir = join(process.cwd(), '.tmp-test');
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }
  
  const dbPath = join(tempDir, `resilience-test-${Date.now()}.db`);
  
  try {
    // Create test database
    await createTestDatabase(dbPath);
    
    // Start MCP server
    console.log('\n🔄 Starting MCP server...');
    const mcpProcess = spawn('node', ['dist/index.js', dbPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Track responses for validation
    const responses = [];
    
    // Use readline for proper line-by-line processing
    const rl = createInterface({
      input: mcpProcess.stdout,
      terminal: false
    });
    
    rl.on('line', (line) => {
      if (line.trim()) {
        console.log(`📤 MCP response: ${line}`);
        
        try {
          // Try to parse the JSON response
          const parsed = JSON.parse(line);
          responses.push(parsed);
          
          if (parsed.result && parsed.result.content) {
            console.log('📋 Response content:');
            console.log(parsed.result.content[0].text);
          }
        } catch (e) {
          // Not JSON or other issue, just log the raw response
        }
      }
    });
    
    let stderrBuffer = '';
    mcpProcess.stderr.on('data', (data) => {
      const stderr = data.toString().trim();
      stderrBuffer += stderr + '\n';
      console.error(`⚠️ MCP stderr: ${stderr}`);
    });
    
    mcpProcess.on('error', (err) => {
      console.error('❌ Failed to start MCP server:', err);
      process.exit(1);
    });
    
    // Give the server a moment to start
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test sequence of queries
    console.log('\n🧪 Running test sequence...');
    
    // Test 1: Basic query 
    console.log('📝 Test 1: Basic query');
    const basicQuery = {
      jsonrpc: "2.0",
      id: "request-1",
      method: 'tools/call',
      params: {
        name: 'query',
        arguments: {
          sql: 'SELECT * FROM test_table'
        }
      }
    };
    console.log(`📤 Sending: ${JSON.stringify(basicQuery)}`);
    mcpProcess.stdin.write(JSON.stringify(basicQuery) + '\n');
    
    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test 2: Second basic query (connection should be reused)
    console.log('\n📝 Test 2: Second query (reusing connection)');
    const secondQuery = {
      jsonrpc: "2.0",
      id: "request-2",
      method: 'tools/call',
      params: {
        name: 'query',
        arguments: {
          sql: 'SELECT COUNT(*) FROM test_table'
        }
      }
    };
    console.log(`📤 Sending: ${JSON.stringify(secondQuery)}`);
    mcpProcess.stdin.write(JSON.stringify(secondQuery) + '\n');
    
    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test 3: List tables
    console.log('\n📝 Test 3: List tables tool');
    const listTablesQuery = {
      jsonrpc: "2.0",
      id: "request-3",
      method: 'tools/call',
      params: {
        name: 'list_tables',
        arguments: {}
      }
    };
    console.log(`📤 Sending: ${JSON.stringify(listTablesQuery)}`);
    mcpProcess.stdin.write(JSON.stringify(listTablesQuery) + '\n');
    
    // Wait for test completion
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Verify we got responses
    console.log(`\n📊 Received ${responses.length} responses`);
    if (responses.length !== 3) {
      console.error('❌ Expected 3 responses but got', responses.length);
      if (responses.some(r => r.error)) {
        console.error('❌ Errors in responses:', 
          responses.filter(r => r.error).map(r => r.error));
      }
    } else {
      console.log('✅ Received expected number of responses');
    }
    
    // Clean up
    console.log('\n✅ Tests completed');
    mcpProcess.kill();
    
    try {
      unlinkSync(dbPath);
      console.log(`Removed temporary database: ${dbPath}`);
    } catch (err) {
      console.error(`Warning: Could not remove temporary database: ${err.message}`);
    }
    
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

// Create a simple test database
function createTestDatabase(dbPath) {
  return new Promise((resolve, reject) => {
    console.log(`📦 Creating test database at ${dbPath}...`);
    
    try {
      const db = new duckdb.Database(dbPath);
      const conn = db.connect();
      
      console.log('📋 Creating test tables...');
      conn.exec(`
        CREATE TABLE test_table (
          id INTEGER PRIMARY KEY,
          name VARCHAR,
          value DOUBLE
        );
        
        INSERT INTO test_table VALUES 
          (1, 'item1', 10.5),
          (2, 'item2', 20.7),
          (3, 'item3', 30.2);
      `, (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        conn.close();
        db.close(() => {
          console.log('✅ Database created successfully');
          resolve();
        });
      });
    } catch (err) {
      reject(err);
    }
  });
}

// Run the test
testConnectionResilience().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});