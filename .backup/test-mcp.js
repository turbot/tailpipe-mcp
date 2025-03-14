#!/usr/bin/env node

import { spawn } from 'child_process';
import duckdb from 'duckdb';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

async function testMCPServer() {
  // Create temp dir
  const tempDir = join(process.cwd(), '.tmp-test');
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }
  
  // Create test DB
  const dbPath = join(tempDir, `test-mcp-${Date.now()}.db`);
  const db = new duckdb.Database(dbPath);
  const conn = db.connect();
  
  // Create schema and table
  await new Promise((resolve, reject) => {
    conn.exec(`
      CREATE SCHEMA test;
      CREATE TABLE test.example (id INTEGER, name VARCHAR);
      INSERT INTO test.example VALUES (1, 'test1'), (2, 'test2');
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  
  conn.close();
  await new Promise(resolve => db.close(resolve));
  
  console.log(`Test database created at: ${dbPath}`);
  
  // Start server process
  const mcp = spawn('node', ['dist/index.js', dbPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Define a function to send a request and wait for a response
  function sendRequest(request) {
    return new Promise((resolve, reject) => {
      let responseData = '';
      
      // Set up one-time response handler
      const responseHandler = (data) => {
        responseData += data.toString();
        
        try {
          // Try to parse as JSON
          const result = JSON.parse(responseData);
          mcp.stdout.removeListener('data', responseHandler);
          resolve(result);
        } catch (e) {
          // Not complete JSON yet, continue listening
        }
      };
      
      // Listen for response
      mcp.stdout.on('data', responseHandler);
      
      // Set timeout
      const timeout = setTimeout(() => {
        mcp.stdout.removeListener('data', responseHandler);
        reject(new Error('Request timed out'));
      }, 5000);
      
      // Send the request
      mcp.stdin.write(JSON.stringify(request) + '\n');
    });
  }
  
  try {
    // Test hello
    console.log('Sending hello request...');
    const helloResponse = await sendRequest({
      method: 'info/hello',
      params: {}
    });
    console.log('Hello response:', JSON.stringify(helloResponse, null, 2));
    
    // Test tools list
    console.log('\nSending tools list request...');
    const toolsResponse = await sendRequest({
      method: 'tools/list',
      params: {}
    });
    console.log('Tools response:', JSON.stringify(toolsResponse, null, 2));
    
    // Test list_tables
    console.log('\nSending list_tables request...');
    const tablesResponse = await sendRequest({
      method: 'tools/call',
      params: {
        name: 'list_tables',
        arguments: {}
      }
    });
    console.log('Tables response:', JSON.stringify(tablesResponse, null, 2));
  } catch (err) {
    console.error('Test error:', err.message);
  } finally {
    // Clean up
    mcp.kill();
    try {
      unlinkSync(dbPath);
    } catch (e) {
      // Ignore errors
    }
  }
}

testMCPServer().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});