import { SchemaInfo, TableInfo } from "../types/index.js";
import type { Database as DuckDBDatabase, Connection as DuckDBConnection } from "duckdb";

export class DatabaseService {
  private db: DuckDBDatabase | null = null;
  private connection: DuckDBConnection | null = null;
  private initPromise: Promise<void>;
  private ready: boolean = false;
  private databasePath: string;
  private initAttempted: boolean = false;

  constructor(databasePath: string) {
    this.databasePath = databasePath;
    this.initPromise = this.initializeDatabase().catch(error => {
      console.error(`Database initialization failed: ${error instanceof Error ? error.message : String(error)}`);
      this.ready = false;
      // Don't rethrow, allow reconnection attempts
    });
  }

  private async initializeDatabase() {
    this.initAttempted = true;
    
    try {
      // If we already have an active connection, close it first
      if (this.connection) {
        try {
          this.connection.close();
        } catch (e) {
          // Ignore errors when closing existing connection
        }
        this.connection = null;
      }
      
      if (this.db) {
        try {
          await new Promise<void>((resolve) => {
            this.db!.close((err) => {
              // Ignore errors when closing
              resolve();
            });
          });
        } catch (e) {
          // Ignore errors when closing existing database
        }
        this.db = null;
      }
      
      this.ready = false;
      
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
      
      // Create a new database connection in read-only mode
      this.db = new Database(this.databasePath, { access_mode: 'READ_ONLY' });
      this.connection = this.db.connect();
      
      // Run a test query to make sure the connection works
      await new Promise<void>((resolve, reject) => {
        if (!this.connection) {
          reject(new Error('Connection failed to initialize'));
          return;
        }
        
        this.connection.all('SELECT 1 as test', (err, rows) => {
          if (err) {
            reject(new Error(`Database connection test failed: ${err.message}`));
          } else {
            console.error(`Database connection test successful: ${JSON.stringify(rows)}`);
            resolve();
          }
        });
      });
      
      // If we've made it this far, the connection is ready
      this.ready = true;
      console.error(`Successfully connected to database: ${this.databasePath}`);
    } catch (error) {
      this.ready = false;
      if (error instanceof Error) {
        throw new Error(`Failed to connect to DuckDB database at ${this.databasePath}: ${error.message}`);
      }
      throw error;
    }
  }

