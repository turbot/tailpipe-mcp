#!/usr/bin/env node

import duckdb from 'duckdb';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

async function testDuckDB() {
  console.log('Testing DuckDB directly...');
  
  // Create temp directory
  const tempDir = join(process.cwd(), '.tmp-test');
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }
  
  // Create test database
  const dbPath = join(tempDir, `standalone-test-${Date.now()}.db`);
  const db = new duckdb.Database(dbPath);
  const conn = db.connect();
  
  // Create schema and tables
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
  
  // Run the query we're trying to test
  console.log('Running query to list tables...');
  
  const query = `
    SELECT 
      table_schema as schema,
      table_name as name
    FROM information_schema.tables 
    WHERE table_schema NOT IN ('information_schema')
    ORDER BY table_schema, table_name
  `;
  
  await new Promise((resolve, reject) => {
    conn.all(query, (err, rows) => {
      if (err) {
        console.error('Query error:', err);
        reject(err);
        return;
      }
      
      console.log('Query result:', rows);
      resolve();
    });
  });
  
  // Clean up
  conn.close();
  await new Promise(resolve => db.close(resolve));
  
  try {
    unlinkSync(dbPath);
    console.log(`Removed database: ${dbPath}`);
  } catch (e) {
    console.error(`Failed to remove database: ${e.message}`);
  }
}

testDuckDB().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});