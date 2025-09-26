import { mockDeep } from 'jest-mock-extended';
import { ArchiveService } from '../ArchiveService';
import { IFileSystemService } from '../FileSystemService';
import unzipper from 'unzipper';
import { EventEmitter } from 'events';

// Mock unzipper
jest.mock('unzipper');
const mockUnzipper = unzipper as jest.Mocked<typeof unzipper>;

describe('ArchiveService', () => {
  let service: ArchiveService;
  let mockFileSystem: jest.Mocked<IFileSystemService>;

  beforeEach(() => {
    mockFileSystem = mockDeep<IFileSystemService>();
    service = new ArchiveService(mockFileSystem);
    jest.clearAllMocks();
  });

  describe('extractZip', () => {
    it('should extract zip file successfully', async () => {
      const zipPath = '/test/archive.zip';
      const extractPath = '/test/extracted';

      // Create mock stream objects
      const mockReadStream = new EventEmitter();
      const mockExtractStream = new EventEmitter();

      // Mock file system
      mockFileSystem.createReadStream.mockReturnValue(mockReadStream as any);

      // Mock unzipper.Extract
      mockUnzipper.Extract.mockReturnValue(mockExtractStream as any);

      // Mock pipe method
      (mockReadStream as any).pipe = jest.fn().mockReturnValue(mockExtractStream);

      const extractPromise = service.extractZip(zipPath, extractPath);

      // Simulate successful extraction
      setTimeout(() => {
        mockExtractStream.emit('close');
      }, 10);

      await expect(extractPromise).resolves.toBeUndefined();

      expect(mockFileSystem.createReadStream).toHaveBeenCalledWith(zipPath);
      expect(mockUnzipper.Extract).toHaveBeenCalledWith({ path: extractPath });
    });

    it('should handle extraction errors', async () => {
      const zipPath = '/test/corrupt.zip';
      const extractPath = '/test/extracted';
      const testError = new Error('Extraction failed');

      // Create mock stream objects
      const mockReadStream = new EventEmitter();
      const mockExtractStream = new EventEmitter();

      // Mock file system
      mockFileSystem.createReadStream.mockReturnValue(mockReadStream as any);

      // Mock unzipper.Extract
      mockUnzipper.Extract.mockReturnValue(mockExtractStream as any);

      // Mock pipe method
      (mockReadStream as any).pipe = jest.fn().mockReturnValue(mockExtractStream);

      const extractPromise = service.extractZip(zipPath, extractPath);

      // Simulate extraction error
      setTimeout(() => {
        mockExtractStream.emit('error', testError);
      }, 10);

      await expect(extractPromise).rejects.toThrow('Extraction failed');

      expect(mockFileSystem.createReadStream).toHaveBeenCalledWith(zipPath);
      expect(mockUnzipper.Extract).toHaveBeenCalledWith({ path: extractPath });
    });

    it('should call fileSystem.createReadStream with correct path', async () => {
      const zipPath = '/test/archive.zip';
      const extractPath = '/test/extracted';

      // Create mock stream objects
      const mockReadStream = new EventEmitter();
      const mockExtractStream = new EventEmitter();

      // Mock file system
      mockFileSystem.createReadStream.mockReturnValue(mockReadStream as any);
      mockUnzipper.Extract.mockReturnValue(mockExtractStream as any);
      (mockReadStream as any).pipe = jest.fn().mockReturnValue(mockExtractStream);

      const extractPromise = service.extractZip(zipPath, extractPath);

      // Complete the extraction
      setTimeout(() => {
        mockExtractStream.emit('close');
      }, 10);

      await extractPromise;

      expect(mockFileSystem.createReadStream).toHaveBeenCalledWith(zipPath);
    });

    it('should pass correct parameters to unzipper.Extract', async () => {
      const zipPath = '/custom/path/data.zip';
      const extractPath = '/custom/extract/location';

      // Create mock stream objects
      const mockReadStream = new EventEmitter();
      const mockExtractStream = new EventEmitter();

      // Mock file system
      mockFileSystem.createReadStream.mockReturnValue(mockReadStream as any);

      // Mock unzipper.Extract
      mockUnzipper.Extract.mockReturnValue(mockExtractStream as any);

      // Mock pipe method
      (mockReadStream as any).pipe = jest.fn().mockReturnValue(mockExtractStream);

      const extractPromise = service.extractZip(zipPath, extractPath);

      // Simulate successful extraction
      setTimeout(() => {
        mockExtractStream.emit('close');
      }, 10);

      await extractPromise;

      expect(mockUnzipper.Extract).toHaveBeenCalledWith({ path: extractPath });
      expect(mockFileSystem.createReadStream).toHaveBeenCalledWith(zipPath);
    });

    it('should create promise that resolves on close event', async () => {
      const zipPath = '/test/archive.zip';
      const extractPath = '/test/extracted';

      // Create mock stream objects
      const mockReadStream = new EventEmitter();
      const mockExtractStream = new EventEmitter();

      mockFileSystem.createReadStream.mockReturnValue(mockReadStream as any);
      mockUnzipper.Extract.mockReturnValue(mockExtractStream as any);
      (mockReadStream as any).pipe = jest.fn().mockReturnValue(mockExtractStream);

      const extractPromise = service.extractZip(zipPath, extractPath);

      // Promise should be pending initially
      let resolved = false;
      extractPromise.then(() => { resolved = true; }).catch(() => {});

      // Wait a bit to ensure promise doesn't resolve immediately
      await new Promise(resolve => setTimeout(resolve, 5));
      expect(resolved).toBe(false);

      // Trigger close event
      mockExtractStream.emit('close');

      // Now promise should resolve
      await extractPromise;
      expect(resolved).toBe(true);
    });
  });
});