#!/usr/bin/env node

import { spawn } from 'child_process';
import duckdb from 'duckdb';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';

// This test specifically simulates the sequence of calls seen in Claude Desktop logs
// that was causing the error with resources/list
async function testClaudeDesktopError() {
  console.log('🧪 Testing Claude Desktop error scenario...');
  const tempDir = join(process.cwd(), '.tmp-test');
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }
  
  const dbPath = join(tempDir, `claude-desktop-test-${Date.now()}.db`);
  
  try {
    // Create test database
    await createTestDatabase(dbPath);
    
    // Start MCP server
    console.log('\n🔄 Starting MCP server...');
    const mcpProcess = spawn('node', ['dist/index.js', dbPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Track responses
    const responses = [];
    
    // Use readline for proper line-by-line processing
    const rl = createInterface({
      input: mcpProcess.stdout,
      terminal: false
    });
    
    rl.on('line', (line) => {
      if (line.trim()) {
        console.log(`📤 Response: ${line.slice(0, 200)}${line.length > 200 ? '...' : ''}`);
        
        try {
          // Try to parse the JSON response
          const parsed = JSON.parse(line);
          responses.push(parsed);
          
          // If we've received responses for all our requests, we can end the test
          if (responses.length >= 4) {
            setTimeout(() => mcpProcess.kill(), 500);
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
      console.error(`⚠️ Server stderr: ${stderr}`);
    });
    
    mcpProcess.on('error', (err) => {
      console.error('❌ Failed to start MCP server:', err);
      process.exit(1);
    });
    
    mcpProcess.on('close', (code) => {
      console.log(`🔚 MCP server exited with code ${code}`);
      
      // Verify we got the expected number of responses
      console.log(`\n📊 Received ${responses.length} responses`);
      
      // Check for errors in the resources/list response
      const resourcesResponse = responses.find(r => r.id === 'resources-list');
      if (!resourcesResponse) {
        console.error('❌ No resources/list response found');
        process.exit(1);
      }
      
      if (!resourcesResponse.result || !Array.isArray(resourcesResponse.result.resources)) {
        console.error('❌ Invalid resources/list response format');
        process.exit(1);
      }
      
      if (resourcesResponse.result.resources.length === 0) {
        console.error('⚠️ No resources returned in the resources/list response');
      } else {
        console.log('✅ Resources/list endpoint returned resources successfully');
        console.log('Resources:', resourcesResponse.result.resources.map(r => r.name).join(', '));
      }
      
      // Clean up
      try {
        unlinkSync(dbPath);
        console.log(`Removed temporary database: ${dbPath}`);
      } catch (err) {
        console.error(`Warning: Could not remove temporary database: ${err.message}`);
      }
      
      console.log('\n✅ Tests completed successfully');
    });
    
    // Simulate the sequence of requests seen in Claude Desktop logs
    await simulateClaudeDesktopSequence(mcpProcess);
    
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

// Simulate the exact sequence of requests that Claude Desktop makes
async function simulateClaudeDesktopSequence(mcpProcess) {
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Step 1: Send initialize request
  console.log('\n📝 Step 1: Sending initialize request');
  const initializeRequest = {
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "claude-ai",
        version: "0.1.0"
      }
    },
    jsonrpc: "2.0",
    id: 0
  };
  mcpProcess.stdin.write(JSON.stringify(initializeRequest) + '\n');
  
  // Wait a bit to simulate client processing
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Step 2: Send resources/list request
  console.log('\n📝 Step 2: Sending resources/list request');
  const resourcesListRequest = {
    method: "resources/list",
    params: {},
    jsonrpc: "2.0",
    id: "resources-list"
  };
  mcpProcess.stdin.write(JSON.stringify(resourcesListRequest) + '\n');
  
  // Wait a bit to simulate client processing
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Step 3: Send prompts/list request
  console.log('\n📝 Step 3: Sending prompts/list request');
  const promptsListRequest = {
    method: "prompts/list",
    params: {},
    jsonrpc: "2.0",
    id: "prompts-list" 
  };
  mcpProcess.stdin.write(JSON.stringify(promptsListRequest) + '\n');
  
  // Wait a bit to simulate client processing
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Step 4: Send tools/list request
  console.log('\n📝 Step 4: Sending tools/list request');
  const toolsListRequest = {
    method: "tools/list",
    params: {},
    jsonrpc: "2.0",
    id: "tools-list"
  };
  mcpProcess.stdin.write(JSON.stringify(toolsListRequest) + '\n');
}

// Create a test database
function createTestDatabase(dbPath) {
  return new Promise((resolve, reject) => {
    console.log(`📦 Creating test database at ${dbPath}...`);
    
    try {
      const db = new duckdb.Database(dbPath);
      const conn = db.connect();
      
      console.log('📋 Creating test tables...');
      conn.exec(`
        -- Create a simple schema and tables
        CREATE SCHEMA test_schema;
        
        CREATE TABLE test_schema.users (
          id INTEGER PRIMARY KEY,
          username VARCHAR,
          email VARCHAR
        );
        
        CREATE TABLE main.products (
          id INTEGER PRIMARY KEY,
          name VARCHAR,
          price DOUBLE
        );
        
        -- Insert some sample data
        INSERT INTO test_schema.users VALUES 
          (1, 'user1', 'user1@example.com'),
          (2, 'user2', 'user2@example.com');
          
        INSERT INTO main.products VALUES
          (1, 'Product A', 19.99),
          (2, 'Product B', 29.99);
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
testClaudeDesktopError().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});