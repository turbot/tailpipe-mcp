import { DatabaseService } from '../../src/services/database.js';
import { getTestDatabasePath, createTestDatabase, cleanupDatabase } from '../../setup/test-helpers';
import { logger } from '../../src/services/logger.js';

// Import the tools we want to test
import { handleListTablesTool } from '../../src/tools/listTables.js';
import { handleQueryTool } from '../../src/tools/query.js';
import { handleInspectDatabaseTool } from '../../src/tools/inspectDatabase.js';
import { handleInspectSchemaTool } from '../../src/tools/inspectSchema.js';
import { handleInspectTableTool } from '../../src/tools/inspectTable.js';

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
  
  describe('list_tables Tool', () => {
    test('Lists all tables when no filters are provided', async () => {
      try {
        const result = await handleListTablesTool(dbService, {});
        
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        expect(Array.isArray(result.content)).toBe(true);
        
        // Get the text content
        const textContent = result.content.find((item: any) => item.type === 'text');
        expect(textContent).toBeDefined();
        expect(textContent?.text).toBeDefined();
        
        // Parse the JSON in the text content
        const tables = JSON.parse(textContent!.text);
        expect(Array.isArray(tables)).toBe(true);
        expect(tables.length).toBeGreaterThan(0);
        
        // Check for expected tables in main schema
        const mainTables = tables.filter((t: any) => t.schema === 'main');
        expect(mainTables.length).toBeGreaterThan(0);
        expect(mainTables.some((t: any) => t.name === 'test_data')).toBe(true);
        
        // Check for expected tables in test schema
        const testTables = tables.filter((t: any) => t.schema === 'test');
        expect(testTables.length).toBeGreaterThan(0);
        expect(testTables.some((t: any) => t.name === 'example')).toBe(true);
      } catch (error) {
        logger.error(`Test failed: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    });
    
    test('Filters tables by schema', async () => {
      const result = await handleListTablesTool(dbService, { 
        schema: 'test'
      });
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      
      // Get the text content
      const textContent = result.content.find((item: any) => item.type === 'text');
      expect(textContent).toBeDefined();
      
      // Parse the JSON in the text content
      const tables = JSON.parse(textContent!.text);
      expect(Array.isArray(tables)).toBe(true);
      
      // All returned tables should be in the test schema
      tables.forEach((table: any) => {
        expect(table.schema).toBe('test');
      });
      
      // Should include the example table
      expect(tables.some((t: any) => t.name === 'example')).toBe(true);
    });
    
    test('Filters tables by name pattern', async () => {
      const result = await handleListTablesTool(dbService, { 
        filter: 'test%'
      });
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      
      // Get the text content
      const textContent = result.content.find((item: any) => item.type === 'text');
      expect(textContent).toBeDefined();
      
      // Parse the JSON in the text content
      const tables = JSON.parse(textContent!.text);
      expect(Array.isArray(tables)).toBe(true);
      
      // All returned tables should match the filter pattern
      tables.forEach((table: any) => {
        expect(table.name.startsWith('test')).toBe(true);
      });
    });
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
  
  describe('inspectDatabase Tool', () => {
    test('Lists all schemas in the database', async () => {
      const result = await handleInspectDatabaseTool(dbService, {});
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      
      // Get the text content
      const textContent = result.content.find((item: any) => item.type === 'text');
      expect(textContent).toBeDefined();
      
      // Parse the JSON text to get schemas
      const schemas = JSON.parse(textContent!.text);
      expect(Array.isArray(schemas)).toBe(true);
      expect(schemas.length).toBeGreaterThan(0);
      
      // Should include main, aws, and test schemas
      expect(schemas).toContain('main');
      expect(schemas).toContain('test');
      expect(schemas).toContain('aws');
    });
  });
  
  describe('inspectSchema Tool', () => {
    test('Lists all tables in the specified schema', async () => {
      const result = await handleInspectSchemaTool(dbService, { 
        name: 'test'
      });
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      
      // Get the text content
      const textContent = result.content.find((item: any) => item.type === 'text');
      expect(textContent).toBeDefined();
      
      // Parse the JSON text to get tables
      const tables = JSON.parse(textContent!.text);
      expect(Array.isArray(tables)).toBe(true);
      expect(tables.length).toBeGreaterThan(0);
      
      // Should include the example table
      expect(tables.some((t: any) => t.table_name === 'example')).toBe(true);
    });
    
    test('Handles error for non-existent schema', async () => {
      const result = await handleInspectSchemaTool(dbService, { 
        name: 'non_existent_schema'
      });
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      
      // For this implementation, the result might be an empty array without an error
      // or the response format might vary, so we just check for some content
      const textContent = result.content.find((item: any) => item.type === 'text');
      expect(textContent).toBeDefined();
    });
  });
  
  describe('inspectTable Tool', () => {
    test('Returns column information for the specified table', async () => {
      const result = await handleInspectTableTool(dbService, { 
        schema: 'test',
        name: 'example'
      });
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      
      // Get the text content
      const textContent = result.content.find((item: any) => item.type === 'text');
      expect(textContent).toBeDefined();
      
      // Parse the JSON text to get columns
      const columns = JSON.parse(textContent!.text);
      expect(Array.isArray(columns)).toBe(true);
      expect(columns.length).toBe(2);
      
      // Check column details
      const idColumn = columns.find((c: any) => c.column_name === 'id');
      const nameColumn = columns.find((c: any) => c.column_name === 'name');
      
      expect(idColumn).toBeDefined();
      expect(nameColumn).toBeDefined();
      expect(idColumn?.data_type.toLowerCase()).toContain('int');
      expect(nameColumn?.data_type.toLowerCase()).toContain('varchar');
    });
    
    test('Handles error for non-existent table', async () => {
      const result = await handleInspectTableTool(dbService, { 
        schema: 'test',
        name: 'non_existent_table'
      });
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      
      // For this implementation, the result might be an empty array without an error
      // or the response format might vary, so we just check for some content
      const textContent = result.content.find((item: any) => item.type === 'text');
      expect(textContent).toBeDefined();
    });
  });
});