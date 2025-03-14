#!/usr/bin/env node

import { spawn } from 'child_process';
import duckdb from 'duckdb';
import { mkdirSync, existsSync, unlinkSync, rmSync } from 'fs';
import { join } from 'path';
import readline from 'readline';

// Create a test database and run an interactive MCP session
async function runChatTest() {
  console.log('🚀 Setting up test environment...');
  const tempDir = join(process.cwd(), '.tmp-test');
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }
  
  const dbPath = join(tempDir, `chat-test-${Date.now()}.db`);
  
  try {
    // Create test database
    await createTestDatabase(dbPath);
    
    // Start MCP server
    console.log('\n🔄 Starting MCP server...');
    const mcpProcess = spawn('node', ['dist/index.js', dbPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Handle server output/errors
    mcpProcess.stdout.on('data', (data) => {
      console.log(`📤 MCP response: ${data.toString().trim()}`);
    });
    
    mcpProcess.stderr.on('data', (data) => {
      console.error(`⚠️ MCP stderr: ${data.toString().trim()}`);
    });
    
    mcpProcess.on('error', (err) => {
      console.error('❌ Failed to start MCP server:', err);
      process.exit(1);
    });
    
    mcpProcess.on('close', (code) => {
      console.log(`👋 MCP server exited with code ${code}`);
      process.exit(code || 0);
    });
    
    // Give the server a moment to start
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Run the test conversation
    console.log('\n🗣️ Starting test conversation...');
    
    // Define the test messages
    const testMessages = [
      { description: 'Hello request', request: { method: 'info/hello', params: {} } },
      { description: 'List tools', request: { method: 'tools/list', params: {} } },
      { description: 'Execute a simple query', request: { method: 'tools/call', params: { name: 'query', arguments: { sql: 'SELECT * FROM test_data' } } } },
      { description: 'List tables', request: { method: 'tools/call', params: { name: 'listTables', arguments: {} } } },
      { description: 'Query AWS schema', request: { method: 'tools/call', params: { name: 'query', arguments: { sql: 'SELECT * FROM aws.resources' } } } }
    ];
    
    // Send each message with a delay between them
    for (const [index, message] of testMessages.entries()) {
      console.log(`\n📝 Test ${index + 1}: ${message.description}`);
      console.log(`📤 Sending: ${JSON.stringify(message.request)}`);
      
      mcpProcess.stdin.write(JSON.stringify(message.request) + '\n');
      
      // Wait for response before sending next message
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Give some time for final responses
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Clean up
    console.log('\n✅ Test conversation completed');
    mcpProcess.kill();
    
    // Clean up temporary files
    console.log('🧹 Cleaning up temporary files...');
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

// Create a test database with sample data
function createTestDatabase(dbPath) {
  return new Promise((resolve, reject) => {
    console.log(`📦 Creating test database at ${dbPath}...`);
    
    try {
      const db = new duckdb.Database(dbPath);
      const conn = db.connect();
      
      console.log('📋 Creating test tables...');
      conn.exec(`
        CREATE TABLE test_data (id INTEGER, name VARCHAR, value DOUBLE);
        INSERT INTO test_data VALUES (1, 'test1', 10.5), (2, 'test2', 20.5);
        
        CREATE SCHEMA aws;
        CREATE TABLE aws.resources (id VARCHAR, region VARCHAR, type VARCHAR);
        INSERT INTO aws.resources VALUES 
          ('r-123', 'us-east-1', 'instance'),
          ('r-456', 'us-west-2', 'bucket');
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

// Run the chat test
runChatTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});