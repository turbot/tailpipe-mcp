/**
 * Logger utility for Tailpipe MCP
 * 
 * Uses stderr for all output to avoid interfering with MCP protocol,
 * and supports suppressing logs during tests.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

interface LoggerOptions {
  level?: LogLevel;
  isTestEnvironment?: boolean;
}

class Logger {
  private options: Required<LoggerOptions>;
  private logs: string[] = []; // Store logs when in test mode

  constructor(options: LoggerOptions = {}) {
    const envLevel = (process.env.TAILPIPE_MCP_LOG_LEVEL || 'info').toLowerCase();
    this.options = {
      level: this.isValidLogLevel(envLevel) ? envLevel : 'info',
      isTestEnvironment: options.isTestEnvironment || false
    };
  }

  private isValidLogLevel(level: string): level is LogLevel {
    return ['debug', 'info', 'warn', 'error', 'silent'].includes(level);
  }

  /**
   * Determine if we're running in a test environment
   */
  private isRunningInTestEnv(): boolean {
    return process.env.NODE_ENV === 'test' || 
           process.env.JEST_WORKER_ID !== undefined;
  }

  /**
   * Get log level from environment variable
   */
  private getLogLevelFromEnv(): LogLevel {
    const envLevel = process.env.TAILPIPE_MCP_LOG_LEVEL?.toUpperCase();
    
    if (envLevel === 'DEBUG') return 'debug';
    if (envLevel === 'INFO') return 'info';
    if (envLevel === 'WARN') return 'warn';
    if (envLevel === 'ERROR') return 'error';
    if (envLevel === 'SILENT') return 'silent';
    
    // Default level
    return 'info';
  }

  /**
   * Configure the logger
   */
  configure(options: Partial<LoggerOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Debug level logging
   */
  debug(message: string, ...args: any[]): void {
    if (this.options.level === 'debug') {
      this.log('DEBUG', message, ...args);
    }
  }

  /**
   * Info level logging
   */
  info(message: string, ...args: any[]): void {
    if (this.options.level === 'info') {
      this.log('INFO', message, ...args);
    }
  }

  /**
   * Warning level logging
   */
  warn(message: string, ...args: any[]): void {
    if (this.options.level === 'warn') {
      this.log('WARN', message, ...args);
    }
  }

  /**
   * Error level logging
   */
  error(message: string, ...args: any[]): void {
    if (this.options.level === 'error') {
      this.log('ERROR', message, ...args);
    }
  }

  /**
   * Internal log function
   */
  private log(level: string, message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    let formattedMessage = `[${timestamp}] [${level}] ${message}`;
    
    // Format additional arguments if present
    if (args.length > 0) {
      const formattedArgs = args.map(arg => {
        if (arg instanceof Error) {
          return arg.message;
        } else if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch (e) {
            return String(arg);
          }
        }
        return String(arg);
      });
      
      formattedMessage += `: ${formattedArgs.join(' ')}`;
    }
    
    // In test environment, store logs instead of printing
    if (this.options.isTestEnvironment) {
      this.logs.push(formattedMessage);
    } else {
      // Always use stderr to avoid interfering with MCP protocol
      console.error(formattedMessage);
    }
  }

  /**
   * Get collected logs (useful for tests)
   */
  getCollectedLogs(): string[] {
    return [...this.logs];
  }

  /**
   * Clear collected logs
   */
  clearLogs(): void {
    this.logs = [];
  }
}

// Export singleton instance
export const logger = new Logger();