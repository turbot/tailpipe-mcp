#!/usr/bin/env node

import { spawn } from 'child_process';
import duckdb from 'duckdb';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';

async function testResourcesResilience() {
  console.log('🧪 Testing resources/list resilience...');
  
  // Create a temp database
  const tempDir = join(process.cwd(), '.tmp-test');
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }
  
  // Test 1: Resources/list with good database
  const dbPath = join(tempDir, `resources-resilience-test-${Date.now()}.db`);
  await createTestDatabase(dbPath);
  await testResourcesList(dbPath);
  
  // Test 2: Resources/list with corrupted database
  await testResourcesList(dbPath); // Database is corrupted after first test
  
  // Test 3: Resources/list with existing but invalid database
  const emptyDbPath = join(tempDir, `empty-db-test-${Date.now()}.db`);
  await testResourcesList(emptyDbPath);
  
  // Clean up
  try {
    unlinkSync(dbPath);
    console.log(`✅ Removed test database: ${dbPath}`);
  } catch (err) {
    console.error(`❌ Failed to remove database: ${err.message}`);
  }
}

async function testResourcesList(dbPath) {
  console.log(`\n📊 Testing resources/list with database: ${dbPath}`);
  
  // Start MCP server
  const serverProcess = spawn('node', ['dist/index.js', dbPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  // Set up line reader for responses
  const rl = createInterface({
    input: serverProcess.stdout,
    terminal: false
  });
  
  let response = null;
  let serverExited = false;
  
  rl.on('line', (line) => {
    if (line.trim()) {
      console.log('📥 Response:', line);
      try {
        response = JSON.parse(line);
        console.log('📋 Resources list result:', JSON.stringify(response, null, 2));
      } catch (e) {
        // Not valid JSON
      }
    }
  });
  
  serverProcess.stderr.on('data', (data) => {
    console.log('⚠️ Server stderr:', data.toString().trim());
  });

  serverProcess.on('exit', (code) => {
    console.log('🔚 MCP server exited with code', code);
    serverExited = true;
  });
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Send resources/list request
  const request = JSON.stringify({
    jsonrpc: "2.0",
    id: "resources-list-test",
    method: "resources/list",
    params: {}
  });
  
  console.log('📤 Sending resources/list request:', request);
  serverProcess.stdin.write(request + '\n');
  
  // Wait for response or server exit
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Kill server if it hasn't exited
  if (!serverExited) {
    serverProcess.kill();
    console.log('🔚 MCP server exited with code 0');
  }
  
  // For non-existent database, we expect the server to exit without a response
  if (!existsSync(dbPath)) {
    console.log('✅ Server correctly exited for non-existent database');
    return;
  }
  
  // Verify response for existing database
  if (response?.result?.resources) {
    console.log(`✅ Received ${response.result.resources.length} resource${response.result.resources.length === 1 ? '' : 's'}`);
    for (const resource of response.result.resources) {
      console.log(`  - ${resource.name} (${resource.type}): ${resource.uri}`);
    }
    
    // Verify we have the status resource
    const statusResource = response.result.resources.find(r => r.uri === 'tailpipe://status');
    if (!statusResource) {
      throw new Error('Status resource not found in response');
    }
  } else {
    throw new Error('Invalid or missing response');
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

testResourcesResilience().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});