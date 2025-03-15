import duckdb from 'duckdb';
import { getTestDatabasePath, cleanupDatabase } from '../helpers';

describe('DuckDB Connection Tests', () => {
  const dbPath = getTestDatabasePath('duckdb-basic');
  
  // Clean up after all tests
  afterAll(() => {
    cleanupDatabase(dbPath);
  });
  
  test('Can create database, tables and query data', async () => {
    // Create database instance
    const db = new duckdb.Database(dbPath);
    const conn = db.connect();
    
    // Create test table
    await new Promise<void>((resolve, reject) => {
      conn.exec(`
        CREATE TABLE test_data (id INTEGER, name VARCHAR, value DOUBLE);
        INSERT INTO test_data VALUES 
          (1, 'test1', 10.5),
          (2, 'test2', 20.5),
          (3, 'test3', 30.5);
      `, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Query data
    const rows = await new Promise<any[]>((resolve, reject) => {
      conn.all('SELECT * FROM test_data ORDER BY id', (err: Error | null, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // Assertions
    expect(rows).toHaveLength(3);
    expect(rows[0].id).toBe(1);
    expect(rows[0].name).toBe('test1');
    expect(rows[0].value).toBe(10.5);
    
    // Clean up connection
    conn.close();
    
    // Close database
    await new Promise<void>((resolve, reject) => {
      db.close((err?: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
  
  test('Can create and query custom schemas', async () => {
    // Create database instance
    const db = new duckdb.Database(dbPath);
    const conn = db.connect();
    
    // Create custom schema and table
    await new Promise<void>((resolve, reject) => {
      conn.exec(`
        CREATE SCHEMA IF NOT EXISTS test;
        CREATE TABLE IF NOT EXISTS test.example (
          id INTEGER,
          name VARCHAR
        );
        INSERT INTO test.example VALUES
          (1, 'item1'),
          (2, 'item2');
      `, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Query the custom schema table
    const rows = await new Promise<any[]>((resolve, reject) => {
      conn.all('SELECT * FROM test.example ORDER BY id', (err: Error | null, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // Query the schemas from information_schema
    const schemas = await new Promise<any[]>((resolve, reject) => {
      conn.all(
        'SELECT schema_name FROM information_schema.schemata ' + 
        'WHERE schema_name NOT IN (\'information_schema\')', 
        (err: Error | null, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
    
    // Assertions
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(1);
    expect(rows[0].name).toBe('item1');
    
    // Should have at least 'main' and 'test' schemas
    expect(schemas.length).toBeGreaterThanOrEqual(2);
    const schemaNames = schemas.map(row => row.schema_name);
    expect(schemaNames).toContain('main');
    expect(schemaNames).toContain('test');
    
    // Clean up
    conn.close();
    await new Promise<void>(resolve => db.close(() => resolve()));
  });
  
  test('Can handle errors gracefully', async () => {
    // Create database instance
    const db = new duckdb.Database(dbPath);
    const conn = db.connect();
    
    // Test invalid SQL query
    await expect(
      new Promise<any[]>((resolve, reject) => {
        conn.all('SELECT * FROM non_existent_table', (err: Error | null, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows);
        });
      })
    ).rejects.toThrow();
    
    // Clean up
    conn.close();
    await new Promise<void>(resolve => db.close(() => resolve()));
  });
});