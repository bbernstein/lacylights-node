import {
  getVersionManagementService,
  VersionManagementService,
} from '../../services/versionManagementService';

export const versionManagementResolvers = {
  Query: {
    systemVersions: async () => {
      const service = getVersionManagementService();

      // Check if version management is supported
      const isSupported = VersionManagementService.isVersionManagementSupported();

      if (!isSupported) {
        return {
          repositories: [],
          lastChecked: new Date().toISOString(),
          versionManagementSupported: false,
        };
      }

      try {
        const versionInfo = await service.getSystemVersions();
        return {
          ...versionInfo,
          versionManagementSupported: true,
        };
      } catch (error) {
        throw new Error(
          `Failed to get system versions: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },

    availableVersions: async (_: unknown, { repository }: { repository: string }) => {
      const service = getVersionManagementService();

      if (!VersionManagementService.isVersionManagementSupported()) {
        throw new Error('Version management is not supported on this system');
      }

      try {
        return await service.getAvailableVersions(repository);
      } catch (error) {
        throw new Error(
          `Failed to get available versions for ${repository}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
  },

  Mutation: {
    updateRepository: async (
      _: unknown,
      { repository, version = 'latest' }: { repository: string; version?: string }
    ) => {
      const service = getVersionManagementService();

      if (!VersionManagementService.isVersionManagementSupported()) {
        throw new Error('Version management is not supported on this system');
      }

      try {
        return await service.updateRepository(repository, version);
      } catch (error) {
        throw new Error(
          `Failed to update ${repository}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },

    updateAllRepositories: async () => {
      const service = getVersionManagementService();

      if (!VersionManagementService.isVersionManagementSupported()) {
        throw new Error('Version management is not supported on this system');
      }

      try {
        return await service.updateAllRepositories();
      } catch (error) {
        throw new Error(
          `Failed to update all repositories: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
  },
};
