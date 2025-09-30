/**
 * Unit tests for ImportService
 */

import { ImportService } from '../importService';
import { PrismaClient } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import type { LacyLightsExport } from '../../types/export';

describe('ImportService', () => {
  let importService: ImportService;
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    importService = new ImportService(prisma as unknown as PrismaClient);
  });

  const createMockExport = (): LacyLightsExport => ({
    version: '1.0.0',
    metadata: {
      exportedAt: '2025-01-01T00:00:00.000Z',
      lacyLightsVersion: '1.0.0',
    },
    project: {
      originalId: 'project-1',
      name: 'Test Project',
      description: 'Test Description',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
    fixtureDefinitions: [
      {
        refId: 'def-0',
        manufacturer: 'Test Mfg',
        model: 'Test Model',
        type: 'LED_PAR',
        isBuiltIn: false,
        modes: [
          {
            refId: 'mode-0',
            name: 'Standard',
            shortName: 'STD',
            channelCount: 1,
            modeChannels: [{ channelRefId: 'ch-0', offset: 0 }],
          },
        ],
        channels: [
          {
            refId: 'ch-0',
            name: 'Red',
            type: 'RED',
            offset: 0,
            minValue: 0,
            maxValue: 255,
            defaultValue: 0,
          },
        ],
      },
    ],
    fixtureInstances: [
      {
        refId: 'fixture-0',
        originalId: 'fixture-1',
        name: 'Test Fixture',
        description: 'Test fixture',
        definitionRefId: 'def-0',
        modeName: 'Standard',
        channelCount: 1,
        universe: 1,
        startChannel: 1,
        tags: ['test'],
        projectOrder: 0,
        instanceChannels: [
          {
            name: 'Red',
            type: 'RED',
            offset: 0,
            minValue: 0,
            maxValue: 255,
            defaultValue: 0,
          },
        ],
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ],
    scenes: [
      {
        refId: 'scene-0',
        originalId: 'scene-1',
        name: 'Test Scene',
        description: 'Test scene',
        fixtureValues: [
          {
            fixtureRefId: 'fixture-0',
            channelValues: [128],
            sceneOrder: 0,
          },
        ],
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ],
    cueLists: [
      {
        refId: 'cuelist-0',
        originalId: 'cuelist-1',
        name: 'Test Cue List',
        description: 'Test cue list',
        cues: [
          {
            originalId: 'cue-1',
            name: 'Cue 1',
            cueNumber: 1.0,
            sceneRefId: 'scene-0',
            fadeInTime: 3.0,
            fadeOutTime: 3.0,
            followTime: undefined,
            easingType: 'LINEAR',
            notes: 'Test cue',
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        ],
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ],
  });

  describe('parseJson', () => {
    it('should parse valid JSON export', () => {
      const mockExport = createMockExport();
      const json = JSON.stringify(mockExport);

      const result = importService.parseJson(json);

      expect(result.version).toBe('1.0.0');
      expect(result.project.name).toBe('Test Project');
    });

    it('should throw error for invalid JSON', () => {
      expect(() => importService.parseJson('invalid json')).toThrow('Failed to parse export JSON');
    });

    it('should throw error for missing required fields', () => {
      const invalidExport = { version: '1.0.0' };
      const json = JSON.stringify(invalidExport);

      expect(() => importService.parseJson(json)).toThrow(
        'Invalid export format: missing required fields'
      );
    });
  });

  describe('importProject', () => {
    it('should import project in CREATE mode with unique name', async () => {
      const mockExport = createMockExport();
      const mockProject = { id: 'new-project-1', name: 'Test Project', description: null };
      const mockDefinition = {
        id: 'new-def-1',
        manufacturer: 'Test Mfg',
        model: 'Test Model',
        channels: [{ id: 'new-ch-1' }],
      };
      const mockFixture = { id: 'new-fixture-1' };
      const mockScene = { id: 'new-scene-1' };
      const mockCueList = { id: 'new-cuelist-1' };

      // Mock unique name generation - name doesn't exist
      prisma.project.findFirst.mockResolvedValue(null);
      prisma.project.findMany.mockResolvedValue([]);

      prisma.project.create.mockResolvedValue(mockProject as any);
      // First call for checking if definition exists, second call for getting definition data
      prisma.fixtureDefinition.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'new-def-1',
          manufacturer: 'Test Mfg',
          model: 'Test Model',
          type: 'LED_PAR',
        } as any);
      prisma.fixtureDefinition.create.mockResolvedValue(mockDefinition as any);
      prisma.fixtureMode.create.mockResolvedValue({} as any);
      prisma.fixtureInstance.findFirst.mockResolvedValue(null);
      prisma.fixtureInstance.create.mockResolvedValue(mockFixture as any);
      prisma.scene.create.mockResolvedValue(mockScene as any);
      prisma.cueList.create.mockResolvedValue(mockCueList as any);

      const result = await importService.importProject(mockExport, {
        mode: 'create',
      });

      expect(result.projectId).toBe('new-project-1');
      expect(result.stats.fixtureDefinitionsCreated).toBe(1);
      expect(result.stats.fixtureInstancesCreated).toBe(1);
      expect(result.stats.scenesCreated).toBe(1);
      expect(result.stats.cueListsCreated).toBe(1);
      expect(result.stats.cuesCreated).toBe(1);
      expect(result.warnings).toHaveLength(0);
    });

    it('should generate unique project name when name exists', async () => {
      const mockExport = createMockExport();
      const mockProject = { id: 'new-project-1', name: 'Test Project (1)', description: null };
      const mockDefinition = {
        id: 'new-def-1',
        manufacturer: 'Test Mfg',
        model: 'Test Model',
        channels: [{ id: 'new-ch-1' }],
      };

      // Mock unique name generation - base name exists
      prisma.project.findFirst.mockResolvedValue({ id: '1', name: 'Test Project' } as any);
      prisma.project.findMany.mockResolvedValue([
        { name: 'Test Project' },
      ] as any[]);

      prisma.project.create.mockResolvedValue(mockProject as any);
      prisma.fixtureDefinition.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'new-def-1',
          manufacturer: 'Test Mfg',
          model: 'Test Model',
          type: 'LED_PAR',
        } as any);
      prisma.fixtureDefinition.create.mockResolvedValue(mockDefinition as any);
      prisma.fixtureMode.create.mockResolvedValue({} as any);
      prisma.fixtureInstance.findFirst.mockResolvedValue(null);
      prisma.fixtureInstance.create.mockResolvedValue({} as any);
      prisma.scene.create.mockResolvedValue({} as any);
      prisma.cueList.create.mockResolvedValue({} as any);

      await importService.importProject(mockExport, { mode: 'create' });

      // Verify that project.create was called with the unique name
      expect(prisma.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Test Project (1)',
          }),
        })
      );
    });

    it('should increment project name number when numbered name exists', async () => {
      const mockExport = createMockExport();
      mockExport.project.name = 'Test Project (2)';
      const mockProject = { id: 'new-project-1', name: 'Test Project (3)', description: null };

      // Mock unique name generation - numbered names exist
      prisma.project.findFirst.mockResolvedValue({ id: '1', name: 'Test Project (2)' } as any);
      prisma.project.findMany.mockResolvedValue([
        { name: 'Test Project' },
        { name: 'Test Project (1)' },
        { name: 'Test Project (2)' },
      ] as any[]);

      prisma.project.create.mockResolvedValue(mockProject as any);
      prisma.fixtureDefinition.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'def-1',
          manufacturer: 'Test Mfg',
          model: 'Test Model',
          type: 'LED_PAR',
        } as any);
      prisma.fixtureDefinition.create.mockResolvedValue({
        id: 'def-1',
        channels: [{ id: 'ch-1' }],
      } as any);
      prisma.fixtureMode.create.mockResolvedValue({} as any);
      prisma.fixtureInstance.findFirst.mockResolvedValue(null);
      prisma.fixtureInstance.create.mockResolvedValue({} as any);
      prisma.scene.create.mockResolvedValue({} as any);
      prisma.cueList.create.mockResolvedValue({} as any);

      await importService.importProject(mockExport, { mode: 'create' });

      // Verify that project.create was called with the next available number
      expect(prisma.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Test Project (3)',
          }),
        })
      );
    });

    it('should import project in MERGE mode', async () => {
      const mockExport = createMockExport();
      const mockProject = {
        id: 'existing-project-1',
        name: 'Existing Project',
        description: null,
      };
      const mockDefinition = {
        id: 'new-def-1',
        manufacturer: 'Test Mfg',
        model: 'Test Model',
        channels: [{ id: 'new-ch-1' }],
      };
      const mockFixture = { id: 'new-fixture-1' };
      const mockScene = { id: 'new-scene-1' };
      const mockCueList = { id: 'new-cuelist-1' };

      prisma.project.findUnique.mockResolvedValue(mockProject as any);
      prisma.fixtureDefinition.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'new-def-1',
          manufacturer: 'Test Mfg',
          model: 'Test Model',
          type: 'LED_PAR',
        } as any);
      prisma.fixtureDefinition.create.mockResolvedValue(mockDefinition as any);
      prisma.fixtureMode.create.mockResolvedValue({} as any);
      prisma.fixtureInstance.findFirst.mockResolvedValue(null);
      prisma.fixtureInstance.create.mockResolvedValue(mockFixture as any);
      prisma.scene.create.mockResolvedValue(mockScene as any);
      prisma.cueList.create.mockResolvedValue(mockCueList as any);

      const result = await importService.importProject(mockExport, {
        mode: 'merge',
        targetProjectId: 'existing-project-1',
      });

      expect(result.projectId).toBe('existing-project-1');
      expect(result.stats.fixtureDefinitionsCreated).toBe(1);
    });

    it('should throw error for merge mode without targetProjectId', async () => {
      const mockExport = createMockExport();

      await expect(
        importService.importProject(mockExport, {
          mode: 'merge',
        })
      ).rejects.toThrow('targetProjectId is required for merge mode');
    });

    it('should throw error for non-existent target project', async () => {
      const mockExport = createMockExport();

      prisma.project.findUnique.mockResolvedValue(null);

      await expect(
        importService.importProject(mockExport, {
          mode: 'merge',
          targetProjectId: 'invalid-id',
        })
      ).rejects.toThrow('Target project invalid-id not found');
    });

    it('should skip existing fixture definitions with SKIP strategy', async () => {
      const mockExport = createMockExport();
      const mockProject = { id: 'new-project-1', name: 'Test Project', description: null };
      const existingDefinition = {
        id: 'existing-def-1',
        manufacturer: 'Test Mfg',
        model: 'Test Model',
      };

      prisma.project.findFirst.mockResolvedValue(null);
      prisma.project.findMany.mockResolvedValue([]);
      prisma.project.create.mockResolvedValue(mockProject as any);
      prisma.fixtureDefinition.findUnique
        .mockResolvedValueOnce(existingDefinition as any)
        .mockResolvedValueOnce(existingDefinition as any);
      prisma.fixtureInstance.findFirst.mockResolvedValue(null);
      prisma.fixtureInstance.create.mockResolvedValue({ id: 'new-fixture-1' } as any);
      prisma.scene.create.mockResolvedValue({ id: 'new-scene-1' } as any);
      prisma.cueList.create.mockResolvedValue({ id: 'new-cuelist-1' } as any);

      const result = await importService.importProject(mockExport, {
        mode: 'create',
        fixtureConflictStrategy: 'skip',
      });

      expect(result.stats.fixtureDefinitionsCreated).toBe(0);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('Skipped existing fixture')
      );
    });

    it('should handle DMX address conflicts', async () => {
      const mockExport = createMockExport();
      const mockProject = { id: 'new-project-1', name: 'Test Project', description: null };
      const mockDefinition = {
        id: 'new-def-1',
        manufacturer: 'Test Mfg',
        model: 'Test Model',
        type: 'LED_PAR',
        channels: [{ id: 'new-ch-1' }],
      };
      const existingFixture = { id: 'existing-fixture-1' };

      prisma.project.findFirst.mockResolvedValue(null);
      prisma.project.findMany.mockResolvedValue([]);
      prisma.project.create.mockResolvedValue(mockProject as any);
      prisma.fixtureDefinition.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockDefinition as any);
      prisma.fixtureDefinition.create.mockResolvedValue(mockDefinition as any);
      prisma.fixtureMode.create.mockResolvedValue({} as any);
      prisma.fixtureInstance.findFirst.mockResolvedValue(existingFixture as any);
      prisma.scene.create.mockResolvedValue({ id: 'new-scene-1' } as any);
      prisma.cueList.create.mockResolvedValue({ id: 'new-cuelist-1' } as any);

      const result = await importService.importProject(mockExport, {
        mode: 'create',
      });

      expect(result.stats.fixtureInstancesCreated).toBe(0);
      expect(result.warnings).toContainEqual(expect.stringContaining('DMX address conflict'));
    });

    it('should throw error for unsupported export version', async () => {
      const mockExport = createMockExport();
      mockExport.version = '2.0.0';

      await expect(
        importService.importProject(mockExport, { mode: 'create' })
      ).rejects.toThrow('Unsupported export format version: 2.0.0');
    });
  });
});