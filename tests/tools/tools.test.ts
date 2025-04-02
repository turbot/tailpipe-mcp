import { DatabaseService } from '../../src/services/database.js';
import { getTestDatabasePath, createTestDatabase, cleanupDatabase } from '../setup/test-helpers';
import { logger } from '../../src/services/logger.js';

// Import the tools we want to test
import { handleQueryTool } from '../../src/tools/query.js';

describe('Tools Unit Tests', () => {
  const dbPath = getTestDatabasePath('tools-direct');
  let dbService: DatabaseService;
  
  beforeAll(async () => {
    await createTestDatabase(dbPath);
    dbService = new DatabaseService(dbPath);
    
    // Wait for database to initialize
    await dbService.executeQuery('SELECT 1');
  });
  
  afterAll(async () => {
    await dbService.close();
    cleanupDatabase(dbPath);
  });
  
  describe('query Tool', () => {
    test('Executes SQL query and returns results', async () => {
      const result = await handleQueryTool(dbService, { 
        sql: 'SELECT * FROM test_data ORDER BY id'
      });
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      
      // Get the text content
      const textContent = result.content.find((item: any) => item.type === 'text');
      expect(textContent).toBeDefined();
      
      // Parse the JSON in the text content
      const rows = JSON.parse(textContent!.text);
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBe(3);
      
      // Check first row values
      expect(rows[0].id).toBe(1);
      expect(rows[0].name).toBe('test1');
      expect(rows[0].value).toBe(10.5);
    });
    
    test('Handles query errors gracefully', async () => {
      const result = await handleQueryTool(dbService, { 
        sql: 'SELECT * FROM non_existent_table'
      });
      
      expect(result).toBeDefined();
      expect(result.isError).toBe(true);
      expect(result.content).toBeDefined();
      
      // Should have error message in the text content
      const textContent = result.content.find((item: any) => item.type === 'text');
      expect(textContent).toBeDefined();
      expect(textContent!.text).toContain('failed');
    });
    
    test('Prevents write operations', async () => {
      const result = await handleQueryTool(dbService, { 
        sql: 'INSERT INTO test_data VALUES (4, "test4", 40.5)'
      });
      
      expect(result).toBeDefined();
      expect(result.isError).toBe(true);
      expect(result.content).toBeDefined();
      
      // Should have error message about write operations
      const textContent = result.content.find((item: any) => item.type === 'text');
      expect(textContent).toBeDefined();
      expect(textContent!.text).toContain('not allowed');
    });
  });
});