  private async ensureConnection(maxRetries = 2) {
    let retryCount = 0;
    let lastError = null;
    
    while (retryCount <= maxRetries) {
      try {
        // Wait for initialization to complete, but catch errors to handle them
        await this.initPromise.catch(e => {
          console.error(`Initialization error caught: ${e instanceof Error ? e.message : String(e)}`);
          // We'll handle this in the next check
        });
        
        if (!this.ready || !this.connection) {
          if (retryCount > 0) {
            console.error(`Retry attempt ${retryCount}: Database connection not ready, attempting to reconnect...`);
          } else {
            console.error('Database connection not ready, attempting to reconnect...');
          }
          
          // Clean up existing connections if they exist but are not ready
          try {
            if (this.connection) {
              this.connection.close();
              this.connection = null;
            }
            
            if (this.db) {
              await new Promise<void>((resolve) => {
                this.db!.close(() => resolve());
              }).catch(() => {
                // Ignore errors when closing
              });
              this.db = null;
            }
          } catch (e) {
            // Ignore errors when cleaning up
            console.error(`Error cleaning up existing connections: ${e instanceof Error ? e.message : String(e)}`);
          }
          
          // Reinitialize the database connection
          console.error(`Reinitializing connection to ${this.databasePath}`);
          this.initPromise = this.initializeDatabase();
          
          try {
            await this.initPromise;
          } catch (e) {
            console.error(`Reinitialization attempt ${retryCount+1} failed: ${e instanceof Error ? e.message : String(e)}`);
            // Will be handled in the next check
          }
          
          if (!this.ready || !this.connection) {
            throw new Error('Database connection could not be reestablished');
          }
        }
        
        // Verify connection with a simple test query
        await this.testConnectionQuickly();
        
        // If we reach here, connection is good
        console.error(`Connection successfully verified on attempt ${retryCount+1}`);
        return;
      } catch (error) {
        lastError = error;
        console.error(`Connection error (attempt ${retryCount+1}/${maxRetries+1}): ${error instanceof Error ? error.message : String(error)}`);
        
        // If we're out of retries, bail out
        if (retryCount >= maxRetries) {
          break;
        }
        
        // Otherwise, reset state and wait before retrying
        this.ready = false;
        this.connection = null;
        
        // Wait with exponential backoff before retrying (capped at 2 seconds)
        const backoffMs = Math.min(100 * Math.pow(2, retryCount), 2000);
        console.error(`Will retry in ${backoffMs}ms`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        retryCount++;
      }
    }
    
    // If we get here, all retries failed
    const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
    
    // Return a specific error for Claude Desktop diagnostics
    if (this.databasePath.includes('tailpipe_')) {
      throw new Error(`Failed to connect to Tailpipe database at ${this.databasePath}. This may be due to Claude Desktop keeping the database file locked. Try closing and reopening Claude Desktop.`);
    }
    
    throw new Error(`Database connection not available after ${maxRetries + 1} attempts: ${errorMessage}`);
  }
  
  private async testConnectionQuickly(): Promise<void> {
    if (!this.connection) {
      throw new Error('No connection to test');
    }
    
    return new Promise<void>((resolve, reject) => {
      // Use a very simple query that should work even if the database is mostly locked
      const startTime = Date.now();
      this.connection!.all('SELECT 1 as test', (err, rows) => {
        const elapsed = Date.now() - startTime;
        
        if (err) {
          this.ready = false; // Mark connection as not ready
          console.error(`Connection test failed after ${elapsed}ms: ${err.message}`);
          reject(new Error(`Connection test failed: ${err.message}`));
        } else if (!rows || rows.length === 0) {
          this.ready = false; // Mark connection as not ready
          console.error(`Connection test failed after ${elapsed}ms: No rows returned`);
          reject(new Error('Connection test failed: No rows returned'));
        } else {
          // Test passed, connection is working
          if (elapsed > 100) {
            // If the test took a long time, log it as it might indicate performance issues
            console.error(`Connection test succeeded but took ${elapsed}ms`);
          }
          resolve();
        }
      });
      
      // Set a timeout to detect if the query is hanging
      setTimeout(() => {
        if (this.connection) {
          console.error(`Connection test query is taking too long (>1000ms), may be hung`);
        }
      }, 1000);
    });
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

  async executeQuery(sql: string, params: any[] = [], retries = 1): Promise<any[]> {
    try {
      await this.ensureConnection();
      
      if (!this.connection) {
        throw new Error('Database connection not initialized');
      }
      
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if this is an error that might be resolved by reconnecting
      const isConnectionError = 
        errorMessage.includes('connection') || 
        errorMessage.includes('database') ||
        !this.ready;
        
      if (isConnectionError && retries > 0) {
        console.error(`Query error, attempting retry. Error: ${errorMessage}`);
        
        // Force reconnection on next ensureConnection call
        this.ready = false;
        
        // Wait a moment before retrying to allow any transient issues to resolve
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Retry with one fewer retry attempt
        return this.executeQuery(sql, params, retries - 1);
      }
      
      // Special handling for Claude Desktop's tailpipe database
      if (this.databasePath.includes('tailpipe_') && 
          (sql.includes('information_schema.tables') || sql.includes('list_tables'))) {
        console.error(`Providing fallback empty result for tailpipe database query: ${sql.substring(0, 50)}...`);
        
        // If this is a schema query, return at least the 'main' schema
        if (sql.includes('schema_name')) {
          return [{ schema_name: 'main' }];
        }
        
        // For other information_schema queries, return an empty array instead of failing
        return [];
      }
      
      // Either not a connection error or out of retries
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