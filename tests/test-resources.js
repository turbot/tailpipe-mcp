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
  
  // Test reading a schema resource
  console.log('\n📋 Testing resource read (schema)...');
  const schemaRequest = JSON.stringify({
    jsonrpc: "2.0",
    id: "read-schema-1",
    method: "resources/read",
    params: {
      uri: "postgresql://schema/test"
    }
  });
  
  console.log('📤 Sending:', schemaRequest);
  serverProcess.stdin.write(schemaRequest + '\n');
  
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
        
        -- Create test tables
        CREATE TABLE test.users (
          id INTEGER,
          name VARCHAR,
          email VARCHAR
        );
        
        CREATE TABLE test.orders (
          id INTEGER,
          user_id INTEGER,
          amount DOUBLE
        );
        
        -- Create another schema
        CREATE SCHEMA analytics;
        
        CREATE TABLE analytics.metrics (
          id INTEGER,
          name VARCHAR,
          value DOUBLE
        );
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
testResources().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});