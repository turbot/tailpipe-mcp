#!/usr/bin/env node

import { spawn } from 'child_process';
import duckdb from 'duckdb';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

// Simple test to verify the most basic functionality
async function runBasicTest() {
  console.log('Creating temp directory...');
  const tempDir = join(process.cwd(), '.tmp-test');
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }
  
  console.log('Creating test database...');
  const dbPath = join(tempDir, `simple-test-${Date.now()}.db`);
  
  // Create basic DB
  try {
    const db = new duckdb.Database(dbPath);
    const conn = db.connect();
    
    console.log('Creating test table...');
    conn.exec(`
      CREATE TABLE test_data (id INTEGER, name VARCHAR);
      INSERT INTO test_data VALUES (1, 'test1'), (2, 'test2');
    `, (err) => {
      if (err) {
        console.error('Error creating table:', err);
        process.exit(1);
      }
      
      conn.close();
      db.close(() => {
        console.log('Database created successfully.');
        runMCPServer(dbPath);
      });
    });
  } catch (err) {
    console.error('Failed to create database:', err);
    process.exit(1);
  }
}

function runMCPServer(dbPath) {
  console.log(`Starting MCP server with database: ${dbPath}`);
  
  const mcpProcess = spawn('node', ['dist/index.js', dbPath], {
    stdio: 'inherit'  // Use parent's stdio for simplicity
  });
  
  mcpProcess.on('error', (err) => {
    console.error('Failed to start MCP server:', err);
    process.exit(1);
  });
  
  mcpProcess.on('close', (code) => {
    console.log(`MCP server exited with code ${code}`);
    
    // Clean up temporary database
    try {
      unlinkSync(dbPath);
      console.log(`Removed temporary database: ${dbPath}`);
    } catch (err) {
      console.error(`Warning: Could not remove temporary database: ${err.message}`);
    }
    
    process.exit(code);
  });
  
  // Send Ctrl+C to process after 10 seconds (automatic test)
  setTimeout(() => {
    console.log('Test completed, stopping server...');
    mcpProcess.kill('SIGINT');
  }, 10000);
}

// Run the test
runBasicTest();