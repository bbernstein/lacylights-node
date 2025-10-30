import { exportResolvers } from '../export';
import { ExportService } from '../../../services/exportService';
import { ImportService } from '../../../services/importService';
import { Context } from '../../../context';

// Mock the services
jest.mock('../../../services/exportService');
jest.mock('../../../services/importService');

const MockExportService = ExportService as jest.MockedClass<typeof ExportService>;
const MockImportService = ImportService as jest.MockedClass<typeof ImportService>;

describe('Export Resolvers', () => {
  let mockContext: Context;

  beforeEach(() => {
    jest.clearAllMocks();
    mockContext = {
      prisma: {} as any,
      pubsub: {} as any,
    };
  });

  describe('exportProject', () => {
    const mockExportData = {
      project: {
        originalId: 'project-1',
        name: 'Test Project',
      },
      fixtureDefinitions: [{ id: 'def-1' }],
      fixtureInstances: [{ id: 'fix-1' }, { id: 'fix-2' }],
      scenes: [{ id: 'scene-1' }],
      cueLists: [
        {
          id: 'cue-list-1',
          cues: [{ id: 'cue-1' }, { id: 'cue-2' }],
        },
      ],
    };

    it('should export a project with default options', async () => {
      const mockExportService = {
        exportProject: jest.fn().mockResolvedValue(mockExportData),
        exportToJson: jest.fn().mockReturnValue('{"project": "data"}'),
      };
      MockExportService.mockImplementation(() => mockExportService as any);

      const result = await exportResolvers.Mutation.exportProject(
        null,
        { projectId: 'project-1' },
        mockContext
      );

      expect(MockExportService).toHaveBeenCalledWith(mockContext.prisma);
      expect(mockExportService.exportProject).toHaveBeenCalledWith('project-1', {
        description: undefined,
        include: undefined,
      });
      expect(mockExportService.exportToJson).toHaveBeenCalledWith(mockExportData, true);
      expect(result).toEqual({
        projectId: 'project-1',
        projectName: 'Test Project',
        jsonContent: '{"project": "data"}',
        stats: {
          fixtureDefinitionsCount: 1,
          fixtureInstancesCount: 2,
          scenesCount: 1,
          cueListsCount: 1,
          cuesCount: 2,
        },
      });
    });

    it('should export a project with custom options', async () => {
      const mockExportService = {
        exportProject: jest.fn().mockResolvedValue(mockExportData),
        exportToJson: jest.fn().mockReturnValue('{"project": "data"}'),
      };
      MockExportService.mockImplementation(() => mockExportService as any);

      const options = {
        description: 'My export',
        includeFixtures: true,
        includeScenes: false,
        includeCueLists: true,
      };

      await exportResolvers.Mutation.exportProject(
        null,
        { projectId: 'project-1', options },
        mockContext
      );

      expect(mockExportService.exportProject).toHaveBeenCalledWith('project-1', {
        description: 'My export',
        include: {
          fixtures: true,
          scenes: false,
          cueLists: true,
        },
      });
    });

    it('should count cues across multiple cue lists', async () => {
      const dataWithMultipleCueLists = {
        ...mockExportData,
        cueLists: [
          { id: 'cue-list-1', cues: [{ id: 'cue-1' }, { id: 'cue-2' }] },
          { id: 'cue-list-2', cues: [{ id: 'cue-3' }] },
        ],
      };

      const mockExportService = {
        exportProject: jest.fn().mockResolvedValue(dataWithMultipleCueLists),
        exportToJson: jest.fn().mockReturnValue('{"project": "data"}'),
      };
      MockExportService.mockImplementation(() => mockExportService as any);

      const result = await exportResolvers.Mutation.exportProject(
        null,
        { projectId: 'project-1' },
        mockContext
      );

      expect(result.stats.cuesCount).toBe(3);
    });
  });

  describe('importProject', () => {
    const mockImportResult = {
      projectId: 'project-2',
      stats: {
        fixtureDefinitionsCreated: 1,
        fixtureInstancesCreated: 2,
        scenesCreated: 1,
        cueListsCreated: 1,
        cuesCreated: 2,
      },
      warnings: ['Warning 1', 'Warning 2'],
    };

    const mockParsedData = {
      project: { name: 'Imported Project' },
    };

    it('should import a project in CREATE mode', async () => {
      const mockImportService = {
        parseJson: jest.fn().mockReturnValue(mockParsedData),
        importProject: jest.fn().mockResolvedValue(mockImportResult),
      };
      MockImportService.mockImplementation(() => mockImportService as any);

      const args = {
        jsonContent: '{"project": "data"}',
        options: {
          mode: 'CREATE' as const,
          projectName: 'New Project',
        },
      };

      const result = await exportResolvers.Mutation.importProject(
        null,
        args,
        mockContext
      );

      expect(MockImportService).toHaveBeenCalledWith(mockContext.prisma);
      expect(mockImportService.parseJson).toHaveBeenCalledWith('{"project": "data"}');
      expect(mockImportService.importProject).toHaveBeenCalledWith(mockParsedData, {
        mode: 'create',
        targetProjectId: undefined,
        projectName: 'New Project',
        fixtureConflictStrategy: undefined,
        importBuiltInFixtures: undefined,
      });
      expect(result).toEqual({
        projectId: 'project-2',
        stats: mockImportResult.stats,
        warnings: ['Warning 1', 'Warning 2'],
      });
    });

    it('should import a project in MERGE mode with conflict strategy', async () => {
      const mockImportService = {
        parseJson: jest.fn().mockReturnValue(mockParsedData),
        importProject: jest.fn().mockResolvedValue(mockImportResult),
      };
      MockImportService.mockImplementation(() => mockImportService as any);

      const args = {
        jsonContent: '{"project": "data"}',
        options: {
          mode: 'MERGE' as const,
          targetProjectId: 'existing-project',
          fixtureConflictStrategy: 'REPLACE' as const,
          importBuiltInFixtures: true,
        },
      };

      await exportResolvers.Mutation.importProject(null, args, mockContext);

      expect(mockImportService.importProject).toHaveBeenCalledWith(mockParsedData, {
        mode: 'merge',
        targetProjectId: 'existing-project',
        projectName: undefined,
        fixtureConflictStrategy: 'replace',
        importBuiltInFixtures: true,
      });
    });

    it('should handle SKIP conflict strategy', async () => {
      const mockImportService = {
        parseJson: jest.fn().mockReturnValue(mockParsedData),
        importProject: jest.fn().mockResolvedValue(mockImportResult),
      };
      MockImportService.mockImplementation(() => mockImportService as any);

      const args = {
        jsonContent: '{"project": "data"}',
        options: {
          mode: 'CREATE' as const,
          fixtureConflictStrategy: 'SKIP' as const,
        },
      };

      await exportResolvers.Mutation.importProject(null, args, mockContext);

      expect(mockImportService.importProject).toHaveBeenCalledWith(
        mockParsedData,
        expect.objectContaining({
          fixtureConflictStrategy: 'skip',
        })
      );
    });

    it('should handle ERROR conflict strategy', async () => {
      const mockImportService = {
        parseJson: jest.fn().mockReturnValue(mockParsedData),
        importProject: jest.fn().mockResolvedValue(mockImportResult),
      };
      MockImportService.mockImplementation(() => mockImportService as any);

      const args = {
        jsonContent: '{"project": "data"}',
        options: {
          mode: 'CREATE' as const,
          fixtureConflictStrategy: 'ERROR' as const,
        },
      };

      await exportResolvers.Mutation.importProject(null, args, mockContext);

      expect(mockImportService.importProject).toHaveBeenCalledWith(
        mockParsedData,
        expect.objectContaining({
          fixtureConflictStrategy: 'error',
        })
      );
    });
  });
});
