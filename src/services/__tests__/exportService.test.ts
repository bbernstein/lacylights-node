/**
 * Unit tests for ExportService
 */

import { ExportService } from '../exportService';
import { PrismaClient } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

describe('ExportService', () => {
  let exportService: ExportService;
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    exportService = new ExportService(prisma as unknown as PrismaClient);
  });

  describe('exportProject', () => {
    it('should export a project with all data', async () => {
      const mockProject = {
        id: 'project-1',
        name: 'Test Project',
        description: 'Test Description',
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-02'),
      };

      const mockDefinition = {
        id: 'def-1',
        manufacturer: 'Test Mfg',
        model: 'Test Model',
        type: 'LED_PAR' as const,
        isBuiltIn: false,
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
        channels: [
          {
            id: 'ch-1',
            name: 'Red',
            type: 'RED' as const,
            offset: 0,
            minValue: 0,
            maxValue: 255,
            defaultValue: 0,
            definitionId: 'def-1',
          },
        ],
        modes: [
          {
            id: 'mode-1',
            name: 'Standard',
            shortName: 'STD',
            channelCount: 1,
            definitionId: 'def-1',
            modeChannels: [
              {
                id: 'mc-1',
                modeId: 'mode-1',
                channelId: 'ch-1',
                offset: 0,
                channel: {
                  id: 'ch-1',
                  name: 'Red',
                  type: 'RED' as const,
                  offset: 0,
                  minValue: 0,
                  maxValue: 255,
                  defaultValue: 0,
                  definitionId: 'def-1',
                },
              },
            ],
          },
        ],
      };

      const mockFixture = {
        id: 'fixture-1',
        name: 'Test Fixture',
        description: 'Test fixture',
        definitionId: 'def-1',
        manufacturer: 'Test Mfg',
        model: 'Test Model',
        type: 'LED_PAR' as const,
        modeName: 'Standard',
        channelCount: 1,
        projectId: 'project-1',
        universe: 1,
        startChannel: 1,
        tags: ['test'],
        projectOrder: 0,
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
        definition: mockDefinition,
        channels: [
          {
            id: 'ic-1',
            fixtureId: 'fixture-1',
            name: 'Red',
            type: 'RED' as const,
            offset: 0,
            minValue: 0,
            maxValue: 255,
            defaultValue: 0,
          },
        ],
      };

      const mockScene = {
        id: 'scene-1',
        name: 'Test Scene',
        description: 'Test scene',
        projectId: 'project-1',
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
        fixtureValues: [
          {
            id: 'fv-1',
            sceneId: 'scene-1',
            fixtureId: 'fixture-1',
            channelValues: [128],
            sceneOrder: 0,
          },
        ],
      };

      const mockCueList = {
        id: 'cuelist-1',
        name: 'Test Cue List',
        description: 'Test cue list',
        projectId: 'project-1',
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
        cues: [
          {
            id: 'cue-1',
            name: 'Cue 1',
            cueNumber: 1.0,
            cueListId: 'cuelist-1',
            sceneId: 'scene-1',
            fadeInTime: 3.0,
            fadeOutTime: 3.0,
            followTime: null,
            easingType: 'LINEAR' as const,
            notes: 'Test cue',
            createdAt: new Date('2025-01-01'),
            updatedAt: new Date('2025-01-01'),
          },
        ],
      };

      prisma.project.findUnique.mockResolvedValue(mockProject);
      prisma.fixtureInstance.findMany.mockResolvedValue([mockFixture as any]);
      prisma.scene.findMany.mockResolvedValue([mockScene as any]);
      prisma.cueList.findMany.mockResolvedValue([mockCueList as any]);

      const result = await exportService.exportProject('project-1');

      expect(result.version).toBe('1.0.0');
      expect(result.project.name).toBe('Test Project');
      expect(result.fixtureDefinitions).toHaveLength(1);
      expect(result.fixtureInstances).toHaveLength(1);
      expect(result.scenes).toHaveLength(1);
      expect(result.cueLists).toHaveLength(1);
      expect(result.cueLists[0].cues).toHaveLength(1);
    });

    it('should throw error for non-existent project', async () => {
      prisma.project.findUnique.mockResolvedValue(null);

      await expect(exportService.exportProject('invalid-id')).rejects.toThrow(
        'Project with id invalid-id not found'
      );
    });

    it('should respect include options', async () => {
      const mockProject = {
        id: 'project-1',
        name: 'Test Project',
        description: 'Test Description',
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-02'),
      };

      prisma.project.findUnique.mockResolvedValue(mockProject);
      prisma.fixtureInstance.findMany.mockResolvedValue([]);
      prisma.scene.findMany.mockResolvedValue([]);
      prisma.cueList.findMany.mockResolvedValue([]);

      const result = await exportService.exportProject('project-1', {
        include: {
          fixtures: false,
          scenes: false,
          cueLists: false,
        },
      });

      expect(result.fixtureDefinitions).toHaveLength(0);
      expect(result.fixtureInstances).toHaveLength(0);
      expect(result.scenes).toHaveLength(0);
      expect(result.cueLists).toHaveLength(0);
    });
  });

  describe('exportToJson', () => {
    it('should export to pretty-printed JSON', () => {
      const exportData = {
        version: '1.0.0',
        metadata: {
          exportedAt: '2025-01-01T00:00:00.000Z',
          lacyLightsVersion: '1.0.0',
        },
        project: {
          originalId: 'project-1',
          name: 'Test Project',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
        fixtureDefinitions: [],
        fixtureInstances: [],
        scenes: [],
        cueLists: [],
      };

      const json = exportService.exportToJson(exportData as any, true);

      expect(json).toContain('\n');
      expect(json).toContain('  ');
      const parsed = JSON.parse(json);
      expect(parsed.version).toBe('1.0.0');
    });

    it('should export to compact JSON', () => {
      const exportData = {
        version: '1.0.0',
        metadata: {
          exportedAt: '2025-01-01T00:00:00.000Z',
          lacyLightsVersion: '1.0.0',
        },
        project: {
          originalId: 'project-1',
          name: 'Test Project',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
        fixtureDefinitions: [],
        fixtureInstances: [],
        scenes: [],
        cueLists: [],
      };

      const json = exportService.exportToJson(exportData as any, false);

      expect(json).not.toContain('\n  ');
      const parsed = JSON.parse(json);
      expect(parsed.version).toBe('1.0.0');
    });
  });
});