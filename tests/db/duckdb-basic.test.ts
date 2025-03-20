import { getTestDatabasePath, cleanupDatabase } from '../setup/test-helpers';
import { describe, expect, test, beforeAll, afterAll } from '@jest/globals';
import duckdb from 'duckdb';

/**
 * Direct DuckDB functionality tests
 * 
 * This tests basic DuckDB operations without going through the MCP server
 * Converted from /tests/duckdb.js to Jest format
 */

describe('DuckDB Direct Operations', () => {
  // Create a unique database path for this test
  const dbPath = getTestDatabasePath('duckdb-direct-test');
  let db: duckdb.Database;
  let conn: duckdb.Connection;
  
  beforeAll(() => {
    // Create a clean database for the test
    db = new duckdb.Database(dbPath);
    conn = db.connect();
  });
  
  afterAll(async () => {
    // Clean up after tests
    if (conn) conn.close();
    
    if (db) {
      await new Promise<void>((resolve) => {
        db.close(() => {
          resolve();
        });
      });
    }
    
    cleanupDatabase(dbPath);
  });
  
  test('can create tables and insert data', async () => {
    // Create test table and insert data
    await new Promise<void>((resolve, reject) => {
      conn.exec(`
        CREATE TABLE test_data (id INTEGER, name VARCHAR, value DOUBLE);
        INSERT INTO test_data VALUES 
          (1, 'test1', 10.5),
          (2, 'test2', 20.5),
          (3, 'test3', 30.5);
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Verify the data was inserted correctly
    const rows = await new Promise<any[]>((resolve, reject) => {
      conn.all('SELECT * FROM test_data ORDER BY id', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    // Verify results
    expect(rows).toHaveLength(3);
    expect(rows[0].id).toBe(1);
    expect(rows[0].name).toBe('test1');
    expect(rows[0].value).toBe(10.5);
    expect(rows[1].id).toBe(2);
    expect(rows[2].id).toBe(3);
  });
  
  test('can query with filters and projections', async () => {
    // Test filtering and projection
    const filteredRows = await new Promise<any[]>((resolve, reject) => {
      conn.all('SELECT name, value FROM test_data WHERE value > 15 ORDER BY value', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    // Verify results
    expect(filteredRows).toHaveLength(2);
    expect(filteredRows[0].name).toBe('test2');
    expect(filteredRows[0].value).toBe(20.5);
    expect(filteredRows[1].name).toBe('test3');
    expect(filteredRows[1].value).toBe(30.5);
    
    // Names only should be strings
    expect(typeof filteredRows[0].name).toBe('string');
    
    // Should only have name and value columns (no id)
    expect(filteredRows[0].id).toBeUndefined();
  });
  
  test('can create and query custom schemas', async () => {
    // Create a new schema with a table
    await new Promise<void>((resolve, reject) => {
      conn.exec(`
        CREATE SCHEMA custom;
        CREATE TABLE custom.items (id INTEGER, description VARCHAR);
        INSERT INTO custom.items VALUES 
          (1, 'Custom item 1'),
          (2, 'Custom item 2');
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Query the custom schema
    const customRows = await new Promise<any[]>((resolve, reject) => {
      conn.all('SELECT * FROM custom.items ORDER BY id', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    // Verify results
    expect(customRows).toHaveLength(2);
    expect(customRows[0].id).toBe(1);
    expect(customRows[0].description).toBe('Custom item 1');
    expect(customRows[1].description).toBe('Custom item 2');
  });
  
  test('handles query errors gracefully', async () => {
    // Try to query a non-existent table
    await expect(
      new Promise<any[]>((resolve, reject) => {
        conn.all('SELECT * FROM non_existent_table', (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      })
    ).rejects.toThrow();
    
    // Try invalid SQL syntax
    await expect(
      new Promise<any[]>((resolve, reject) => {
        conn.all('SELECT FROM WHERE INVALID SQL', (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      })
    ).rejects.toThrow();
  });
});