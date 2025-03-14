#!/usr/bin/env node

import { spawn } from 'child_process';
import duckdb from 'duckdb';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

// Create a very minimal test that just tests the list_tables tool
async function runMinimalTest() {
  console.log('Creating minimal test database...');
  
  // Create temp directory
  const tempDir = join(process.cwd(), '.tmp-test');
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }
  
  // Create test database
  const dbPath = join(tempDir, `minimal-test-${Date.now()}.db`);
  const db = new duckdb.Database(dbPath);
  const conn = db.connect();
  
  // Create simple test schema and table
  await new Promise((resolve, reject) => {
    conn.exec(`
      CREATE SCHEMA test;
      CREATE TABLE test.example (id INTEGER, name VARCHAR);
      INSERT INTO test.example VALUES (1, 'test1'), (2, 'test2');
    `, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
  
  // Close database connections
  conn.close();
  await new Promise(resolve => db.close(resolve));
  
  console.log(`Test database created at: ${dbPath}`);
  
  // Start the MCP server
  console.log('Starting MCP server...');
  const serverProcess = spawn('node', ['dist/index.js', dbPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Set up data handlers before we send the requests
  serverProcess.stdout.on('data', data => {
    console.log(`MCP response: ${data.toString().trim()}`);
  });
  
  serverProcess.stderr.on('data', data => {
    console.log(`MCP stderr: ${data.toString().trim()}`);
  });
  
  // First, let's request tool list to verify the server is working
  console.log('Sending tools/list request...');
  const listToolsRequest = {
    method: 'tools/list',
    params: {}
  };
  serverProcess.stdin.write(JSON.stringify(listToolsRequest) + '\n');
  
  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Now send our actual tool request
  console.log('Sending list_tables request...');
  const request = {
    method: 'tools/call',
    params: {
      name: 'list_tables',
      arguments: {}
    }
  };
  serverProcess.stdin.write(JSON.stringify(request) + '\n');
  
  // Wait for response
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Cleanup
  serverProcess.kill();
  try {
    unlinkSync(dbPath);
    console.log(`Removed database: ${dbPath}`);
  } catch (e) {
    console.error(`Failed to remove database: ${e.message}`);
  }
}

// Run the test
runMinimalTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});