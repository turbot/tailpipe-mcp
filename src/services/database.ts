import { SchemaInfo, TableInfo } from "../types/index.js";
import { execSync } from "child_process";
import { resolve } from "path";
import { existsSync } from "fs";
import { logger } from "./logger.js";
import duckdb from 'duckdb';

// Define types for DuckDB callback parameters
type DuckDBError = Error | null;
type DuckDBRow = Record<string, any>;

/**
 * Get database path using Tailpipe CLI
 * @returns The resolved database path from Tailpipe CLI
 */

export async function getDatabasePathFromTailpipe(): Promise<string> {
  try {
    logger.info('Getting database path from Tailpipe CLI...');
    if (process.env.TAILPIPE_MCP_DEBUG === 'true') {
      logger.debug('PATH environment variable:', process.env.PATH);
      logger.debug('Which tailpipe:', execSync('which tailpipe || echo "not found"', { encoding: 'utf-8' }));
    }
    const output = execSync('tailpipe connect --output json', { encoding: 'utf-8' });
    
    try {
      const result = JSON.parse(output);
      
      if (result?.database_filepath) {
        const resolvedPath = resolve(result.database_filepath);
        logger.info(`Using Tailpipe database path: ${resolvedPath}`);
        
        if (!existsSync(resolvedPath)) {
          throw new Error(`Tailpipe database file does not exist: ${resolvedPath}`);
        }
        
        return resolvedPath;
      } else {
        logger.error('Tailpipe connect output JSON:', JSON.stringify(result));
        throw new Error('Tailpipe connect output missing database_filepath field');
      }
    } catch (parseError) {
      logger.error('Failed to parse Tailpipe CLI output:', parseError instanceof Error ? parseError.message : String(parseError));
      logger.error('Tailpipe output:', output);
      throw new Error('Failed to parse Tailpipe CLI output');
    }
  } catch (error) {
    logger.error('Failed to run Tailpipe CLI:', error instanceof Error ? error.message : String(error));
    throw new Error('Failed to get database path from Tailpipe CLI');
  }
}

export class DatabaseService {
  private db: any = null;
  private connection: any = null;
  private initPromise: Promise<void>;
  private ready: boolean = false;
  public databasePath: string; // Changed to public to allow reconnection
  public sourceType: string; // Track how database path was obtained (cli-arg or tailpipe)
  private initAttempted: boolean = false;

  constructor(databasePath: string, sourceType: string = 'cli-arg') {
    this.databasePath = databasePath;
    this.sourceType = sourceType;
    this.initPromise = this.initializeDatabase().catch(error => {
      logger.error(`Database initialization failed: ${error instanceof Error ? error.message : String(error)}`);
      this.ready = false;
      // Don't rethrow, allow reconnection attempts
    });
  }

  // Made public to allow reconnection via reconnect tool
  public async initializeDatabase() {
    this.initAttempted = true;
    
    try {
      logger.debug(`Initializing database connection to: ${this.databasePath}`);
      
      // Create database instance
      this.db = new duckdb.Database(this.databasePath);
      
      // Create connection
      if (this.db) {
        this.connection = this.db.connect();
      } else {
        throw new Error('Failed to create database instance');
      }
      
      // Run a test query to make sure the connection works
      await new Promise<void>((resolve, reject) => {
        if (!this.connection) {
          reject(new Error('Connection failed to initialize'));
          return;
        }
        
        this.connection.all('SELECT 1 as test', (err: DuckDBError, rows: DuckDBRow[]) => {
          if (err) {
            reject(new Error(`Database connection test failed: ${err.message}`));
          } else {
            logger.debug(`Database connection test successful: ${JSON.stringify(rows)}`);
            resolve();
          }
        });
      });
      
      // If we've made it this far, the connection is ready
      this.ready = true;
      logger.debug(`Successfully connected to database: ${this.databasePath}`);
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
          logger.error(`Initialization error caught: ${e instanceof Error ? e.message : String(e)}`);
          // We'll handle this in the next check
        });
        
        if (!this.ready || !this.connection) {
          if (retryCount > 0) {
            logger.warn(`Retry attempt ${retryCount}: Database connection not ready, attempting to reconnect...`);
          } else {
            logger.warn('Database connection not ready, attempting to reconnect...');
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
            logger.error(`Error cleaning up existing connections: ${e instanceof Error ? e.message : String(e)}`);
          }
          
          // Reinitialize the database connection
          logger.info(`Reinitializing connection to ${this.databasePath}`);
          this.initPromise = this.initializeDatabase();
          
          try {
            await this.initPromise;
          } catch (e) {
            logger.error(`Reinitialization attempt ${retryCount+1} failed: ${e instanceof Error ? e.message : String(e)}`);
            // Will be handled in the next check
          }
          
          if (!this.ready || !this.connection) {
            throw new Error('Database connection could not be reestablished');
          }
        }
        
        // Verify connection with a simple test query
        await this.testConnectionQuickly();
        
