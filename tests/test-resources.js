#!/usr/bin/env node

import { spawn } from 'child_process';
import duckdb from 'duckdb';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';

async function testResources() {
  console.log('🚀 Testing resources functionality...');
  
  // Create a temp database
  const tempDir = join(process.cwd(), '.tmp-test');
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }
  
  const dbPath = join(tempDir, `resources-test-${Date.now()}.db`);
  
  // Create test database
  await createTestDatabase(dbPath);
  
  // Start MCP server
  console.log('\n⚙️ Starting MCP server...');
  const serverProcess = spawn('node', ['dist/index.js', dbPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  // Set up line reader for responses
  const rl = createInterface({
    input: serverProcess.stdout,
    terminal: false
  });
  
  rl.on('line', (line) => {
    if (line.trim()) {
      console.log('📥 Response:', line);
      try {
        const parsed = JSON.parse(line);
        console.log('📝 Parsed response:', JSON.stringify(parsed, null, 2));
      } catch (e) {
        // Not valid JSON
      }
    }
  });
  
  serverProcess.stderr.on('data', (data) => {
    console.log('⚠️ stderr:', data.toString().trim());
  });
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test resources/list
  console.log('\n📋 Testing resources/list...');
  const listRequest = JSON.stringify({
    jsonrpc: "2.0",
    id: "resources-list-1",
    method: "resources/list",
    params: {}
  });
  
  console.log('📤 Sending:', listRequest);
  serverProcess.stdin.write(listRequest + '\n');
  
  // Wait for response
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test resource templates
  console.log('\n📋 Testing resource templates...');
  const templatesRequest = JSON.stringify({
    jsonrpc: "2.0",
    id: "templates-1",
    method: "resources/templates/list",
    params: {}
  });
  
  console.log('📤 Sending:', templatesRequest);
  serverProcess.stdin.write(templatesRequest + '\n');
  
  // Wait for response
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test reading status resource
  console.log('\n📋 Testing resource read (status)...');
  const statusRequest = JSON.stringify({
    jsonrpc: "2.0",
    id: "read-status-1",
    method: "resources/read",
    params: {
      uri: "tailpipe://status"
    }
  });
  
  console.log('📤 Sending:', statusRequest);
  serverProcess.stdin.write(statusRequest + '\n');
  
  // Wait for response
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Clean up
  console.log('\n🧹 Cleaning up...');
  serverProcess.kill();
  try {
    unlinkSync(dbPath);
    console.log(`✅ Removed test database: ${dbPath}`);
  } catch (err) {
    console.error(`❌ Failed to remove database: ${err.message}`);
  }
}

async function createTestDatabase(dbPath) {
  console.log(`📦 Creating test database at ${dbPath}`);
  
  const db = new duckdb.Database(dbPath);
  const conn = db.connect();
  
  // Create test tables
  console.log('📋 Creating test tables...');
  
  try {
    // Create test tables
    conn.exec(`
      CREATE SCHEMA test;
      CREATE TABLE test.orders (id INTEGER, customer TEXT);
      CREATE TABLE test.users (id INTEGER, name TEXT);
      
      CREATE SCHEMA analytics;
      CREATE TABLE analytics.metrics (id INTEGER, value FLOAT);
    `);
    
    console.log('✅ Test database created successfully');
  } catch (err) {
    console.error('❌ Failed to create test database:', err);
    throw err;
  } finally {
    conn.close();
    db.close();
  }
}

testResources().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});