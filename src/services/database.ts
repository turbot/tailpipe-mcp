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

export type DatabaseSourceType = 'cli-arg' | 'tailpipe';

export interface DatabaseConfig {
  path: string;
  sourceType: DatabaseSourceType;
}

export interface DatabasePathInfo {
  path: string;
  source: string;
  sourceType: DatabaseSourceType;
}

export class DatabaseService {
  private db: duckdb.Database | null = null;
  private connection: duckdb.Connection | null = null;
  private config: DatabaseConfig;
  private isConnecting: boolean = false;

  private constructor(config: DatabaseConfig) {
    this.config = config;
  }

  get databasePath(): string {
    return this.config.path;
  }

  get sourceType(): DatabaseSourceType {
    return this.config.sourceType;
  }

  /**
   * Create a new DatabaseService instance and initialize the connection
   */
  static async create(providedPath?: string): Promise<DatabaseService> {
    const pathInfo = await DatabaseService.resolveDatabasePath(providedPath);
    logger.info(`Database path resolved to: ${pathInfo.path}`);
    logger.info(`Database path source type: ${pathInfo.sourceType}`);

    const service = new DatabaseService({
      path: pathInfo.path,
      sourceType: pathInfo.sourceType
    });

    await service.initialize();
    await service.testConnection();

    return service;
  }

  /**
   * Get database path from various sources in order of precedence:
   * 1. Provided path argument
   * 2. Environment variable TAILPIPE_MCP_DATABASE_PATH
   * 3. Command line argument
   * 4. Tailpipe CLI
   */
  private static async resolveDatabasePath(providedPath?: string): Promise<DatabasePathInfo> {
    // Check explicit path argument
    const pathToUse = providedPath || process.env.TAILPIPE_MCP_DATABASE_PATH || (process.argv.length > 2 ? process.argv[2] : undefined);
    
    if (pathToUse) {
      const source = providedPath ? 'provided argument' :
                    process.env.TAILPIPE_MCP_DATABASE_PATH ? 'environment variable' :
                    'command line argument';
      
      logger.info(`Database path provided via ${source}: ${pathToUse}`);
      const resolvedPath = resolve(pathToUse);
      logger.info(`Resolved database path to: ${resolvedPath}`);
      
      if (!existsSync(resolvedPath)) {
        throw new Error(`Database file does not exist: ${resolvedPath}`);
      }
      
      return {
        path: resolvedPath,
        source,
        sourceType: 'cli-arg'
      };
    }

    // Fall back to Tailpipe CLI
    try {
      logger.info('No database path provided, attempting to use Tailpipe CLI...');
      
      // Debug Tailpipe CLI environment if needed
      logger.debug('PATH environment variable:', process.env.PATH);
      logger.debug('Which tailpipe:', executeCommand('which tailpipe || echo "not found"', { env: getTailpipeEnv() }));
      
      const cmd = buildTailpipeCommand('connect', { output: 'json' });
      const output = executeCommand(cmd, { env: getTailpipeEnv() });
      
      const result = JSON.parse(output);
      
      if (!result?.database_filepath) {
        logger.error('Tailpipe connect output JSON:', JSON.stringify(result));
        throw new Error('Tailpipe connect output missing database_filepath field');
      }
      
      const path = resolve(result.database_filepath);
      logger.info(`Using Tailpipe database path: ${path}`);
      
      if (!existsSync(path)) {
        throw new Error(`Tailpipe database file does not exist: ${path}`);
      }
      
      return {
        path,
        source: 'tailpipe CLI connection',
        sourceType: 'tailpipe'
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to get database path from Tailpipe CLI:', message);
      throw new Error('Failed to get database path. Please install Tailpipe CLI or provide a database path directly.');
    }
  }

  /**
   * Initialize the database connection
   */
  async initialize(): Promise<void> {
    if (this.isConnecting) {
      throw new Error('Database connection already in progress');
    }
    
    try {
      this.isConnecting = true;
      await this.connect();
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Test the database connection with a simple query
   */
  async testConnection(): Promise<void> {
    try {
      logger.info("Testing database connection...");
      await this.executeQuery("SELECT 1 as test");
      logger.info("Database connection verified successfully");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Database connection test failed:", message);
      throw error;
    }
  }

  async setDatabaseConfig(newConfig: Partial<DatabaseConfig>): Promise<void> {
    this.config = {
      ...this.config,
      ...newConfig
    };
    await this.initialize();
    await this.testConnection();
  }

  private async connect(): Promise<void> {
    // Clean up any existing connections
    await this.close();
      
    try {
      logger.debug(`Connecting to database: ${this.config.path}`);
      this.db = new duckdb.Database(this.config.path, { access_mode: 'READ_ONLY' });
      this.connection = this.db.connect();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to connect to database: ${message}`);
      throw error;
    }
  }

  async executeQuery(sql: string, params: any[] = []): Promise<any[]> {
    if (!this.connection) {
      await this.initialize();
    }
    
    return this.runQuery(sql, params);
  }

  private async runQuery(sql: string, params: any[]): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const queryFn = params.length > 0 ? 
        (callback: any) => this.connection!.all(sql, params, callback) :
        (callback: any) => this.connection!.all(sql, callback);
        
      queryFn((err: DuckDBError, rows: DuckDBRow[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  async close(): Promise<void> {
    const errors: Error[] = [];
    
    try {
      if (this.connection) {
        logger.debug('Closing database connection');
        this.connection.close();
        this.connection = null;
      }
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
    
    try {
      if (this.db) {
        logger.debug('Closing database');
        await new Promise<void>((resolve) => this.db!.close(() => resolve()));
        this.db = null;
      }
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
    
    if (errors.length > 0) {
      logger.error('Errors occurred while closing database:', errors);
      throw new AggregateError(errors, 'Failed to close database cleanly');
    }
  }
}