        // If we reach here, connection is good
        logger.debug(`Connection successfully verified on attempt ${retryCount+1}`);
        return;
      } catch (error) {
        lastError = error;
        logger.error(`Connection error (attempt ${retryCount+1}/${maxRetries+1}): ${error instanceof Error ? error.message : String(error)}`);
        
        // If we're out of retries, bail out
        if (retryCount >= maxRetries) {
          break;
        }
        
        // Otherwise, reset state and wait before retrying
        this.ready = false;
        this.connection = null;
        
        // Wait with exponential backoff before retrying (capped at 2 seconds)
        const backoffMs = Math.min(100 * Math.pow(2, retryCount), 2000);
        logger.debug(`Will retry in ${backoffMs}ms`);
        await new Promise(resolve => {
          const timer = setTimeout(resolve, backoffMs);
          timer.unref(); // Prevent this timer from keeping the process alive
        });
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
      this.connection!.all('SELECT 1 as test', (err: DuckDBError, rows: DuckDBRow[]) => {
        const elapsed = Date.now() - startTime;
        
        if (err) {
          this.ready = false; // Mark connection as not ready
          logger.error(`Connection test failed after ${elapsed}ms: ${err.message}`);
          reject(new Error(`Connection test failed: ${err.message}`));
        } else if (!rows || rows.length === 0) {
          this.ready = false; // Mark connection as not ready
          logger.error(`Connection test failed after ${elapsed}ms: No rows returned`);
          reject(new Error('Connection test failed: No rows returned'));
        } else {
          // Test passed, connection is working
          if (elapsed > 100) {
            // If the test took a long time, log it as it might indicate performance issues
            logger.warn(`Connection test succeeded but took ${elapsed}ms`);
          }
          resolve();
        }
      });
      
      // Set a timeout to detect if the query is hanging (using 2500ms instead of 1000ms)
      const hangTimeout = setTimeout(() => {
        if (this.connection) {
          logger.warn(`Connection test query is taking too long (>2500ms), may be hung`);
        }
      }, 2500);
      
      // Critical: Prevent timeout from keeping the process alive
      hangTimeout.unref();
    });
  }

  async getTableInfo(schemaName: string, tableName: string): Promise<TableInfo> {
    try {
      // First check if the schema exists using direct string literals
      // This works better with information_schema queries in DuckDB
      const schemaQuery = `
        SELECT 1 
        FROM information_schema.schemata 
        WHERE schema_name = '${schemaName}'
        AND schema_name NOT IN ('information_schema')`;
      
      logger.debug(`Checking schema existence: ${schemaName}`);
      const schemaResult = await this.executeQuery(schemaQuery);
      
      if (schemaResult.length === 0) {
        logger.warn(`Schema not found: ${schemaName}`);
        throw new Error(`Schema not found: ${schemaName}`);
      }

      // Get columns info using direct string literals for information_schema
      const columnsQuery = `
        SELECT 
          column_name,
          data_type,
          '' as description -- duckdb doesn't support column comments
        FROM information_schema.columns
        WHERE table_schema = '${schemaName}' AND table_name = '${tableName}'
        ORDER BY ordinal_position`;
      
      logger.debug(`Fetching table info: ${schemaName}.${tableName}`);
      const columnResult = await this.executeQuery(columnsQuery);

      if (columnResult.length === 0) {
        logger.warn(`Table not found: ${tableName} in schema ${schemaName}`);
        throw new Error(`Table not found: ${tableName} in schema ${schemaName}`);
      }

      // Build the table info structure
      const tableInfo: TableInfo = {
        schema: schemaName,
        table: tableName,
        description: '',
        columns: columnResult.map(row => ({
          name: row.column_name,
          type: row.data_type,
          description: row.description || '',
        })),
      };
      
      logger.debug(`Retrieved ${tableInfo.columns.length} columns for ${schemaName}.${tableName}`);
      return tableInfo;
    } catch (error) {
      // Enhance error reporting
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error in getTableInfo: ${errorMessage}`);
      throw error; // Rethrow to allow proper error handling upstream
    }
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
        try {
          if (params && params.length > 0) {
            logger.debug(`Executing query with params: ${JSON.stringify(params)}`);
            this.connection!.all(sql, params, (err: DuckDBError, rows: DuckDBRow[]) => {
              if (err) {
                logger.error(`Error executing parameterized query: ${err.message}`);
                reject(err);
              } else {
                resolve(rows || []);
              }
            });
          } else {
            logger.debug(`Executing query without params`);
            this.connection!.all(sql, (err: DuckDBError, rows: DuckDBRow[]) => {
              if (err) reject(err);
              else resolve(rows || []);
            });
          }
        } catch (err) {
          logger.error(`Exception during query execution: ${err instanceof Error ? err.message : String(err)}`);
          reject(err);
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
        logger.error(`Query error, attempting retry. Error: ${errorMessage}`);
        
        // Force reconnection on next ensureConnection call
        this.ready = false;
        
        // Wait a moment before retrying to allow any transient issues to resolve
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Retry with one fewer retry attempt
        return this.executeQuery(sql, params, retries - 1);
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
      
      // Close any active connection
      if (this.connection) {
        try {
          logger.debug('Closing database connection');
          this.connection.close();
        } catch (err) {
          logger.warn(`Error closing connection: ${err instanceof Error ? err.message : String(err)}`);
        }
        this.connection = null;
      }
      
      // Close the database if it's open
      if (this.db) {
        try {
          logger.debug('Closing database');
          await new Promise<void>((resolve, reject) => {
            const closeTimeout = setTimeout(() => {
              logger.warn('Database close operation timed out after 1000ms');
              resolve(); // Resolve anyway to prevent hanging
            }, 1000);
            
            // Prevent the timeout from keeping the process alive
            closeTimeout.unref();
            
            this.db!.close((err: DuckDBError) => {
              clearTimeout(closeTimeout);
              if (err) {
                logger.warn(`Error in db.close callback: ${err.message}`);
                reject(err);
              } else {
                resolve();
              }
            });
          });
        } catch (err) {
          logger.warn(`Error during database close: ${err instanceof Error ? err.message : String(err)}`);
        }
        this.db = null;
      }
      
      // Reset state
      this.ready = false;
      logger.debug('Database service fully closed');
    } catch (error) {
      logger.error('Error in database close method:', error instanceof Error ? error.message : String(error));
    }
  }
}