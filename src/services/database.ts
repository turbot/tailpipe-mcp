import { execSync } from "child_process";
import { resolve } from "path";
import { existsSync } from "fs";
import { logger } from "./logger.js";
import duckdb from 'duckdb';
import { executeCommand } from "../utils/command.js";
import { buildTailpipeCommand, getTailpipeEnv } from "../utils/tailpipe.js";

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
    
    // Debug Tailpipe CLI environment if needed
    logger.debug('PATH environment variable:', process.env.PATH);
    logger.debug('Which tailpipe:', executeCommand('which tailpipe || echo "not found"', { env: getTailpipeEnv() }));
    
    const cmd = buildTailpipeCommand('connect', { output: 'json' });
    const output = executeCommand(cmd, { env: getTailpipeEnv() });
    
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
  private db: duckdb.Database | null = null;
  private connection: duckdb.Connection | null = null;
  
  constructor(private databasePath: string, public readonly sourceType: string = 'cli-arg') {
    this.connect();
  }

  // Allow changing the database path for reconnection
  setDatabasePath(path: string, newSourceType: string): void {
    this.databasePath = path;
    (this as any).sourceType = newSourceType; // Hack to allow changing readonly property
    this.connect();
  }

  private connect(): void {
    try {
      // Clean up any existing connections
      if (this.connection) {
        this.connection.close();
      }
      if (this.db) {
        this.db.close(() => {});
      }
      
      logger.debug(`Connecting to database: ${this.databasePath}`);
      this.db = new duckdb.Database(this.databasePath, { access_mode: 'READ_ONLY' });
      this.connection = this.db.connect();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to connect to database: ${message}`);
      throw error;
    }
  }

  async executeQuery(sql: string, params: any[] = []): Promise<any[]> {
    if (!this.connection) {
      this.connect();
    }
    
    return new Promise((resolve, reject) => {
      const queryFn = params.length > 0 ? 
        (callback: any) => this.connection!.all(sql, params, callback) :
        (callback: any) => this.connection!.all(sql, callback);
        
      queryFn((err: Error | null, rows: any[]) => {
        if (err) {
          logger.error(`Query error: ${err.message}`);
          
          // If connection error, try to reconnect once
          if (err.message.includes('connection') || err.message.includes('database')) {
            logger.info('Connection error detected, attempting to reconnect...');
            this.connect();
            queryFn((retryErr: Error | null, retryRows: any[]) => {
              if (retryErr) {
                logger.error(`Query retry failed: ${retryErr.message}`);
                reject(retryErr);
              } else {
                resolve(retryRows || []);
              }
            });
          } else {
            reject(err);
          }
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  async close(): Promise<void> {
    try {
      if (this.connection) {
        logger.debug('Closing database connection');
        this.connection.close();
        this.connection = null;
      }
      
      if (this.db) {
        logger.debug('Closing database');
        await new Promise<void>((resolve) => this.db!.close(() => resolve()));
        this.db = null;
      }
    } catch (error) {
      logger.error(`Error closing database: ${error instanceof Error ? error.message : String(error)}`);
      // Don't throw - we're cleaning up anyway
    }
  }
}