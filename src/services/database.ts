import { SchemaInfo, TableInfo } from "../types/index.js";
import type { Database as DuckDBDatabase, Connection as DuckDBConnection } from "duckdb";

export class DatabaseService {
  private db: DuckDBDatabase | null = null;
  private connection: DuckDBConnection | null = null;
  private initPromise: Promise<void>;
  private ready: boolean = false;

  constructor(databasePath: string) {
    this.initPromise = this.initializeDatabase(databasePath).catch(error => {
      throw error;
    });
  }

  private async initializeDatabase(databasePath: string) {
    try {
      // Dynamic import for ESM compatibility
      const duckdb = await import('duckdb');
      
      // Handle different module formats
      let Database;
      if (duckdb.default && typeof duckdb.default.Database === 'function') {
        // ESM format with default export
        Database = duckdb.default.Database;
      } else if (typeof duckdb.Database === 'function') {
        // CommonJS or direct export
        Database = duckdb.Database;
      } else {
        console.error('DuckDB module structure:', Object.keys(duckdb));
        throw new Error('Could not find DuckDB Database constructor');
      }
      
      // Create a new database connection
      this.db = new Database(databasePath);
      this.connection = this.db.connect();
      this.ready = true;
      
      // Run a test query to make sure the connection works
      await new Promise<void>((resolve, reject) => {
        this.connection!.all('SELECT 1 as test', (err, _) => {
          if (err) reject(new Error(`Database connection test failed: ${err.message}`));
          else resolve();
        });
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to connect to DuckDB database at ${databasePath}: ${error.message}`);
      }
      throw error;
    }
  }

  private async ensureConnection() {
    // Wait for initialization to complete
    await this.initPromise;
    
    if (!this.ready || !this.connection) {
      throw new Error('Database connection not initialized');
    }
  }

  async getSchemaInfo(schemaName: string): Promise<SchemaInfo> {
    const result = await this.executeQuery(
      `SELECT 
         table_name,
         'BASE TABLE' as table_type,
         '' as description
       FROM information_schema.tables 
       WHERE table_schema = ?
       AND table_schema NOT IN ('information_schema')`,
      [schemaName]
    );

    if (result.length === 0) {
      throw new Error(`Schema not found: ${schemaName}`);
    }

    return {
      schema: schemaName,
      tables: result.map(row => ({
        name: row.table_name,
        type: row.table_type,
        description: row.description,
      })),
    };
  }

  async getTableInfo(schemaName: string, tableName: string): Promise<TableInfo> {
    // First check if the schema exists
    const schemaResult = await this.executeQuery(
      `SELECT 1 
       FROM information_schema.schemata 
       WHERE schema_name = ?
       AND schema_name NOT IN ('information_schema')`,
      [schemaName]
    );

    if (schemaResult.length === 0) {
      throw new Error(`Schema not found: ${schemaName}`);
    }

    // Get columns info
    const columnResult = await this.executeQuery(
      `SELECT 
         column_name,
         data_type,
         '' as description
       FROM information_schema.columns
       WHERE table_schema = ? AND table_name = ?
       ORDER BY ordinal_position`,
      [schemaName, tableName]
    );

    if (columnResult.length === 0) {
      throw new Error(`Table not found: ${tableName} in schema ${schemaName}`);
    }

    return {
      schema: schemaName,
      table: tableName,
      description: '',
      columns: columnResult.map(row => ({
        name: row.column_name,
        type: row.data_type,
        description: row.description,
      })),
    };
  }

  async executeQuery(sql: string, params: any[] = []): Promise<any[]> {
    await this.ensureConnection();
    
    if (!this.connection) {
      throw new Error('Database connection not initialized');
    }
    
    try {
      // Simple validation to prevent obvious harmful queries
      const sqlLower = sql.toLowerCase();
      if (sqlLower.includes('drop ') || 
          sqlLower.includes('delete ') || 
          sqlLower.includes('update ') || 
          sqlLower.includes('insert ')) {
        throw new Error('Write operations are not allowed through this interface');
      }
      
      // Execute the query
      const result = await new Promise<any[]>((resolve, reject) => {
        if (params && params.length > 0) {
          this.connection!.all(sql, params, (err: Error | null, rows: any[]) => {
            if (err) reject(err);
            else resolve(rows || []);
          });
        } else {
          this.connection!.all(sql, (err: Error | null, rows: any[]) => {
            if (err) reject(err);
            else resolve(rows || []);
          });
        }
      });
      
      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Query execution failed: ${error.message}`);
      }
      throw error;
    }
  }

  async executeWriteQuery(sql: string, params: any[] = []): Promise<any[]> {
    return this.executeQuery(sql, params);
  }

  async close(): Promise<void> {
    try {
      // Wait for initialization to complete before closing
      await this.initPromise.catch(() => {
        // Ignore initialization errors when closing
      });
      
      if (this.connection) {
        this.connection.close();
      }
      
      if (this.db) {
        await new Promise<void>((resolve, reject) => {
          this.db!.close((err: Error | null) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
      
      this.connection = null;
      this.db = null;
      this.ready = false;
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error closing database connection:', error.message);
      }
    }
  }
}