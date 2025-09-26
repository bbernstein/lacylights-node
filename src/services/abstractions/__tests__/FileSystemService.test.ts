import mockFs from 'mock-fs';
import fs from 'fs';
import { FileSystemService } from '../FileSystemService';

describe('FileSystemService', () => {
  let service: FileSystemService;

  beforeEach(() => {
    service = new FileSystemService();
  });

  afterEach(() => {
    mockFs.restore();
  });

  describe('existsSync', () => {
    it('should return true when file exists', () => {
      mockFs({
        '/test/file.txt': 'content'
      });

      expect(service.existsSync('/test/file.txt')).toBe(true);
    });

    it('should return false when file does not exist', () => {
      mockFs({});

      expect(service.existsSync('/nonexistent/file.txt')).toBe(false);
    });

    it('should return true when directory exists', () => {
      mockFs({
        '/test/dir': {}
      });

      expect(service.existsSync('/test/dir')).toBe(true);
    });
  });

  describe('mkdirSync', () => {
    it('should create directory', () => {
      mockFs({
        '/test': {}
      });

      service.mkdirSync('/test/newdir');

      expect(service.existsSync('/test/newdir')).toBe(true);
    });

    it('should create directory recursively', () => {
      mockFs({});

      service.mkdirSync('/test/nested/deep/dir', { recursive: true });

      expect(service.existsSync('/test/nested/deep/dir')).toBe(true);
    });

    it('should throw error when parent directory does not exist and recursive is false', () => {
      mockFs({});

      expect(() => {
        service.mkdirSync('/nonexistent/newdir');
      }).toThrow();
    });
  });

  describe('readFileSync', () => {
    it('should read file content with default encoding', () => {
      mockFs({
        '/test/file.txt': 'Hello, World!'
      });

      const content = service.readFileSync('/test/file.txt');

      expect(content).toBe('Hello, World!');
    });

    it('should read file content with specified encoding', () => {
      mockFs({
        '/test/file.txt': 'Hello, World!'
      });

      const content = service.readFileSync('/test/file.txt', 'utf8');

      expect(content).toBe('Hello, World!');
    });

    it('should throw error when file does not exist', () => {
      mockFs({});

      expect(() => {
        service.readFileSync('/nonexistent/file.txt');
      }).toThrow();
    });
  });

  describe('writeFileSync', () => {
    it('should write file content with default encoding', () => {
      mockFs({
        '/test': {}
      });

      service.writeFileSync('/test/file.txt', 'Hello, World!');

      expect(service.readFileSync('/test/file.txt')).toBe('Hello, World!');
    });

    it('should write file content with specified encoding', () => {
      mockFs({
        '/test': {}
      });

      service.writeFileSync('/test/file.txt', 'Hello, World!', 'utf8');

      expect(service.readFileSync('/test/file.txt')).toBe('Hello, World!');
    });

    it('should overwrite existing file', () => {
      mockFs({
        '/test/file.txt': 'Old content'
      });

      service.writeFileSync('/test/file.txt', 'New content');

      expect(service.readFileSync('/test/file.txt')).toBe('New content');
    });
  });

  describe('readdirSync', () => {
    it('should list directory contents', () => {
      mockFs({
        '/test': {
          'file1.txt': 'content1',
          'file2.txt': 'content2',
          'subdir': {}
        }
      });

      const contents = service.readdirSync('/test');

      expect(contents).toEqual(expect.arrayContaining(['file1.txt', 'file2.txt', 'subdir']));
      expect(contents).toHaveLength(3);
    });

    it('should return empty array for empty directory', () => {
      mockFs({
        '/test': {}
      });

      const contents = service.readdirSync('/test');

      expect(contents).toEqual([]);
    });

    it('should throw error when directory does not exist', () => {
      mockFs({});

      expect(() => {
        service.readdirSync('/nonexistent');
      }).toThrow();
    });
  });

  describe('statSync', () => {
    it('should return stats for file', () => {
      mockFs({
        '/test/file.txt': mockFs.file({
          content: 'Hello',
          mtime: new Date('2023-01-01'),
          mode: 0o644
        })
      });

      const stats = service.statSync('/test/file.txt');

      expect(stats.isFile()).toBe(true);
      expect(stats.isDirectory()).toBe(false);
      expect(stats.size).toBe(5);
    });

    it('should return stats for directory', () => {
      mockFs({
        '/test/dir': mockFs.directory({
          mtime: new Date('2023-01-01'),
          mode: 0o755
        })
      });

      const stats = service.statSync('/test/dir');

      expect(stats.isFile()).toBe(false);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should throw error when path does not exist', () => {
      mockFs({});

      expect(() => {
        service.statSync('/nonexistent');
      }).toThrow();
    });
  });

  describe('unlinkSync', () => {
    it('should delete file', () => {
      mockFs({
        '/test/file.txt': 'content'
      });

      expect(service.existsSync('/test/file.txt')).toBe(true);

      service.unlinkSync('/test/file.txt');

      expect(service.existsSync('/test/file.txt')).toBe(false);
    });

    it('should throw error when file does not exist', () => {
      mockFs({});

      expect(() => {
        service.unlinkSync('/nonexistent/file.txt');
      }).toThrow();
    });
  });

  describe('createWriteStream', () => {
    it('should create write stream', () => {
      mockFs({
        '/test': {}
      });

      const stream = service.createWriteStream('/test/file.txt');

      expect(stream).toBeInstanceOf(fs.WriteStream);
      expect(stream.path).toBe('/test/file.txt');
    });

    it('should allow writing to stream', (done) => {
      mockFs({
        '/test': {}
      });

      const stream = service.createWriteStream('/test/file.txt');

      stream.write('Hello, ');
      stream.write('World!');
      stream.end();

      stream.on('finish', () => {
        expect(service.readFileSync('/test/file.txt')).toBe('Hello, World!');
        done();
      });
    });
  });

  describe('createReadStream', () => {
    it('should create read stream', () => {
      mockFs({
        '/test/file.txt': 'content'
      });

      const stream = service.createReadStream('/test/file.txt');

      expect(stream).toBeInstanceOf(fs.ReadStream);
      expect(stream.path).toBe('/test/file.txt');
    });

    it('should allow reading from stream', (done) => {
      mockFs({
        '/test/file.txt': 'Hello, World!'
      });

      const stream = service.createReadStream('/test/file.txt');
      let data = '';

      stream.on('data', (chunk) => {
        data += chunk;
      });

      stream.on('end', () => {
        expect(data).toBe('Hello, World!');
        done();
      });
    });
  });
});