#!/usr/bin/env node

import { spawn } from 'child_process';
import duckdb from 'duckdb';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';

async function runSimpleTest() {
  // Create a temp database
  const tempDir = join(process.cwd(), '.tmp-test');
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }
  
  const dbPath = join(tempDir, `simple-list-test-${Date.now()}.db`);
  
  // Create and populate the database
  const db = new duckdb.Database(dbPath);
  const conn = db.connect();
  
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
  await new Promise(resolve => db.close(() => resolve()));
  
  console.log(`Created test database at ${dbPath}`);
  
  // Now run the MCP server
  console.log('Starting MCP server...');
  const serverProcess = spawn('node', ['dist/index.js', dbPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  // Handle stdout using line reader to properly parse JSON responses
  const rl = createInterface({
    input: serverProcess.stdout,
    terminal: false
  });
  
  rl.on('line', (line) => {
    if (line.trim()) {
      console.log('STDOUT:', line);
      try {
        const json = JSON.parse(line);
        console.log('Parsed JSON:', JSON.stringify(json, null, 2));
      } catch (e) {
        console.log('(Not valid JSON)');
      }
    }
  });
  
  // Log stderr
  serverProcess.stderr.on('data', (data) => {
    console.log('STDERR:', data.toString());
  });
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // First send a tools/list request
  console.log('Sending tools/list request...');
  const toolsListRequest = JSON.stringify({
    jsonrpc: "2.0",
    id: "test-request-1",
    method: 'tools/list',
    params: {}
  });
  
  console.log('Request:', toolsListRequest);
  serverProcess.stdin.write(toolsListRequest + '\n');
  
  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Then send a list_tables request
  console.log('Sending list_tables request...');
  const request = JSON.stringify({
    jsonrpc: "2.0",
    id: "test-request-2",
    method: 'tools/call',
    params: {
      name: 'list_tables',
      arguments: {}
    }
  });
  
  console.log('Request:', request);
  serverProcess.stdin.write(request + '\n');
  
  // Wait for response
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Clean up
  serverProcess.kill();
  unlinkSync(dbPath);
  console.log('Test completed.');
}

runSimpleTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});