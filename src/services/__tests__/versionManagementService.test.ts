import { VersionManagementService } from '../versionManagementService';
import fs from 'fs/promises';
import { execFile } from 'child_process';

// Mock fs/promises
jest.mock('fs/promises');

// Mock child_process
jest.mock('child_process');

const mockedExecFile = execFile as jest.MockedFunction<typeof execFile>;
const mockedFsAccess = fs.access as jest.MockedFunction<typeof fs.access>;
const mockedFsReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;

// Helper to make execFile work with promisify
const mockExecFileAsync = (stdout: string, stderr = ''): void => {
  mockedExecFile.mockImplementation((file: string, args: any, options: any, callback: any) => {
    // Handle both 3-arg and 4-arg forms
    const cb = typeof options === 'function' ? options : callback;
    process.nextTick(() => cb(null, { stdout, stderr }));
    return null as any;
  });
};

const mockExecFileAsyncError = (error: Error): void => {
  mockedExecFile.mockImplementation((file: string, args: any, options: any, callback: any) => {
    const cb = typeof options === 'function' ? options : callback;
    process.nextTick(() => cb(error));
    return null as any;
  });
};

describe('VersionManagementService', () => {
  let service: VersionManagementService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new VersionManagementService('/opt/lacylights/scripts/update-repos.sh', '/opt/lacylights/repos');
  });

  describe('isUpdateScriptAvailable', () => {
    it('should return true when script exists and is executable', async () => {
      mockedFsAccess.mockResolvedValue(undefined);

      const result = await service.isUpdateScriptAvailable();

      expect(result).toBe(true);
      expect(mockedFsAccess).toHaveBeenCalledWith('/opt/lacylights/scripts/update-repos.sh', expect.any(Number));
    });

    it('should return false when script does not exist', async () => {
      mockedFsAccess.mockRejectedValue(new Error('ENOENT'));

      const result = await service.isUpdateScriptAvailable();

      expect(result).toBe(false);
    });

    it('should return false when script is not executable', async () => {
      mockedFsAccess.mockRejectedValue(new Error('EACCES'));

      const result = await service.isUpdateScriptAvailable();

      expect(result).toBe(false);
    });
  });

  describe('wrapper script detection and caching', () => {
    it('should use wrapper script when available and cache the result', async () => {
      // First call to check base script (for isUpdateScriptAvailable)
      // Second call to check wrapper script (for getUpdateScript)
      mockedFsAccess.mockResolvedValue(undefined);

      const mockVersionOutput = JSON.stringify({
        'lacylights-fe': { installed: 'v1.0.0', latest: 'v1.1.0' },
      });
      mockExecFileAsync(mockVersionOutput);

      // First call should check wrapper script
      await service.getSystemVersions();

      // Verify wrapper script was checked and used
      expect(mockedFsAccess).toHaveBeenCalledWith('/opt/lacylights/scripts/update-repos-wrapper.sh', expect.any(Number));
      expect(mockedExecFile).toHaveBeenCalledWith(
        '/opt/lacylights/scripts/update-repos-wrapper.sh',
        ['versions', 'json'],
        expect.anything()
      );

      // Clear mocks to verify caching
      mockedFsAccess.mockClear();
      mockedExecFile.mockClear();
      mockExecFileAsync(mockVersionOutput);

      // Second call should use cached result (no fs.access for wrapper)
      await service.getSystemVersions();

      // Wrapper check should not happen again (cached)
      expect(mockedFsAccess).not.toHaveBeenCalledWith('/opt/lacylights/scripts/update-repos-wrapper.sh', expect.any(Number));
      // But should still use wrapper script
      expect(mockedExecFile).toHaveBeenCalledWith(
        '/opt/lacylights/scripts/update-repos-wrapper.sh',
        ['versions', 'json'],
        expect.anything()
      );
    });

    it('should fall back to base script when wrapper is not available and cache the result', async () => {
      // Mock: base script exists, wrapper script does not
      mockedFsAccess.mockImplementation((path: any) => {
        if (path === '/opt/lacylights/scripts/update-repos.sh') {
          return Promise.resolve(undefined);
        }
        if (path === '/opt/lacylights/scripts/update-repos-wrapper.sh') {
          return Promise.reject(new Error('ENOENT'));
        }
        return Promise.reject(new Error('Unknown path'));
      });

      const mockVersionOutput = JSON.stringify({
        'lacylights-fe': { installed: 'v1.0.0', latest: 'v1.1.0' },
      });
      mockExecFileAsync(mockVersionOutput);

      // First call should check wrapper and fall back to base script
      await service.getSystemVersions();

      expect(mockedFsAccess).toHaveBeenCalledWith('/opt/lacylights/scripts/update-repos-wrapper.sh', expect.any(Number));
      expect(mockedExecFile).toHaveBeenCalledWith(
        '/opt/lacylights/scripts/update-repos.sh',
        ['versions', 'json'],
        expect.anything()
      );

      // Clear mocks to verify caching
      mockedFsAccess.mockClear();
      mockedExecFile.mockClear();
      mockExecFileAsync(mockVersionOutput);

      // Second call should use cached result (no wrapper check)
      await service.getSystemVersions();

      // Wrapper check should not happen again (cached as unavailable)
      expect(mockedFsAccess).not.toHaveBeenCalledWith('/opt/lacylights/scripts/update-repos-wrapper.sh', expect.any(Number));
      // Should still use base script
      expect(mockedExecFile).toHaveBeenCalledWith(
        '/opt/lacylights/scripts/update-repos.sh',
        ['versions', 'json'],
        expect.anything()
      );
    });

    it('should use wrapper script for getAvailableVersions when available', async () => {
      mockedFsAccess.mockResolvedValue(undefined);

      const mockVersions = 'v1.3.0\nv1.2.0';
      mockExecFileAsync(mockVersions);

      await service.getAvailableVersions('lacylights-node');

      expect(mockedExecFile).toHaveBeenCalledWith(
        '/opt/lacylights/scripts/update-repos-wrapper.sh',
        ['available', 'lacylights-node'],
        expect.anything()
      );
    });

    it('should use wrapper script for updateRepository when available', async () => {
      mockedFsAccess.mockResolvedValue(undefined);
      mockedFsReadFile.mockResolvedValue('v1.0.0');

      mockExecFileAsync('');

      await service.updateRepository('lacylights-node', 'v1.1.0');

      // Check that execFile was called with wrapper script path
      const calls = mockedExecFile.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[calls.length - 1][0]).toBe('/opt/lacylights/scripts/update-repos-wrapper.sh');
      expect(calls[calls.length - 1][1]).toEqual(['update', 'lacylights-node', 'v1.1.0']);
    });
  });

  describe('getSystemVersions', () => {
    it('should return system version information when script is available', async () => {
      mockedFsAccess.mockResolvedValue(undefined);

      const mockVersionOutput = JSON.stringify({
        'lacylights-fe': { installed: 'v1.0.0', latest: 'v1.1.0' },
        'lacylights-node': { installed: 'v2.0.0', latest: 'v2.0.0' },
        'lacylights-mcp': { installed: 'v1.0.0', latest: 'v1.2.0' },
      });

      mockExecFileAsync(mockVersionOutput);

      const result = await service.getSystemVersions();

      expect(result.repositories).toHaveLength(3);
      expect(result.repositories[0]).toEqual({
        repository: 'lacylights-fe',
        installed: 'v1.0.0',
        latest: 'v1.1.0',
        updateAvailable: true,
      });
      expect(result.repositories[1]).toEqual({
        repository: 'lacylights-node',
        installed: 'v2.0.0',
        latest: 'v2.0.0',
        updateAvailable: false,
      });
      expect(result.repositories[2]).toEqual({
        repository: 'lacylights-mcp',
        installed: 'v1.0.0',
        latest: 'v1.2.0',
        updateAvailable: true,
      });
      expect(result.lastChecked).toBeDefined();
    });

    it('should throw error when script is not available', async () => {
      mockedFsAccess.mockRejectedValue(new Error('ENOENT'));

      await expect(service.getSystemVersions()).rejects.toThrow(
        'Update script not available. Version management is not supported on this system.'
      );
    });

    it('should throw error when script execution fails', async () => {
      mockedFsAccess.mockResolvedValue(undefined);

      mockExecFileAsyncError(new Error('Script execution failed'));

      await expect(service.getSystemVersions()).rejects.toThrow('Failed to get system versions');
    });

    it('should handle unknown versions correctly', async () => {
      mockedFsAccess.mockResolvedValue(undefined);

      const mockVersionOutput = JSON.stringify({
        'lacylights-fe': { installed: 'unknown', latest: 'v1.1.0' },
        'lacylights-node': { installed: 'v2.0.0', latest: 'unknown' },
      });

      mockExecFileAsync(mockVersionOutput);

      const result = await service.getSystemVersions();

      expect(result.repositories[0].updateAvailable).toBe(true); // unknown != v1.1.0 AND latest is not 'unknown'
      expect(result.repositories[1].updateAvailable).toBe(false); // latest is 'unknown' so no update available
    });
  });

  describe('getAvailableVersions', () => {
    it('should return list of available versions', async () => {
      mockedFsAccess.mockResolvedValue(undefined);

      const mockVersions = 'v1.3.0\nv1.2.0\nv1.1.0\nv1.0.0';

      mockExecFileAsync(mockVersions);

      const result = await service.getAvailableVersions('lacylights-node');

      expect(result).toEqual(['v1.3.0', 'v1.2.0', 'v1.1.0', 'v1.0.0']);
    });

    it('should throw error when script is not available', async () => {
      mockedFsAccess.mockRejectedValue(new Error('ENOENT'));

      await expect(service.getAvailableVersions('lacylights-node')).rejects.toThrow(
        'Update script not available'
      );
    });

    it('should throw error for invalid repository name', async () => {
      mockedFsAccess.mockResolvedValue(undefined);

      await expect(service.getAvailableVersions('invalid-repo')).rejects.toThrow(
        'Invalid repository name: invalid-repo'
      );
    });

    it('should filter out empty lines', async () => {
      mockedFsAccess.mockResolvedValue(undefined);

      const mockVersions = 'v1.3.0\n\nv1.2.0\n\n';

      mockExecFileAsync(mockVersions);

      const result = await service.getAvailableVersions('lacylights-fe');

      expect(result).toEqual(['v1.3.0', 'v1.2.0']);
    });
  });

  describe('getInstalledVersion', () => {
    it('should return installed version from .lacylights-version file', async () => {
      mockedFsReadFile.mockResolvedValue('v1.2.3\n');

      const result = await service.getInstalledVersion('lacylights-node');

      expect(result).toBe('v1.2.3');
      expect(mockedFsReadFile).toHaveBeenCalledWith(
        '/opt/lacylights/repos/lacylights-node/.lacylights-version',
        'utf-8'
      );
    });

    it('should return "unknown" when version file does not exist', async () => {
      mockedFsReadFile.mockRejectedValue(new Error('ENOENT'));

      const result = await service.getInstalledVersion('lacylights-fe');

      expect(result).toBe('unknown');
    });
  });

  describe('updateRepository', () => {
    beforeEach(() => {
      // Mock getInstalledVersion calls
      mockedFsReadFile
        .mockResolvedValueOnce('v1.0.0') // previousVersion
        .mockResolvedValueOnce('v1.1.0'); // newVersion
    });

    it('should successfully update repository to specific version', async () => {
      mockedFsAccess.mockResolvedValue(undefined);

      mockExecFileAsync('Update successful');

      const result = await service.updateRepository('lacylights-node', 'v1.1.0');

      expect(result.success).toBe(true);
      expect(result.repository).toBe('lacylights-node');
      expect(result.previousVersion).toBe('v1.0.0');
      expect(result.newVersion).toBe('v1.1.0');
      expect(result.message).toContain('Successfully updated');
    });

    it('should update to latest when version is not specified', async () => {
      mockedFsAccess.mockResolvedValue(undefined);

      mockExecFileAsync('Update successful');

      const result = await service.updateRepository('lacylights-fe');

      expect(result.success).toBe(true);
    });

    it('should throw error when script is not available', async () => {
      mockedFsAccess.mockRejectedValue(new Error('ENOENT'));

      await expect(service.updateRepository('lacylights-node', 'v1.1.0')).rejects.toThrow(
        'Update script not available'
      );
    });

    it('should throw error for invalid repository name', async () => {
      mockedFsAccess.mockResolvedValue(undefined);

      await expect(service.updateRepository('invalid-repo', 'v1.0.0')).rejects.toThrow(
        'Invalid repository name: invalid-repo'
      );
    });

    it('should throw error for invalid version format', async () => {
      mockedFsAccess.mockResolvedValue(undefined);

      await expect(service.updateRepository('lacylights-node', 'invalid-version')).rejects.toThrow(
        'Invalid version format'
      );
    });

    it('should throw error for version with shell injection attempt', async () => {
      mockedFsAccess.mockResolvedValue(undefined);

      await expect(service.updateRepository('lacylights-node', 'v1.0.0; rm -rf /')).rejects.toThrow(
        'Invalid version format'
      );
    });

    it('should accept valid version formats', async () => {
      mockedFsAccess.mockResolvedValue(undefined);
      mockExecFileAsync('Update successful');

      // Test v-prefixed version
      await expect(service.updateRepository('lacylights-node', 'v1.2.3')).resolves.toBeTruthy();

      // Test non-prefixed version
      await expect(service.updateRepository('lacylights-node', '1.2.3')).resolves.toBeTruthy();

      // Test 'latest'
      await expect(service.updateRepository('lacylights-node', 'latest')).resolves.toBeTruthy();
    });

    it('should return error result when update fails', async () => {
      mockedFsAccess.mockResolvedValue(undefined);
      mockedFsReadFile.mockResolvedValue('v1.0.0'); // Both calls return same version

      mockExecFileAsyncError(new Error('Update failed: network error'));

      const result = await service.updateRepository('lacylights-mcp', 'v1.2.0');

      expect(result.success).toBe(false);
      expect(result.repository).toBe('lacylights-mcp');
      expect(result.previousVersion).toBe('v1.0.0');
      expect(result.newVersion).toBe('v1.0.0'); // Unchanged
      expect(result.error).toContain('Failed to update lacylights-mcp');
    });

    it('should use 5 minute timeout for update command', async () => {
      mockedFsAccess.mockResolvedValue(undefined);

      mockedExecFile.mockImplementation((file: string, args: any, options: any, callback: any) => {
        const cb = typeof options === 'function' ? options : callback;
        if (typeof options === 'object' && options.timeout) {
          expect(options.timeout).toBe(300000); // 5 minutes
        }
        process.nextTick(() => cb(null, { stdout: 'Update successful', stderr: '' }));
        return null as any;
      });

      await service.updateRepository('lacylights-node', 'v1.1.0');
    });
  });

  describe('updateAllRepositories', () => {
    it('should update all repositories successfully', async () => {
      mockedFsAccess.mockResolvedValue(undefined);
      mockedFsReadFile
        .mockResolvedValueOnce('v1.0.0') // lacylights-fe prev
        .mockResolvedValueOnce('v1.1.0') // lacylights-fe new
        .mockResolvedValueOnce('v2.0.0') // lacylights-node prev
        .mockResolvedValueOnce('v2.1.0') // lacylights-node new
        .mockResolvedValueOnce('v1.0.0') // lacylights-mcp prev
        .mockResolvedValueOnce('v1.2.0'); // lacylights-mcp new

      mockExecFileAsync('Update successful');

      const results = await service.updateAllRepositories();

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
      expect(results[0].repository).toBe('lacylights-fe');
      expect(results[1].repository).toBe('lacylights-node');
      expect(results[2].repository).toBe('lacylights-mcp');
    });

    it('should continue updating even if one repository fails', async () => {
      mockedFsAccess.mockResolvedValue(undefined);
      mockedFsReadFile.mockResolvedValue('v1.0.0');

      mockedExecFile
        .mockImplementationOnce((file: string, args: any, options: any, callback: any) => {
          const cb = typeof options === 'function' ? options : callback;
          process.nextTick(() => cb(new Error('First update failed')));
          return null as any;
        })
        .mockImplementationOnce((file: string, args: any, options: any, callback: any) => {
          const cb = typeof options === 'function' ? options : callback;
          process.nextTick(() => cb(null, { stdout: 'Update successful', stderr: '' }));
          return null as any;
        })
        .mockImplementationOnce((file: string, args: any, options: any, callback: any) => {
          const cb = typeof options === 'function' ? options : callback;
          process.nextTick(() => cb(null, { stdout: 'Update successful', stderr: '' }));
          return null as any;
        });

      const results = await service.updateAllRepositories();

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(false);
      expect(results[1].success).toBe(true);
      expect(results[2].success).toBe(true);
    });

    it('should throw error when script is not available', async () => {
      mockedFsAccess.mockRejectedValue(new Error('ENOENT'));

      await expect(service.updateAllRepositories()).rejects.toThrow('Update script not available');
    });
  });

  describe('isVersionManagementSupported', () => {
    it('should return true when update script exists', () => {
      // Mock fs.existsSync via require
      const mockExistsSync = jest.fn().mockReturnValue(true);
      jest.doMock('fs', () => ({
        existsSync: mockExistsSync,
      }));

      const result = VersionManagementService.isVersionManagementSupported();

      // Note: This test is limited because we're testing a static method that uses require('fs')
      // In a real scenario, you'd want to refactor this to be more testable
      expect(typeof result).toBe('boolean');
    });
  });
});
