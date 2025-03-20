import { Logger, LogLevel } from '../../src/services/logger.js';

describe('Logger', () => {
  let logger: Logger;
  
  beforeEach(() => {
    logger = new Logger({
      level: LogLevel.DEBUG,
      isTestEnvironment: true
    });
  });
  
  afterEach(() => {
    // Clear logs after each test
    logger.clearLogs();
  });
  
  test('logs debug messages when level is debug', () => {
    const message = 'Test debug message';
    logger.debug(message);
    
    const logs = logger.getCollectedLogs();
    expect(logs.length).toBe(1);
    expect(logs[0]).toContain('[DEBUG]');
    expect(logs[0]).toContain(message);
  });
  
  test('does not log debug messages when level is info', () => {
    logger = new Logger({
      level: LogLevel.INFO,
      isTestEnvironment: true
    });
    const message = 'Test debug message';
    logger.debug(message);
    
    const logs = logger.getCollectedLogs();
    expect(logs.length).toBe(0);
  });
  
  test('logs info messages when level is info', () => {
    logger = new Logger({
      level: LogLevel.INFO,
      isTestEnvironment: true
    });
    const message = 'Test info message';
    logger.info(message);
    
    const logs = logger.getCollectedLogs();
    expect(logs.length).toBe(1);
    expect(logs[0]).toContain('[INFO]');
    expect(logs[0]).toContain(message);
  });
  
  test('logs warning messages when level is warn', () => {
    logger.configure({ level: LogLevel.WARN });
    const message = 'Test warning message';
    logger.warn(message);
    
    const logs = logger.getCollectedLogs();
    expect(logs.length).toBe(1);
    expect(logs[0]).toContain('[WARN]');
    expect(logs[0]).toContain(message);
  });
  
  test('logs error messages when level is error', () => {
    logger = new Logger({
      level: LogLevel.ERROR,
      isTestEnvironment: true
    });
    const message = 'Test error message';
    logger.error(message);
    
    const logs = logger.getCollectedLogs();
    expect(logs.length).toBe(1);
    expect(logs[0]).toContain('[ERROR]');
    expect(logs[0]).toContain(message);
  });
  
  test('does not log when level is silent', () => {
    logger.configure({ level: LogLevel.SILENT });
    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warning message');
    logger.error('Error message');
    
    const logs = logger.getCollectedLogs();
    expect(logs.length).toBe(0);
  });
  
  test('formats additional arguments correctly', () => {
    const message = 'Test message with args:';
    logger.info(message, 123, { key: 'value' });
    
    const logs = logger.getCollectedLogs();
    expect(logs.length).toBe(1);
    expect(logs[0]).toContain(message);
    expect(logs[0]).toContain('123');
    expect(logs[0]).toContain('{"key":"value"}');
  });
  
  test('clears logs correctly', () => {
    logger.debug('First message');
    logger.info('Second message');
    expect(logger.getCollectedLogs().length).toBe(2);
    
    logger.clearLogs();
    expect(logger.getCollectedLogs().length).toBe(0);
  });
});