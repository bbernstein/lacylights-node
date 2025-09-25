import https from 'https';
import { IncomingMessage, ClientRequest } from 'http';
import { HttpService } from '../HttpService';
import { EventEmitter } from 'events';

// Mock https module
jest.mock('https');
const mockHttps = https as jest.Mocked<typeof https>;

describe('HttpService', () => {
  let service: HttpService;

  beforeEach(() => {
    service = new HttpService();
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('should make successful GET request and return request object', () => {
      const testUrl = 'https://api.example.com/data';
      const mockRequest = new EventEmitter() as ClientRequest;
      const mockResponse = new EventEmitter() as IncomingMessage;

      // Setup mock
      mockHttps.get.mockImplementation((url, callback) => {
        // Call the callback with mock response immediately
        if (callback && typeof callback === 'function') {
          (callback as any)(mockResponse);
        }
        return mockRequest;
      });

      const responseCallback = jest.fn();
      const request = service.get(testUrl, responseCallback);

      // Verify https.get was called with correct arguments
      expect(mockHttps.get).toHaveBeenCalledWith(testUrl, responseCallback);

      // Verify returned request object
      expect(request).toBe(mockRequest);
      expect(request.on).toBeDefined();
      expect(typeof request.on).toBe('function');
    });

    it('should pass callback to https.get', () => {
      const testUrl = 'https://api.example.com/data';
      const mockRequest = new EventEmitter() as ClientRequest;
      const responseCallback = jest.fn();

      mockHttps.get.mockReturnValue(mockRequest);

      service.get(testUrl, responseCallback);

      expect(mockHttps.get).toHaveBeenCalledWith(testUrl, responseCallback);
    });

    it('should return request object that supports error listening', () => {
      const testUrl = 'https://api.example.com/data';
      const mockRequest = new EventEmitter() as ClientRequest;

      mockHttps.get.mockReturnValue(mockRequest);

      const request = service.get(testUrl, jest.fn());

      // Verify we can listen for errors
      const errorHandler = jest.fn();
      const result = request.on('error', errorHandler);

      expect(result).toBe(request); // Should return 'this' for chaining

      // Simulate an error
      const testError = new Error('Network error');
      mockRequest.emit('error', testError);

      expect(errorHandler).toHaveBeenCalledWith(testError);
    });

    it('should handle different URLs', () => {
      const urls = [
        'https://api1.example.com/data',
        'https://api2.example.com/users',
        'https://secure.example.com/auth'
      ];

      urls.forEach(url => {
        const mockRequest = new EventEmitter() as ClientRequest;
        mockHttps.get.mockReturnValue(mockRequest);

        const callback = jest.fn();
        service.get(url, callback);

        expect(mockHttps.get).toHaveBeenCalledWith(url, callback);
      });

      expect(mockHttps.get).toHaveBeenCalledTimes(3);
    });

    it('should work with response that has data events', (done) => {
      const testUrl = 'https://api.example.com/data';
      const mockRequest = new EventEmitter() as ClientRequest;
      const mockResponse = new EventEmitter() as IncomingMessage;

      // Add statusCode to mock response
      (mockResponse as any).statusCode = 200;
      (mockResponse as any).headers = { 'content-type': 'application/json' };

      mockHttps.get.mockImplementation((url, callback) => {
        if (callback && typeof callback === 'function') {
          // Simulate async response
          setTimeout(() => {
            (callback as any)(mockResponse);
          }, 10);
        }
        return mockRequest;
      });

      service.get(testUrl, (response) => {
        expect(response).toBe(mockResponse);
        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toBe('application/json');

        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          expect(data).toBe('{"message":"test"}');
          done();
        });
      });

      // Simulate response data
      setTimeout(() => {
        mockResponse.emit('data', '{"message":');
        mockResponse.emit('data', '"test"}');
        mockResponse.emit('end');
      }, 20);
    });
  });
});