#!/usr/bin/env node

import { spawn } from 'child_process';
import { mkdirSync, existsSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';

// Create a test that specifically simulates the Claude Desktop tailpipe scenario
async function testClaudeDesktopTailpipe() {
  console.log('🧪 Testing Claude Desktop tailpipe scenario...');
  const tempDir = join(process.cwd(), '.tmp-test');
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }
  
  // Make the database file name match the pattern seen in Claude Desktop
  const dbPath = join(tempDir, `tailpipe_20250313151518.db`);
  
  try {
    // Create a minimal but invalid database file
    // (The goal is to test that even with a broken DB file, the server 
    // will still handle requests gracefully)
    writeFileSync(dbPath, Buffer.from('INVALID TAILPIPE DATABASE', 'utf8'));
    
    console.log(`📦 Created test file at ${dbPath}`);
    
    // Start MCP server
    console.log('\n🔄 Starting MCP server...');
    const mcpProcess = spawn('node', ['dist/index.js', dbPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Track responses
    const responses = {};
    
    // Use readline for proper line-by-line processing
    const rl = createInterface({
      input: mcpProcess.stdout,
      terminal: false
    });
    
    rl.on('line', (line) => {
      if (line.trim()) {
        console.log(`📤 Response: ${line}`);
        
        try {
          // Try to parse the JSON response
          const parsed = JSON.parse(line);
          
          if (parsed.id) {
            responses[parsed.id] = parsed;
          }
        } catch (e) {
          // Not JSON or other issue, just log the raw response
        }
      }
    });
    
    let stderrBuffer = '';
    mcpProcess.stderr.on('data', (data) => {
      const stderr = data.toString().trim();
      stderrBuffer += stderr + '\n';
      console.error(`⚠️ Server stderr: ${stderr}`);
    });
    
    mcpProcess.on('error', (err) => {
      console.error('❌ Failed to start MCP server:', err);
      process.exit(1);
    });
    
    // Give the server a moment to start
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simulate the Claude Desktop sequence
    console.log('\n📝 Step 1: Sending initialize request');
    const initializeRequest = {
      jsonrpc: "2.0",
      id: "initialize",
      method: 'initialize',
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "claude-ai",
          version: "0.1.0"
        }
      }
    };
    mcpProcess.stdin.write(JSON.stringify(initializeRequest) + '\n');
    
    // Wait a bit before next request
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Resources list - this is where the error was reported
    console.log('\n📝 Step 2: Sending resources/list request');
    const resourcesRequest = {
      jsonrpc: "2.0",
      id: "resources-list",
      method: 'resources/list',
      params: {}
    };
    mcpProcess.stdin.write(JSON.stringify(resourcesRequest) + '\n');
    
    // Wait a bit before next request
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Tools list
    console.log('\n📝 Step 3: Sending tools/list request');
    const toolsRequest = {
      jsonrpc: "2.0",
      id: "tools-list",
      method: 'tools/list',
      params: {}
    };
    mcpProcess.stdin.write(JSON.stringify(toolsRequest) + '\n');
    
    // Wait a bit before next request
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Try the list_tables tool that failed in the user's scenario
    console.log('\n📝 Step 4: Trying the list_tables tool');
    const listTablesRequest = {
      jsonrpc: "2.0",
      id: "list-tables",
      method: 'tools/call',
      params: {
        name: 'list_tables',
        arguments: {}
      }
    };
    mcpProcess.stdin.write(JSON.stringify(listTablesRequest) + '\n');
    
    // Wait for all responses to be received
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verify responses
    const requiredResponses = ['initialize', 'resources-list', 'tools-list', 'list-tables'];
    const missingResponses = requiredResponses.filter(id => !responses[id]);
    
    if (missingResponses.length > 0) {
      console.error(`❌ Missing responses for: ${missingResponses.join(', ')}`);
    } else {
      console.log('✅ Received responses for all requests');
      
      // Check if resources list contains at least something
      if (responses['resources-list']?.result?.resources?.length > 0) {
        console.log(`✅ Resources/list returned ${responses['resources-list'].result.resources.length} resources`);
        console.log('Resources:', responses['resources-list'].result.resources.map(r => r.name).join(', '));
      } else {
        console.error('❌ Resources/list returned empty or invalid response');
      }
      
      // Check if list_tables returned something useful
      if (responses['list-tables']?.result?.content?.[0]?.text) {
        try {
          const tables = JSON.parse(responses['list-tables'].result.content[0].text);
          if (Array.isArray(tables)) {
            console.log(`✅ list_tables returned ${tables.length} tables`);
            if (tables.length > 0) {
              console.log('Tables:', tables.map(t => `${t.schema}.${t.name}`).join(', '));
            }
          } else {
            console.error('❌ list_tables did not return an array');
          }
        } catch (e) {
          console.error('❌ Failed to parse list_tables response');
        }
      } else {
        console.error('❌ list_tables returned empty or invalid response');
      }
    }
    
    // Clean up
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

// Run the test
testClaudeDesktopTailpipe().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});