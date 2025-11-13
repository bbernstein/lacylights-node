import {
  getVersionManagementService,
  VersionManagementService,
} from '../../services/versionManagementService';

/**
 * Wrap error message with action context, preserving original error cause
 */
function wrapError(action: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof Error) {
    return new Error(`${action}: ${message}`, { cause: error });
  }
  return new Error(`${action}: ${message}`);
}

/**
 * Ensure version management is supported, throw if not
 */
function ensureVersionManagementSupported(): void {
  if (!VersionManagementService.isVersionManagementSupported()) {
    throw new Error('Version management is not supported on this system');
  }
}

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
        throw wrapError('Failed to get system versions', error);
      }
    },

    availableVersions: async (_: unknown, { repository }: { repository: string }) => {
      const service = getVersionManagementService();
      ensureVersionManagementSupported();

      try {
        return await service.getAvailableVersions(repository);
      } catch (error) {
        throw wrapError(`Failed to get available versions for ${repository}`, error);
      }
    },
  },

  Mutation: {
    updateRepository: async (
      _: unknown,
      { repository, version = 'latest' }: { repository: string; version?: string }
    ) => {
      const service = getVersionManagementService();
      ensureVersionManagementSupported();

      try {
        return await service.updateRepository(repository, version);
      } catch (error) {
        throw wrapError(`Failed to update ${repository}`, error);
      }
    },

    updateAllRepositories: async () => {
      const service = getVersionManagementService();
      ensureVersionManagementSupported();

      try {
        return await service.updateAllRepositories();
      } catch (error) {
        throw wrapError('Failed to update all repositories', error);
      }
    },
  },
};
