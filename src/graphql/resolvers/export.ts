/**
 * GraphQL Resolvers for Native Export/Import
 */

import { Context } from '../../context';
import { ExportService, ExportOptions } from '../../services/exportService';
import { ImportService, ImportOptions } from '../../services/importService';

export interface ExportProjectArgs {
  projectId: string;
  options?: {
    description?: string;
    includeFixtures?: boolean;
    includeScenes?: boolean;
    includeCueLists?: boolean;
  };
}

export interface ImportProjectArgs {
  jsonContent: string;
  options: {
    mode: 'CREATE' | 'MERGE';
    targetProjectId?: string;
    projectName?: string;
    fixtureConflictStrategy?: 'SKIP' | 'REPLACE' | 'ERROR';
    importBuiltInFixtures?: boolean;
  };
}

export const exportResolvers = {
  Mutation: {
    /**
     * Export a project to LacyLights native JSON format
     */
    exportProject: async (_: unknown, args: ExportProjectArgs, { prisma }: Context) => {
      const exportService = new ExportService(prisma);

      // Map GraphQL options to service options
      const exportOptions: ExportOptions = {
        description: args.options?.description,
        include: args.options
          ? {
              fixtures: args.options.includeFixtures,
              scenes: args.options.includeScenes,
              cueLists: args.options.includeCueLists,
            }
          : undefined,
      };

      // Perform the export
      const exportData = await exportService.exportProject(args.projectId, exportOptions);

      // Convert to JSON string
      const jsonContent = exportService.exportToJson(exportData, true);

      // Count cues
      const cuesCount = exportData.cueLists.reduce(
        (sum, cueList) => sum + cueList.cues.length,
        0
      );

      return {
        projectId: exportData.project.originalId,
        projectName: exportData.project.name,
        jsonContent,
        stats: {
          fixtureDefinitionsCount: exportData.fixtureDefinitions.length,
          fixtureInstancesCount: exportData.fixtureInstances.length,
          scenesCount: exportData.scenes.length,
          cueListsCount: exportData.cueLists.length,
          cuesCount,
        },
      };
    },

    /**
     * Import a project from LacyLights native JSON format
     */
    importProject: async (_: unknown, args: ImportProjectArgs, { prisma }: Context) => {
      const importService = new ImportService(prisma);

      // Parse the JSON
      const exportData = importService.parseJson(args.jsonContent);

      // Map GraphQL options to service options
      const importOptions: ImportOptions = {
        mode: args.options.mode.toLowerCase() as 'create' | 'merge',
        targetProjectId: args.options.targetProjectId,
        projectName: args.options.projectName,
        fixtureConflictStrategy: args.options.fixtureConflictStrategy?.toLowerCase() as
          | 'skip'
          | 'replace'
          | 'error'
          | undefined,
        importBuiltInFixtures: args.options.importBuiltInFixtures,
      };

      // Perform the import
      const result = await importService.importProject(exportData, importOptions);

      return {
        projectId: result.projectId,
        stats: {
          fixtureDefinitionsCreated: result.stats.fixtureDefinitionsCreated,
          fixtureInstancesCreated: result.stats.fixtureInstancesCreated,
          scenesCreated: result.stats.scenesCreated,
          cueListsCreated: result.stats.cueListsCreated,
          cuesCreated: result.stats.cuesCreated,
        },
        warnings: result.warnings,
      };
    },
  },
};