/**
 * Export Service
 * Exports project data to LacyLights native JSON format
 */

import { PrismaClient } from '@prisma/client';
import type {
  LacyLightsExport,
  ExportMetadata,
  ExportProject,
  ExportFixtureDefinition,
  ExportFixtureMode,
  ExportChannelDefinition,
  ExportModeChannel,
  ExportFixtureInstance,
  ExportInstanceChannel,
  ExportScene,
  ExportFixtureValue,
  ExportCueList,
  ExportCue,
} from '../types/export.js';

const EXPORT_FORMAT_VERSION = '1.0.0';

/**
 * Options for exporting a project
 */
export interface ExportOptions {
  /** Optional description for the export */
  description?: string;
  /** Include only specific entities (defaults to all) */
  include?: {
    fixtures?: boolean;
    scenes?: boolean;
    cueLists?: boolean;
  };
}

/**
 * Service for exporting project data
 */
export class ExportService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Export a complete project to LacyLights native format
   * @param projectId - ID of the project to export
   * @param options - Export options
   * @returns The export data structure
   */
  async exportProject(
    projectId: string,
    options: ExportOptions = {}
  ): Promise<LacyLightsExport> {
    const include = options.include ?? {
      fixtures: true,
      scenes: true,
      cueLists: true,
    };

    // Fetch the project
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new Error(`Project with id ${projectId} not found`);
    }

    // Build reference maps
    const definitionRefMap = new Map<string, string>();
    const modeRefMap = new Map<string, string>();
    const channelRefMap = new Map<string, string>();
    const fixtureRefMap = new Map<string, string>();
    const sceneRefMap = new Map<string, string>();
    const cueListRefMap = new Map<string, string>();

    // Export metadata
    const metadata: ExportMetadata = {
      exportedAt: new Date().toISOString(),
      lacyLightsVersion: '1.0.0', // TODO: Get from package.json
      description: options.description,
    };

    // Export project info
    const exportProject: ExportProject = {
      originalId: project.id,
      name: project.name,
      description: project.description ?? undefined,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };

    // Export fixture definitions and instances
    let exportFixtureDefinitions: ExportFixtureDefinition[] = [];
    let exportFixtureInstances: ExportFixtureInstance[] = [];

    if (include.fixtures !== false) {
      const { definitions, instances } = await this.exportFixtures(
        projectId,
        definitionRefMap,
        modeRefMap,
        channelRefMap,
        fixtureRefMap
      );
      exportFixtureDefinitions = definitions;
      exportFixtureInstances = instances;
    }

    // Export scenes
    let exportScenes: ExportScene[] = [];
    if (include.scenes !== false) {
      exportScenes = await this.exportScenes(projectId, sceneRefMap, fixtureRefMap);
    }

    // Export cue lists
    let exportCueLists: ExportCueList[] = [];
    if (include.cueLists !== false) {
      exportCueLists = await this.exportCueLists(projectId, cueListRefMap, sceneRefMap);
    }

    return {
      version: EXPORT_FORMAT_VERSION,
      metadata,
      project: exportProject,
      fixtureDefinitions: exportFixtureDefinitions,
      fixtureInstances: exportFixtureInstances,
      scenes: exportScenes,
      cueLists: exportCueLists,
    };
  }

  /**
   * Export fixtures (definitions and instances)
   */
  private async exportFixtures(
    projectId: string,
    definitionRefMap: Map<string, string>,
    modeRefMap: Map<string, string>,
    channelRefMap: Map<string, string>,
    fixtureRefMap: Map<string, string>
  ): Promise<{
    definitions: ExportFixtureDefinition[];
    instances: ExportFixtureInstance[];
  }> {
    // Get all fixture instances for this project
    const instances = await this.prisma.fixtureInstance.findMany({
      where: { projectId },
      include: {
        definition: {
          include: {
            modes: {
              include: {
                modeChannels: {
                  include: {
                    channel: true,
                  },
                },
              },
            },
            channels: true,
          },
        },
        channels: true,
      },
      orderBy: { projectOrder: 'asc' },
    });

    // Get unique definitions
    const definitionMap = new Map<string, (typeof instances)[0]['definition']>();
    for (const instance of instances) {
      if (!definitionMap.has(instance.definition.id)) {
        definitionMap.set(instance.definition.id, instance.definition);
      }
    }

    // Export definitions
    const exportDefinitions: ExportFixtureDefinition[] = [];
    for (const [definitionId, definition] of definitionMap) {
      const defRefId = `def-${exportDefinitions.length}`;
      definitionRefMap.set(definitionId, defRefId);

      // Export channels
      const exportChannels: ExportChannelDefinition[] = [];
      for (const channel of definition.channels) {
        const channelRefId = `ch-${exportChannels.length}`;
        channelRefMap.set(channel.id, channelRefId);

        exportChannels.push({
          refId: channelRefId,
          name: channel.name,
          type: channel.type,
          offset: channel.offset,
          minValue: channel.minValue,
          maxValue: channel.maxValue,
          defaultValue: channel.defaultValue,
        });
      }

      // Export modes
      const exportModes: ExportFixtureMode[] = [];
      for (const mode of definition.modes) {
        const modeRefId = `mode-${exportModes.length}`;
        modeRefMap.set(mode.id, modeRefId);

        const exportModeChannels: ExportModeChannel[] = mode.modeChannels.map((mc) => ({
          channelRefId: channelRefMap.get(mc.channelId)!,
          offset: mc.offset,
        }));

        exportModes.push({
          refId: modeRefId,
          name: mode.name,
          shortName: mode.shortName ?? undefined,
          channelCount: mode.channelCount,
          modeChannels: exportModeChannels,
        });
      }

      exportDefinitions.push({
        refId: defRefId,
        manufacturer: definition.manufacturer,
        model: definition.model,
        type: definition.type,
        isBuiltIn: definition.isBuiltIn,
        modes: exportModes,
        channels: exportChannels,
      });
    }

    // Export instances
    const exportInstances: ExportFixtureInstance[] = [];
    for (const instance of instances) {
      const fixtureRefId = `fixture-${exportInstances.length}`;
      fixtureRefMap.set(instance.id, fixtureRefId);

      const exportInstanceChannels: ExportInstanceChannel[] = instance.channels.map((ic) => ({
        name: ic.name,
        type: ic.type,
        offset: ic.offset,
        minValue: ic.minValue,
        maxValue: ic.maxValue,
        defaultValue: ic.defaultValue,
      }));

      exportInstances.push({
        refId: fixtureRefId,
        originalId: instance.id,
        name: instance.name,
        description: instance.description ?? undefined,
        definitionRefId: definitionRefMap.get(instance.definitionId)!,
        modeName: instance.modeName ?? undefined,
        channelCount: instance.channelCount ?? undefined,
        universe: instance.universe,
        startChannel: instance.startChannel,
        tags: instance.tags,
        projectOrder: instance.projectOrder ?? undefined,
        instanceChannels: exportInstanceChannels,
        createdAt: instance.createdAt.toISOString(),
        updatedAt: instance.updatedAt.toISOString(),
      });
    }

    return {
      definitions: exportDefinitions,
      instances: exportInstances,
    };
  }

  /**
   * Export scenes
   */
  private async exportScenes(
    projectId: string,
    sceneRefMap: Map<string, string>,
    fixtureRefMap: Map<string, string>
  ): Promise<ExportScene[]> {
    const scenes = await this.prisma.scene.findMany({
      where: { projectId },
      include: {
        fixtureValues: {
          orderBy: { sceneOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const exportScenes: ExportScene[] = [];
    for (const scene of scenes) {
      const sceneRefId = `scene-${exportScenes.length}`;
      sceneRefMap.set(scene.id, sceneRefId);

      const exportFixtureValues: ExportFixtureValue[] = scene.fixtureValues.map((fv) => ({
        fixtureRefId: fixtureRefMap.get(fv.fixtureId)!,
        channelValues: fv.channelValues,
        sceneOrder: fv.sceneOrder ?? undefined,
      }));

      exportScenes.push({
        refId: sceneRefId,
        originalId: scene.id,
        name: scene.name,
        description: scene.description ?? undefined,
        fixtureValues: exportFixtureValues,
        createdAt: scene.createdAt.toISOString(),
        updatedAt: scene.updatedAt.toISOString(),
      });
    }

    return exportScenes;
  }

  /**
   * Export cue lists
   */
  private async exportCueLists(
    projectId: string,
    cueListRefMap: Map<string, string>,
    sceneRefMap: Map<string, string>
  ): Promise<ExportCueList[]> {
    const cueLists = await this.prisma.cueList.findMany({
      where: { projectId },
      include: {
        cues: {
          orderBy: { cueNumber: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const exportCueLists: ExportCueList[] = [];
    for (const cueList of cueLists) {
      const cueListRefId = `cuelist-${exportCueLists.length}`;
      cueListRefMap.set(cueList.id, cueListRefId);

      const exportCues: ExportCue[] = cueList.cues.map((cue) => ({
        originalId: cue.id,
        name: cue.name,
        cueNumber: cue.cueNumber,
        sceneRefId: sceneRefMap.get(cue.sceneId)!,
        fadeInTime: cue.fadeInTime,
        fadeOutTime: cue.fadeOutTime,
        followTime: cue.followTime ?? undefined,
        easingType: cue.easingType ?? undefined,
        notes: cue.notes ?? undefined,
        createdAt: cue.createdAt.toISOString(),
        updatedAt: cue.updatedAt.toISOString(),
      }));

      exportCueLists.push({
        refId: cueListRefId,
        originalId: cueList.id,
        name: cueList.name,
        description: cueList.description ?? undefined,
        cues: exportCues,
        createdAt: cueList.createdAt.toISOString(),
        updatedAt: cueList.updatedAt.toISOString(),
      });
    }

    return exportCueLists;
  }

  /**
   * Export to JSON string with optional formatting
   * @param exportData - The export data structure
   * @param pretty - Whether to pretty-print the JSON
   * @returns JSON string
   */
  exportToJson(exportData: LacyLightsExport, pretty = true): string {
    return JSON.stringify(exportData, null, pretty ? 2 : 0);
  }
}