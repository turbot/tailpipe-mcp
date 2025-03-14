#!/usr/bin/env node

import { spawn } from 'child_process';
import duckdb from 'duckdb';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

// Create and run a test for the listTables tool
async function testListTables() {
  console.log('🚀 Testing listTables tool...');
  const tempDir = join(process.cwd(), '.tmp-test');
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }
  
  const dbPath = join(tempDir, `list-tables-test-${Date.now()}.db`);
  
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
      const response = data.toString().trim();
      console.log(`📤 MCP response: ${response}`);
      
      try {
        // Try to parse and prettify the JSON response
        const parsed = JSON.parse(response);
        if (parsed.result && parsed.result.content) {
          console.log('📋 Response content:');
          console.log(parsed.result.content[0].text);
        }
      } catch (e) {
        // Not JSON or other issue, just log the raw response
      }
    });
    
    let stderrBuffer = '';
    mcpProcess.stderr.on('data', (data) => {
      const stderr = data.toString().trim();
      stderrBuffer += stderr + '\n';
      console.error(`⚠️ MCP stderr: ${stderr}`);
    });
    
    mcpProcess.on('error', (err) => {
      console.error('❌ Failed to start MCP server:', err);
      process.exit(1);
    });
    
    mcpProcess.on('close', (code) => {
      console.log(`👋 MCP server exited with code ${code}`);
      console.log('\n📝 Full stderr log:');
      console.log(stderrBuffer);
      process.exit(code || 0);
    });
    
    // Give the server a moment to start
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Run the listTables tests
    console.log('\n🧪 Testing listTables tool...');
    
    // Test 1: List all tables
    console.log('📝 Test 1: List all tables');
    const listAllRequest = { 
      method: 'tools/call', 
      params: { 
        name: 'list_tables', 
        arguments: {} 
      } 
    };
    console.log(`📤 Sending: ${JSON.stringify(listAllRequest)}`);
    mcpProcess.stdin.write(JSON.stringify(listAllRequest) + '\n');
    
    // Wait for response before next test
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 2: List tables in specific schema
    console.log('\n📝 Test 2: List tables in aws schema');
    const listSchemaRequest = { 
      method: 'tools/call', 
      params: { 
        name: 'list_tables', 
        arguments: { 
          schema: 'aws' 
        } 
      } 
    };
    console.log(`📤 Sending: ${JSON.stringify(listSchemaRequest)}`);
    mcpProcess.stdin.write(JSON.stringify(listSchemaRequest) + '\n');
    
    // Wait for response before next test
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 3: List tables with filter
    console.log('\n📝 Test 3: List tables with s3 in the name');
    const listFilterRequest = { 
      method: 'tools/call', 
      params: { 
        name: 'list_tables', 
        arguments: { 
          filter: '%s3%' 
        } 
      } 
    };
    console.log(`📤 Sending: ${JSON.stringify(listFilterRequest)}`);
    mcpProcess.stdin.write(JSON.stringify(listFilterRequest) + '\n');
    
    // Wait for response, then finish
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Clean up
    console.log('\n✅ Tests completed');
    mcpProcess.kill();
    
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
        -- Create AWS schema with tables
        CREATE SCHEMA aws;
        
        CREATE TABLE aws.s3_bucket (
          id VARCHAR, 
          name VARCHAR,
          region VARCHAR
        );
        
        CREATE TABLE aws.ec2_instance (
          id VARCHAR,
          type VARCHAR,
          region VARCHAR
        );
        
        -- Create Azure schema with tables
        CREATE SCHEMA azure;
        
        CREATE TABLE azure.storage_account (
          id VARCHAR,
          name VARCHAR,
          location VARCHAR
        );
        
        -- Insert some sample data
        INSERT INTO aws.s3_bucket VALUES 
          ('b-123', 'my-bucket', 'us-east-1'),
          ('b-456', 'other-bucket', 'us-west-2');
          
        INSERT INTO aws.ec2_instance VALUES
          ('i-123', 't2.micro', 'us-east-1'),
          ('i-456', 'm5.large', 'us-west-2');
          
        INSERT INTO azure.storage_account VALUES
          ('sa-123', 'mystorageacct', 'eastus'),
          ('sa-456', 'otherstorage', 'westus');
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
testListTables().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});