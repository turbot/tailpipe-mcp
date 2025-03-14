#!/usr/bin/env node

import { spawn } from 'child_process';
import duckdb from 'duckdb';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';

// Create a test database and start MCP server for manual testing
async function createTestEnvironment() {
  console.log('Creating temp directory...');
  const tempDir = join(process.cwd(), '.tmp-test');
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }
  
  console.log('Creating test database...');
  const dbPath = join(tempDir, `manual-test-${Date.now()}.db`);
  
  // Create basic DB
  try {
    const db = new duckdb.Database(dbPath);
    const conn = db.connect();
    
    console.log('Creating test tables...');
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
        console.error('Error creating tables:', err);
        process.exit(1);
      }
      
      conn.close();
      db.close(() => {
        console.log('Database created successfully at:', dbPath);
        
        // Create test script file
        const testScriptPath = join(tempDir, 'test-requests.txt');
        writeFileSync(testScriptPath, generateTestScript());
        console.log('Test script created at:', testScriptPath);
        
        console.log('\nTo test the MCP server:');
        console.log('1. In one terminal, run:');
        console.log(`   node dist/index.js ${dbPath}`);
        console.log('2. In another terminal, send MCP requests:');
        console.log('   {"method":"info/hello","params":{}}');
        console.log('   {"method":"tools/list","params":{}}');
        console.log('   {"method":"tools/call","params":{"name":"query","arguments":{"sql":"SELECT * FROM test_data"}}}');
        console.log('   {"method":"tools/call","params":{"name":"listTables","arguments":{}}}');
      });
    });
  } catch (err) {
    console.error('Failed to create database:', err);
    process.exit(1);
  }
}

function generateTestScript() {
  return `# MCP Test Requests
# Copy and paste these into the terminal running the MCP server

# 1. Get server info
{"method":"info/hello","params":{}}

# 2. List tools
{"method":"tools/list","params":{}}

# 3. Execute a basic query
{"method":"tools/call","params":{"name":"query","arguments":{"sql":"SELECT * FROM test_data"}}}

# 4. List tables
{"method":"tools/call","params":{"name":"listTables","arguments":{}}}

# 5. Query the aws schema
{"method":"tools/call","params":{"name":"query","arguments":{"sql":"SELECT * FROM aws.resources"}}}
`;
}

// Run the setup
createTestEnvironment();