import { logger, LogLevel } from '../../src/services/logger.js';
import { jest } from '@jest/globals';

describe('Logger', () => {
  beforeEach(() => {
    // Reset logger state before each test
    logger.clearLogs();
    
    // Configure logger for test mode
    logger.configure({
      level: LogLevel.DEBUG,
      isTestEnvironment: true
    });
    
    // Spy on console.error to make sure it's not called
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  it('should collect logs in test mode without writing to console', () => {
    // Log messages at different levels
    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warning message');
    logger.error('Error message');
    
    // Check that logs were collected
    const logs = logger.getCollectedLogs();
    expect(logs.length).toBe(4);
    expect(logs[0]).toMatch(/\[DEBUG\] Debug message/);
    expect(logs[1]).toMatch(/\[INFO\] Info message/);
    expect(logs[2]).toMatch(/\[WARN\] Warning message/);
    expect(logs[3]).toMatch(/\[ERROR\] Error message/);
    
    // Verify console.error was not called
    expect(console.error).not.toHaveBeenCalled();
  });
  
  it('should respect log level configuration', () => {
    // Set log level to WARN
    logger.configure({ level: LogLevel.WARN });
    
    // Log messages at different levels
    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warning message');
    logger.error('Error message');
    
    // Check that only WARN and ERROR logs were collected
    const logs = logger.getCollectedLogs();
    expect(logs.length).toBe(2);
    expect(logs[0]).toMatch(/\[WARN\] Warning message/);
    expect(logs[1]).toMatch(/\[ERROR\] Error message/);
  });
  
  it('should format complex objects and errors correctly', () => {
    const testObject = { foo: 'bar', num: 42 };
    const testError = new Error('Test error');
    
    logger.info('Object test', testObject);
    logger.error('Error test', testError);
    
    const logs = logger.getCollectedLogs();
    expect(logs[0]).toMatch(/\[INFO\] Object test: {"foo":"bar","num":42}/);
    expect(logs[1]).toMatch(/\[ERROR\] Error test: Test error/);
  });
});