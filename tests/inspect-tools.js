#!/usr/bin/env node

import { spawn } from 'child_process';
import duckdb from 'duckdb';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';

// Test the inspect tools: inspect_database, inspect_schema, inspect_table
async function testInspectTools() {
  console.log('🧪 Testing inspect tools...');
  const tempDir = join(process.cwd(), '.tmp-test');
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }
  
  const dbPath = join(tempDir, `inspect-tools-test-${Date.now()}.db`);
  
  try {
    // Create test database with multiple schemas and tables
    await createTestDatabase(dbPath);
    
    // Start MCP server
    console.log('\n🔄 Starting MCP server...');
    const mcpProcess = spawn('node', ['dist/index.js', dbPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Track responses for verification
    const responses = [];
    
    // Use readline for proper line-by-line processing
    const rl = createInterface({
      input: mcpProcess.stdout,
      terminal: false
    });
    
    rl.on('line', (line) => {
      if (line.trim()) {
        try {
          // Try to parse the JSON response
          const parsed = JSON.parse(line);
          responses.push(parsed);
          
          console.log(`📤 Received response for request ${parsed.id}:`);
          
          // For content responses, display the formatted content
          if (parsed.result && parsed.result.content && parsed.result.content[0]?.text) {
            try {
              const content = JSON.parse(parsed.result.content[0].text);
              console.log(JSON.stringify(content, null, 2));
            } catch (e) {
              console.log(parsed.result.content[0].text);
            }
          }
        } catch (e) {
          // Not JSON or other issue, just log the raw response
          console.log(`📤 Raw response: ${line}`);
        }
      }
    });
    
    mcpProcess.stderr.on('data', (data) => {
      console.error(`⚠️ Server stderr: ${data.toString().trim()}`);
    });
    
    mcpProcess.on('error', (err) => {
      console.error('❌ Failed to start MCP server:', err);
      process.exit(1);
    });
    
    // Give the server a moment to start
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test 1: Inspect Database - List all schemas
    console.log('\n📝 Test 1: inspect_database - List all schemas');
    await sendRequest(mcpProcess, {
      jsonrpc: "2.0", 
      id: "inspect-db-1",
      method: 'tools/call',
      params: {
        name: 'inspect_database',
        arguments: {}
      }
    });
    
    // Test 2: Inspect Database with filter
    console.log('\n📝 Test 2: inspect_database with filter');
    await sendRequest(mcpProcess, {
      jsonrpc: "2.0", 
      id: "inspect-db-2",
      method: 'tools/call',
      params: {
        name: 'inspect_database',
        arguments: {
          filter: 'app'
        }
      }
    });
    
    // Test 3: Inspect Schema - List tables in a schema
    console.log('\n📝 Test 3: inspect_schema - List tables in "app_data" schema');
    await sendRequest(mcpProcess, {
      jsonrpc: "2.0", 
      id: "inspect-schema-1",
      method: 'tools/call',
      params: {
        name: 'inspect_schema',
        arguments: {
          name: 'app_data'
        }
      }
    });
    
    // Test 4: Inspect Schema with filter
    console.log('\n📝 Test 4: inspect_schema with filter');
    await sendRequest(mcpProcess, {
      jsonrpc: "2.0", 
      id: "inspect-schema-2",
      method: 'tools/call',
      params: {
        name: 'inspect_schema',
        arguments: {
          name: 'app_data',
          filter: '%user%'
        }
      }
    });
    
    // Test 5: Inspect Table - Show column details for a specific table with schema specified
    console.log('\n📝 Test 5: inspect_table - Show column details for app_data.users');
    await sendRequest(mcpProcess, {
      jsonrpc: "2.0", 
      id: "inspect-table-1",
      method: 'tools/call',
      params: {
        name: 'inspect_table',
        arguments: {
          schema: 'app_data',
          name: 'users'
        }
      }
    });
    
    // Test 6: Inspect Table - without specifying schema
    console.log('\n📝 Test 6: inspect_table without schema');
    await sendRequest(mcpProcess, {
      jsonrpc: "2.0", 
      id: "inspect-table-2",
      method: 'tools/call',
      params: {
        name: 'inspect_table',
        arguments: {
          name: 'products'
        }
      }
    });
    
    // Test 7: Error case - Inspect Schema with non-existent schema
    console.log('\n📝 Test 7: inspect_schema with non-existent schema');
    await sendRequest(mcpProcess, {
      jsonrpc: "2.0", 
      id: "inspect-schema-error",
      method: 'tools/call',
      params: {
        name: 'inspect_schema',
        arguments: {
          name: 'nonexistent_schema'
        }
      }
    });
    
    // Allow time for all responses to be processed
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Verify results
    const resultMap = responses.reduce((map, response) => {
      map[response.id] = response;
      return map;
    }, {});
    
    // Check if we got responses for all requests
    const allRequestIds = [
      'inspect-db-1', 'inspect-db-2', 
      'inspect-schema-1', 'inspect-schema-2', 
      'inspect-table-1', 'inspect-table-2',
      'inspect-schema-error'
    ];
    
    const missingResponses = allRequestIds.filter(id => !resultMap[id]);
    if (missingResponses.length > 0) {
      console.error(`❌ Missing responses for requests: ${missingResponses.join(', ')}`);
      process.exit(1);
    }
    
    // Verify each response
    // inspect_database checks
    if (resultMap['inspect-db-1'] && resultMap['inspect-db-1'].result?.content?.[0]?.text) {
      try {
        const schemas = JSON.parse(resultMap['inspect-db-1'].result.content[0].text);
        console.log(`✅ Found ${schemas.length} schemas in the database`);
      } catch (e) {
        console.error('❌ Failed to parse inspect_database result');
      }
    }
    
    if (resultMap['inspect-db-2'] && resultMap['inspect-db-2'].result?.content?.[0]?.text) {
      try {
        const filteredSchemas = JSON.parse(resultMap['inspect-db-2'].result.content[0].text);
        if (filteredSchemas.includes('app_data')) {
          console.log('✅ Successfully filtered schemas containing "app"');
        } else {
          console.error('❌ Failed to filter schemas correctly');
        }
      } catch (e) {
        console.error('❌ Failed to parse inspect_database filter result');
      }
    }
    
    // inspect_schema checks
    if (resultMap['inspect-schema-1'] && resultMap['inspect-schema-1'].result?.content?.[0]?.text) {
      try {
        const content = resultMap['inspect-schema-1'].result.content[0].text;
        // Check if it's an error message
        if (content.startsWith('Error')) {
          console.error(`❌ inspect_schema failed: ${content}`);
        } else {
          const tables = JSON.parse(content);
          console.log(`✅ Found ${tables.length} tables in app_data schema`);
        }
      } catch (e) {
        console.error('❌ Failed to parse inspect_schema result');
      }
    }
    
    if (resultMap['inspect-schema-2'] && resultMap['inspect-schema-2'].result?.content?.[0]?.text) {
      try {
        const content = resultMap['inspect-schema-2'].result.content[0].text;
        // Check if it's an error message
        if (content.startsWith('Error')) {
          console.error(`❌ inspect_schema with filter failed: ${content}`);
        } else {
          const filteredTables = JSON.parse(content);
          console.log(`✅ Found ${filteredTables.length} tables matching filter in app_data schema`);
        }
      } catch (e) {
        console.error('❌ Failed to parse inspect_schema filter result:', e.message);
      }
    }
    
    // inspect_table checks
    if (resultMap['inspect-table-1'] && resultMap['inspect-table-1'].result?.content?.[0]?.text) {
      try {
        const content = resultMap['inspect-table-1'].result.content[0].text;
        // Check if it's an error message
        if (content.startsWith('Error')) {
          console.error(`❌ inspect_table failed: ${content}`);
        } else {
          const columns = JSON.parse(content);
          console.log(`✅ Found ${columns.length} columns in app_data.users table`);
        }
      } catch (e) {
        console.error('❌ Failed to parse inspect_table result:', e.message);
      }
    }
    
    if (resultMap['inspect-table-2'] && resultMap['inspect-table-2'].result?.content?.[0]?.text) {
      try {
        const content = resultMap['inspect-table-2'].result.content[0].text;
        // Check if it's an error message
        if (content.startsWith('Error')) {
          console.error(`❌ inspect_table without schema failed: ${content}`);
        } else {
          const columns = JSON.parse(content);
          console.log(`✅ Successfully inspected products table without schema specification, found ${columns.length} columns`);
        }
      } catch (e) {
        console.error('❌ Failed to parse inspect_table result without schema:', e.message);
      }
    }
    
    // Check error response for non-existent schema
    if (resultMap['inspect-schema-error'] && resultMap['inspect-schema-error'].result?.content?.[0]?.text) {
      const content = resultMap['inspect-schema-error'].result.content[0].text;
      // If empty array or starts with "Error", it's correct
      if (content === '[]' || content.startsWith('Error')) {
        console.log('✅ Correctly returned empty result or error for non-existent schema');
      } else {
        console.error('❌ Expected error for non-existent schema but got:', content);
      }
    }
    
    // Clean up
    console.log('\n✅ Tests completed');
    mcpProcess.kill();
    
    try {
      unlinkSync(dbPath);
      console.log(`✅ Removed temporary database: ${dbPath}`);
    } catch (err) {
      console.error(`⚠️ Could not remove temporary database: ${err.message}`);
    }
    
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

// Helper function to send a request and wait for processing
async function sendRequest(mcpProcess, request) {
  return new Promise(resolve => {
    console.log(`📤 Sending request: ${JSON.stringify(request)}`);
    mcpProcess.stdin.write(JSON.stringify(request) + '\n');
    
    // Add a slight delay to avoid overwhelming the process
    setTimeout(resolve, 200);
  });
}

// Create a test database with multiple schemas and tables
function createTestDatabase(dbPath) {
  return new Promise((resolve, reject) => {
    console.log(`📦 Creating test database at ${dbPath}...`);
    
    try {
      const db = new duckdb.Database(dbPath);
      const conn = db.connect();
      
      console.log('📋 Creating test schemas and tables...');
      conn.exec(`
        -- Create app_data schema with tables
        CREATE SCHEMA app_data;
        
        CREATE TABLE app_data.users (
          id INTEGER PRIMARY KEY,
          username VARCHAR,
          email VARCHAR,
          created_at TIMESTAMP
        );
        
        CREATE TABLE app_data.user_sessions (
          id INTEGER PRIMARY KEY,
          user_id INTEGER,
          session_token VARCHAR,
          last_active TIMESTAMP
        );
        
        CREATE TABLE app_data.products (
          id INTEGER PRIMARY KEY,
          name VARCHAR,
          price DECIMAL(10,2),
          stock INTEGER
        );
        
        -- Create analytics schema with tables
        CREATE SCHEMA analytics;
        
        CREATE TABLE analytics.page_views (
          id INTEGER PRIMARY KEY,
          page_url VARCHAR,
          user_id INTEGER,
          viewed_at TIMESTAMP
        );
        
        CREATE TABLE analytics.conversions (
          id INTEGER PRIMARY KEY,
          user_id INTEGER,
          product_id INTEGER,
          amount DECIMAL(10,2),
          conversion_time TIMESTAMP
        );
        
        -- Create some data in the main schema too
        CREATE TABLE main.settings (
          key VARCHAR PRIMARY KEY,
          value VARCHAR,
          description VARCHAR
        );
        
        -- Insert some sample data
        INSERT INTO app_data.users VALUES 
          (1, 'user1', 'user1@example.com', '2023-01-01 10:00:00'),
          (2, 'user2', 'user2@example.com', '2023-01-02 11:30:00');
          
        INSERT INTO app_data.products VALUES
          (1, 'Product A', 19.99, 100),
          (2, 'Product B', 29.99, 50);
          
        INSERT INTO analytics.page_views VALUES
          (1, '/home', 1, '2023-01-01 12:00:00'),
          (2, '/products', 1, '2023-01-01 12:05:00');
          
        INSERT INTO main.settings VALUES
          ('theme', 'dark', 'UI theme setting'),
          ('language', 'en', 'Default language');
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
testInspectTools().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});