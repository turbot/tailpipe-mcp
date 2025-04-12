import { DatabaseService } from '../../src/services/database.js';
import { getTestDatabasePath, createTestDatabase, cleanupDatabase } from '../setup/test-helpers';

describe('DatabaseService Tests', () => {
  const dbPath = getTestDatabasePath('db-service');
  
  beforeAll(async () => {
    await createTestDatabase(dbPath);
  });
  
  afterAll(() => {
    cleanupDatabase(dbPath);
  });
  
  test('Can initialize and connect to database', async () => {
    const dbService = new DatabaseService(dbPath);
    
    try {
      // Test a simple query
      const result = await dbService.executeQuery('SELECT 1 as test');
      expect(result).toHaveLength(1);
      expect(result[0].test).toBe(1);
    } finally {
      await dbService.close();
    }
  });
  
  test('Can query standard table data', async () => {
    const dbService = new DatabaseService(dbPath);
    
    try {
      const result = await dbService.executeQuery('SELECT * FROM test_data ORDER BY id');
      
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe(1);
      expect(result[0].name).toBe('test1');
      expect(result[0].value).toBe(10.5);
    } finally {
      await dbService.close();
    }
  });
  
  test('Can query data from custom schema', async () => {
    const dbService = new DatabaseService(dbPath);
    
    try {
      const result = await dbService.executeQuery('SELECT * FROM test.example ORDER BY id');
      
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe(1);
      expect(result[0].name).toBe('item1');
    } finally {
      await dbService.close();
    }
  });
  
  test('Can handle query errors', async () => {
    const dbService = new DatabaseService(dbPath);
    
    try {
      await expect(
        dbService.executeQuery('SELECT * FROM non_existent_table')
      ).rejects.toThrow();
    } finally {
      await dbService.close();
    }
  });
  
  test('Prevents write operations', async () => {
    const dbService = new DatabaseService(dbPath);
    
    try {
      await expect(
        dbService.executeQuery('DROP TABLE if exists test_data')
      ).rejects.toThrow('Write operations are not allowed');
      
      await expect(
        dbService.executeQuery('INSERT INTO test_data VALUES (4, \'test4\', 40.5)')
      ).rejects.toThrow('Write operations are not allowed');
      
      await expect(
        dbService.executeQuery('UPDATE test_data SET value = 100 WHERE id = 1')
      ).rejects.toThrow('Write operations are not allowed');
      
      await expect(
        dbService.executeQuery('DELETE FROM test_data WHERE id = 1')
      ).rejects.toThrow('Write operations are not allowed');
    } finally {
      await dbService.close();
    }
  });
});