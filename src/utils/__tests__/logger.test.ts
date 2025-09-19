
// Mock console methods
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

describe('Logger', () => {
  let mockConsoleLog: jest.MockedFunction<typeof console.log>;
  let mockConsoleWarn: jest.MockedFunction<typeof console.warn>;
  let mockConsoleError: jest.MockedFunction<typeof console.error>;

  beforeEach(() => {
    mockConsoleLog = jest.fn();
    mockConsoleWarn = jest.fn();
    mockConsoleError = jest.fn();

    console.log = mockConsoleLog;
    console.warn = mockConsoleWarn;
    console.error = mockConsoleError;

    // Reset all modules to force fresh logger instance
    jest.resetModules();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;

    delete process.env.LOG_LEVEL;
    jest.resetModules();
  });

  describe('log levels', () => {
    it('should respect LOG_LEVEL environment variable', async () => {
      process.env.LOG_LEVEL = 'WARN';

      const { logger: testLogger } = await import('../logger');

      testLogger.debug('debug message');
      testLogger.info('info message');
      testLogger.warn('warn message');
      testLogger.error('error message');

      expect(mockConsoleLog).not.toHaveBeenCalled();
      expect(mockConsoleWarn).toHaveBeenCalledTimes(1);
      expect(mockConsoleError).toHaveBeenCalledTimes(1);
    });

    it('should default to INFO level when no LOG_LEVEL is set', async () => {
      delete process.env.LOG_LEVEL;

      const { logger: testLogger } = await import('../logger');

      testLogger.debug('debug message');
      testLogger.info('info message');
      testLogger.warn('warn message');
      testLogger.error('error message');

      expect(mockConsoleLog).toHaveBeenCalledTimes(1); // info only
      expect(mockConsoleWarn).toHaveBeenCalledTimes(1);
      expect(mockConsoleError).toHaveBeenCalledTimes(1);
    });
  });

  describe('log formatting', () => {
    it('should format log messages with timestamp and level', async () => {
      const { logger: testLogger } = await import('../logger');
      testLogger.info('test message');

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringMatching(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] INFO: test message$/)
      );
    });

    it('should include metadata when provided', async () => {
      const { logger: testLogger } = await import('../logger');
      const metadata = { userId: '123', action: 'login' };
      testLogger.info('user action', metadata);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringMatching(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] INFO: user action {"userId":"123","action":"login"}$/)
      );
    });

    it('should handle complex metadata objects', async () => {
      const { logger: testLogger } = await import('../logger');
      const metadata = {
        nested: { key: 'value' },
        array: [1, 2, 3],
        null: null,
        undefined: undefined
      };
      testLogger.error('complex data', metadata);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('complex data')
      );
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('"nested":{"key":"value"}')
      );
    });
  });

  describe('debug', () => {
    it('should log debug messages when level is DEBUG', async () => {
      process.env.LOG_LEVEL = 'DEBUG';

      const { logger: testLogger } = await import('../logger');

      testLogger.debug('debug message');

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG: debug message')
      );
    });

    it('should not log debug messages when level is INFO or higher', async () => {
      const { logger: testLogger } = await import('../logger');
      testLogger.debug('debug message');

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });
  });

  describe('info', () => {
    it('should log info messages', async () => {
      const { logger: testLogger } = await import('../logger');
      testLogger.info('info message');

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('INFO: info message')
      );
    });
  });

  describe('warn', () => {
    it('should log warning messages', async () => {
      const { logger: testLogger } = await import('../logger');
      testLogger.warn('warning message');

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('WARN: warning message')
      );
    });
  });

  describe('error', () => {
    it('should log error messages', async () => {
      const { logger: testLogger } = await import('../logger');
      testLogger.error('error message');

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('ERROR: error message')
      );
    });

    it('should log error messages with error objects', async () => {
      const { logger: testLogger } = await import('../logger');
      const error = new Error('test error');
      testLogger.error('operation failed', { error });

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('operation failed')
      );
    });
  });
});