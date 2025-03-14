#!/usr/bin/env node

import duckdb from 'duckdb';
import { mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

// Create a temp directory for our test
const testDir = join(process.cwd(), '.tmp-test');
try {
  mkdirSync(testDir, { recursive: true });
} catch (err) {
  // Directory may already exist
}

// Create a unique database file path
const dbPath = join(testDir, `duckdb-test-${randomUUID()}.db`);
console.log(`Creating test database at ${dbPath}`);

// Create and test database
async function testDuckDB() {
  return new Promise((resolve, reject) => {
    try {
      console.log('Creating DuckDB instance...');
      const db = new duckdb.Database(dbPath);
      
      console.log('Creating connection...');
      const conn = db.connect();
      
      console.log('Creating test table...');
      conn.exec(`
        CREATE TABLE test_data (id INTEGER, name VARCHAR, value DOUBLE);
        INSERT INTO test_data VALUES 
          (1, 'test1', 10.5),
          (2, 'test2', 20.5),
          (3, 'test3', 30.5);
      `, (err) => {
        if (err) {
          console.error('Error creating tables:', err);
          reject(err);
          return;
        }
        
        console.log('Running query...');
        conn.all('SELECT * FROM test_data', (err, rows) => {
          if (err) {
            console.error('Error querying data:', err);
            reject(err);
            return;
          }
          
          console.log('Query results:');
          console.log(rows);
          
          // Close connection
          console.log('Closing connection...');
          conn.close();
          
          console.log('Closing database...');
          db.close((err) => {
            if (err) {
              console.error('Error closing database:', err);
              reject(err);
              return;
            }
            
            console.log('Test completed successfully');
            
            // Clean up temporary database file
            try {
              unlinkSync(dbPath);
              console.log(`Removed temporary database: ${dbPath}`);
            } catch (cleanupErr) {
              console.error(`Warning: Could not remove temporary database: ${cleanupErr.message}`);
            }
            
            resolve();
          });
        });
      });
    } catch (err) {
      console.error('Unexpected error:', err);
      reject(err);
    }
  });
}

// Run the test
testDuckDB().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});