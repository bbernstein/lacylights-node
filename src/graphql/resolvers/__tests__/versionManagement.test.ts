import { versionManagementResolvers } from '../versionManagement';
import * as versionManagementService from '../../../services/versionManagementService';

// Mock the version management service
jest.mock('../../../services/versionManagementService');

const mockedGetVersionManagementService =
  versionManagementService.getVersionManagementService as jest.MockedFunction<
    typeof versionManagementService.getVersionManagementService
  >;

const mockedIsVersionManagementSupported =
  versionManagementService.VersionManagementService.isVersionManagementSupported as jest.MockedFunction<
    typeof versionManagementService.VersionManagementService.isVersionManagementSupported
  >;

describe('Version Management Resolvers', () => {
  let mockService: {
    getSystemVersions: jest.Mock;
    getAvailableVersions: jest.Mock;
    updateRepository: jest.Mock;
    updateAllRepositories: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock service instance
    mockService = {
      getSystemVersions: jest.fn(),
      getAvailableVersions: jest.fn(),
      updateRepository: jest.fn(),
      updateAllRepositories: jest.fn(),
    };

    mockedGetVersionManagementService.mockReturnValue(mockService as any);
  });

  describe('Query.systemVersions', () => {
    it('should return version information when version management is supported', async () => {
      mockedIsVersionManagementSupported.mockReturnValue(true);

      const mockVersionInfo = {
        repositories: [
          {
            repository: 'lacylights-fe',
            installed: 'v1.0.0',
            latest: 'v1.1.0',
            updateAvailable: true,
          },
          {
            repository: 'lacylights-node',
            installed: 'v2.0.0',
            latest: 'v2.0.0',
            updateAvailable: false,
          },
        ],
        lastChecked: '2025-01-01T00:00:00.000Z',
      };

      mockService.getSystemVersions.mockResolvedValue(mockVersionInfo);

      const result = await versionManagementResolvers.Query.systemVersions();

      expect(result).toEqual({
        ...mockVersionInfo,
        versionManagementSupported: true,
      });
      expect(mockService.getSystemVersions).toHaveBeenCalled();
    });

    it('should return empty repositories when version management is not supported', async () => {
      mockedIsVersionManagementSupported.mockReturnValue(false);

      const result = await versionManagementResolvers.Query.systemVersions();

      expect(result.repositories).toEqual([]);
      expect(result.versionManagementSupported).toBe(false);
      expect(mockService.getSystemVersions).not.toHaveBeenCalled();
    });

    it('should throw error when service fails', async () => {
      mockedIsVersionManagementSupported.mockReturnValue(true);
      mockService.getSystemVersions.mockRejectedValue(new Error('Service error'));

      await expect(versionManagementResolvers.Query.systemVersions()).rejects.toThrow(
        'Failed to get system versions'
      );
    });

    it('should include lastChecked timestamp in response', async () => {
      mockedIsVersionManagementSupported.mockReturnValue(true);

      const mockVersionInfo = {
        repositories: [],
        lastChecked: '2025-01-01T12:00:00.000Z',
      };

      mockService.getSystemVersions.mockResolvedValue(mockVersionInfo);

      const result = await versionManagementResolvers.Query.systemVersions();

      expect(result.lastChecked).toBe('2025-01-01T12:00:00.000Z');
    });
  });

  describe('Query.availableVersions', () => {
    it('should return list of available versions for a repository', async () => {
      mockedIsVersionManagementSupported.mockReturnValue(true);

      const mockVersions = ['v1.3.0', 'v1.2.0', 'v1.1.0', 'v1.0.0'];
      mockService.getAvailableVersions.mockResolvedValue(mockVersions);

      const result = await versionManagementResolvers.Query.availableVersions(undefined, {
        repository: 'lacylights-node',
      });

      expect(result).toEqual(mockVersions);
      expect(mockService.getAvailableVersions).toHaveBeenCalledWith('lacylights-node');
    });

    it('should throw error when version management is not supported', async () => {
      mockedIsVersionManagementSupported.mockReturnValue(false);

      await expect(
        versionManagementResolvers.Query.availableVersions(undefined, { repository: 'lacylights-fe' })
      ).rejects.toThrow('Version management is not supported on this system');

      expect(mockService.getAvailableVersions).not.toHaveBeenCalled();
    });

    it('should throw error when service fails', async () => {
      mockedIsVersionManagementSupported.mockReturnValue(true);
      mockService.getAvailableVersions.mockRejectedValue(new Error('Network error'));

      await expect(
        versionManagementResolvers.Query.availableVersions(undefined, { repository: 'lacylights-mcp' })
      ).rejects.toThrow('Failed to get available versions for lacylights-mcp');
    });

    it('should handle different repository names correctly', async () => {
      mockedIsVersionManagementSupported.mockReturnValue(true);
      mockService.getAvailableVersions.mockResolvedValue(['v1.0.0']);

      await versionManagementResolvers.Query.availableVersions(undefined, { repository: 'lacylights-fe' });
      expect(mockService.getAvailableVersions).toHaveBeenCalledWith('lacylights-fe');

      await versionManagementResolvers.Query.availableVersions(undefined, { repository: 'lacylights-node' });
      expect(mockService.getAvailableVersions).toHaveBeenCalledWith('lacylights-node');

      await versionManagementResolvers.Query.availableVersions(undefined, { repository: 'lacylights-mcp' });
      expect(mockService.getAvailableVersions).toHaveBeenCalledWith('lacylights-mcp');
    });
  });

  describe('Mutation.updateRepository', () => {
    it('should successfully update repository to specific version', async () => {
      mockedIsVersionManagementSupported.mockReturnValue(true);

      const mockResult = {
        success: true,
        repository: 'lacylights-node',
        previousVersion: 'v1.0.0',
        newVersion: 'v1.1.0',
        message: 'Successfully updated lacylights-node from v1.0.0 to v1.1.0',
      };

      mockService.updateRepository.mockResolvedValue(mockResult);

      const result = await versionManagementResolvers.Mutation.updateRepository(undefined, {
        repository: 'lacylights-node',
        version: 'v1.1.0',
      });

      expect(result).toEqual(mockResult);
      expect(mockService.updateRepository).toHaveBeenCalledWith('lacylights-node', 'v1.1.0');
    });

    it('should use "latest" as default version', async () => {
      mockedIsVersionManagementSupported.mockReturnValue(true);

      const mockResult = {
        success: true,
        repository: 'lacylights-fe',
        previousVersion: 'v1.0.0',
        newVersion: 'v1.2.0',
      };

      mockService.updateRepository.mockResolvedValue(mockResult);

      await versionManagementResolvers.Mutation.updateRepository(undefined, {
        repository: 'lacylights-fe',
      });

      expect(mockService.updateRepository).toHaveBeenCalledWith('lacylights-fe', 'latest');
    });

    it('should throw error when version management is not supported', async () => {
      mockedIsVersionManagementSupported.mockReturnValue(false);

      await expect(
        versionManagementResolvers.Mutation.updateRepository(undefined, {
          repository: 'lacylights-node',
          version: 'v1.1.0',
        })
      ).rejects.toThrow('Version management is not supported on this system');

      expect(mockService.updateRepository).not.toHaveBeenCalled();
    });

    it('should throw error when service fails', async () => {
      mockedIsVersionManagementSupported.mockReturnValue(true);
      mockService.updateRepository.mockRejectedValue(new Error('Update failed'));

      await expect(
        versionManagementResolvers.Mutation.updateRepository(undefined, {
          repository: 'lacylights-mcp',
          version: 'v1.0.0',
        })
      ).rejects.toThrow('Failed to update lacylights-mcp');
    });

    it('should handle update failures gracefully', async () => {
      mockedIsVersionManagementSupported.mockReturnValue(true);

      const mockResult = {
        success: false,
        repository: 'lacylights-node',
        previousVersion: 'v1.0.0',
        newVersion: 'v1.0.0',
        error: 'Failed to update lacylights-node: Network error',
      };

      mockService.updateRepository.mockResolvedValue(mockResult);

      const result = await versionManagementResolvers.Mutation.updateRepository(undefined, {
        repository: 'lacylights-node',
        version: 'v1.1.0',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.previousVersion).toBe(result.newVersion);
    });
  });

  describe('Mutation.updateAllRepositories', () => {
    it('should successfully update all repositories', async () => {
      mockedIsVersionManagementSupported.mockReturnValue(true);

      const mockResults = [
        {
          success: true,
          repository: 'lacylights-fe',
          previousVersion: 'v1.0.0',
          newVersion: 'v1.1.0',
          message: 'Successfully updated lacylights-fe',
        },
        {
          success: true,
          repository: 'lacylights-node',
          previousVersion: 'v2.0.0',
          newVersion: 'v2.1.0',
          message: 'Successfully updated lacylights-node',
        },
        {
          success: true,
          repository: 'lacylights-mcp',
          previousVersion: 'v1.0.0',
          newVersion: 'v1.2.0',
          message: 'Successfully updated lacylights-mcp',
        },
      ];

      mockService.updateAllRepositories.mockResolvedValue(mockResults);

      const result = await versionManagementResolvers.Mutation.updateAllRepositories();

      expect(result).toEqual(mockResults);
      expect(result).toHaveLength(3);
      expect(result.every((r) => r.success)).toBe(true);
      expect(mockService.updateAllRepositories).toHaveBeenCalled();
    });

    it('should throw error when version management is not supported', async () => {
      mockedIsVersionManagementSupported.mockReturnValue(false);

      await expect(versionManagementResolvers.Mutation.updateAllRepositories()).rejects.toThrow(
        'Version management is not supported on this system'
      );

      expect(mockService.updateAllRepositories).not.toHaveBeenCalled();
    });

    it('should throw error when service fails', async () => {
      mockedIsVersionManagementSupported.mockReturnValue(true);
      mockService.updateAllRepositories.mockRejectedValue(new Error('Bulk update failed'));

      await expect(versionManagementResolvers.Mutation.updateAllRepositories()).rejects.toThrow(
        'Failed to update all repositories'
      );
    });

    it('should handle partial failures in results', async () => {
      mockedIsVersionManagementSupported.mockReturnValue(true);

      const mockResults = [
        {
          success: true,
          repository: 'lacylights-fe',
          previousVersion: 'v1.0.0',
          newVersion: 'v1.1.0',
        },
        {
          success: false,
          repository: 'lacylights-node',
          previousVersion: 'v2.0.0',
          newVersion: 'v2.0.0',
          error: 'Failed to update: network error',
        },
        {
          success: true,
          repository: 'lacylights-mcp',
          previousVersion: 'v1.0.0',
          newVersion: 'v1.2.0',
        },
      ];

      mockService.updateAllRepositories.mockResolvedValue(mockResults);

      const result = await versionManagementResolvers.Mutation.updateAllRepositories();

      expect(result).toEqual(mockResults);
      expect(result[0].success).toBe(true);
      expect(result[1].success).toBe(false);
      expect(result[2].success).toBe(true);
    });
  });
});
