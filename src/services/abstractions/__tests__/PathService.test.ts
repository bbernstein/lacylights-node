import path from 'path';
import { PathService } from '../PathService';

// Mock path module
jest.mock('path');
const mockPath = path as jest.Mocked<typeof path>;

describe('PathService', () => {
  let service: PathService;

  beforeEach(() => {
    service = new PathService();
    jest.clearAllMocks();
  });

  describe('join', () => {
    it('should join paths using path.join', () => {
      const paths = ['folder', 'subfolder', 'file.txt'];
      const expectedResult = 'folder/subfolder/file.txt';

      mockPath.join.mockReturnValue(expectedResult);

      const result = service.join(...paths);

      expect(result).toBe(expectedResult);
      expect(mockPath.join).toHaveBeenCalledWith(...paths);
    });

    it('should handle single path', () => {
      const singlePath = 'single-file.txt';
      mockPath.join.mockReturnValue(singlePath);

      const result = service.join(singlePath);

      expect(result).toBe(singlePath);
      expect(mockPath.join).toHaveBeenCalledWith(singlePath);
    });

    it('should handle empty paths', () => {
      const expectedResult = '.';
      mockPath.join.mockReturnValue(expectedResult);

      const result = service.join();

      expect(result).toBe(expectedResult);
      expect(mockPath.join).toHaveBeenCalledWith();
    });
  });

  describe('resolve', () => {
    it('should resolve paths using path.resolve', () => {
      const paths = ['relative', 'path', 'file.txt'];
      const expectedResult = '/absolute/path/relative/path/file.txt';

      mockPath.resolve.mockReturnValue(expectedResult);

      const result = service.resolve(...paths);

      expect(result).toBe(expectedResult);
      expect(mockPath.resolve).toHaveBeenCalledWith(...paths);
    });

    it('should handle absolute path', () => {
      const absolutePath = '/absolute/path/file.txt';
      mockPath.resolve.mockReturnValue(absolutePath);

      const result = service.resolve(absolutePath);

      expect(result).toBe(absolutePath);
      expect(mockPath.resolve).toHaveBeenCalledWith(absolutePath);
    });
  });

  describe('dirname', () => {
    it('should return directory name using path.dirname', () => {
      const filePath = '/path/to/file.txt';
      const expectedResult = '/path/to';

      mockPath.dirname.mockReturnValue(expectedResult);

      const result = service.dirname(filePath);

      expect(result).toBe(expectedResult);
      expect(mockPath.dirname).toHaveBeenCalledWith(filePath);
    });

    it('should handle root directory', () => {
      const filePath = '/file.txt';
      const expectedResult = '/';

      mockPath.dirname.mockReturnValue(expectedResult);

      const result = service.dirname(filePath);

      expect(result).toBe(expectedResult);
      expect(mockPath.dirname).toHaveBeenCalledWith(filePath);
    });
  });

  describe('basename', () => {
    it('should return basename without extension', () => {
      const filePath = '/path/to/file.txt';
      const expectedResult = 'file.txt';

      mockPath.basename.mockReturnValue(expectedResult);

      const result = service.basename(filePath);

      expect(result).toBe(expectedResult);
      expect(mockPath.basename).toHaveBeenCalledWith(filePath, undefined);
    });

    it('should return basename with extension removed', () => {
      const filePath = '/path/to/file.txt';
      const ext = '.txt';
      const expectedResult = 'file';

      mockPath.basename.mockReturnValue(expectedResult);

      const result = service.basename(filePath, ext);

      expect(result).toBe(expectedResult);
      expect(mockPath.basename).toHaveBeenCalledWith(filePath, ext);
    });

    it('should handle path without extension', () => {
      const filePath = '/path/to/folder';
      const expectedResult = 'folder';

      mockPath.basename.mockReturnValue(expectedResult);

      const result = service.basename(filePath);

      expect(result).toBe(expectedResult);
      expect(mockPath.basename).toHaveBeenCalledWith(filePath, undefined);
    });
  });

  describe('extname', () => {
    it('should return file extension using path.extname', () => {
      const filePath = '/path/to/file.txt';
      const expectedResult = '.txt';

      mockPath.extname.mockReturnValue(expectedResult);

      const result = service.extname(filePath);

      expect(result).toBe(expectedResult);
      expect(mockPath.extname).toHaveBeenCalledWith(filePath);
    });

    it('should return empty string for file without extension', () => {
      const filePath = '/path/to/file';
      const expectedResult = '';

      mockPath.extname.mockReturnValue(expectedResult);

      const result = service.extname(filePath);

      expect(result).toBe(expectedResult);
      expect(mockPath.extname).toHaveBeenCalledWith(filePath);
    });

    it('should handle dotfiles', () => {
      const filePath = '/path/to/.gitignore';
      const expectedResult = '';

      mockPath.extname.mockReturnValue(expectedResult);

      const result = service.extname(filePath);

      expect(result).toBe(expectedResult);
      expect(mockPath.extname).toHaveBeenCalledWith(filePath);
    });
  });
});