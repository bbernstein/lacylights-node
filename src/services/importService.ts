/**
 * Import Service
 * Imports project data from LacyLights native JSON format
 */

import { PrismaClient } from '@prisma/client';
import type { LacyLightsExport } from '../types/export.js';

/**
 * Options for importing a project
 */
export interface ImportOptions {
  /** Whether to create a new project or merge into existing */
  mode: 'create' | 'merge';
  /** If mode is 'merge', the target project ID */
  targetProjectId?: string;
  /** Override project name on import */
  projectName?: string;
  /** Handle fixture conflicts: skip, replace, or error */
  fixtureConflictStrategy?: 'skip' | 'replace' | 'error';
  /** Whether to import built-in fixture definitions */
  importBuiltInFixtures?: boolean;
}

/**
 * Result of an import operation
 */
export interface ImportResult {
  /** Created or updated project ID */
  projectId: string;
  /** Statistics about the import */
  stats: {
    fixtureDefinitionsCreated: number;
    fixtureInstancesCreated: number;
    scenesCreated: number;
    cueListsCreated: number;
    cuesCreated: number;
  };
  /** Any warnings or issues during import */
  warnings: string[];
}

/**
 * Service for importing project data
 */
export class ImportService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Import a complete project from LacyLights native format
   * @param exportData - The export data structure
   * @param options - Import options
   * @returns Import result with project ID and statistics
   */
  async importProject(
    exportData: LacyLightsExport,
    options: ImportOptions
  ): Promise<ImportResult> {
    // Validate export format version
    if (exportData.version !== '1.0.0') {
      throw new Error(`Unsupported export format version: ${exportData.version}`);
    }

    const warnings: string[] = [];
    const stats = {
      fixtureDefinitionsCreated: 0,
      fixtureInstancesCreated: 0,
      scenesCreated: 0,
      cueListsCreated: 0,
      cuesCreated: 0,
    };

    // ID mapping from export refs to database IDs
    const definitionIdMap = new Map<string, string>();
    const fixtureIdMap = new Map<string, string>();
    const sceneIdMap = new Map<string, string>();

    let projectId: string;

    if (options.mode === 'create') {
      // Create a new project with unique name
      const baseName = options.projectName ?? exportData.project.name;
      const uniqueName = await this.generateUniqueProjectName(baseName);

      const project = await this.prisma.project.create({
        data: {
          name: uniqueName,
          description: exportData.project.description,
        },
      });
      projectId = project.id;
    } else if (options.mode === 'merge') {
      // Merge into existing project
      if (!options.targetProjectId) {
        throw new Error('targetProjectId is required for merge mode');
      }
      const existingProject = await this.prisma.project.findUnique({
        where: { id: options.targetProjectId },
      });
      if (!existingProject) {
        throw new Error(`Target project ${options.targetProjectId} not found`);
      }
      projectId = options.targetProjectId;
    } else {
      throw new Error(`Invalid import mode: ${options.mode}`);
    }

    // Import fixture definitions
    await this.importFixtureDefinitions(
      exportData,
      definitionIdMap,
      stats,
      warnings,
      options
    );

    // Import fixture instances
    await this.importFixtureInstances(
      exportData,
      projectId,
      definitionIdMap,
      fixtureIdMap,
      stats,
      warnings
    );

    // Import scenes
    await this.importScenes(exportData, projectId, fixtureIdMap, sceneIdMap, stats, warnings);

    // Import cue lists
    await this.importCueLists(exportData, projectId, sceneIdMap, stats, warnings);

    return {
      projectId,
      stats,
      warnings,
    };
  }

  /**
   * Import fixture definitions
   */
  private async importFixtureDefinitions(
    exportData: LacyLightsExport,
    definitionIdMap: Map<string, string>,
    stats: ImportResult['stats'],
    warnings: string[],
    options: ImportOptions
  ): Promise<void> {
    for (const exportDef of exportData.fixtureDefinitions) {
      // Skip built-in fixtures if requested
      if (exportDef.isBuiltIn && options.importBuiltInFixtures === false) {
        warnings.push(
          `Skipped built-in fixture: ${exportDef.manufacturer} ${exportDef.model}`
        );
        continue;
      }

      // Check if definition already exists
      const existing = await this.prisma.fixtureDefinition.findUnique({
        where: {
          manufacturer_model: {
            manufacturer: exportDef.manufacturer,
            model: exportDef.model,
          },
        },
      });

      if (existing) {
        if (options.fixtureConflictStrategy === 'skip') {
          definitionIdMap.set(exportDef.refId, existing.id);
          warnings.push(`Skipped existing fixture: ${exportDef.manufacturer} ${exportDef.model}`);
          continue;
        } else if (options.fixtureConflictStrategy === 'error') {
          throw new Error(
            `Fixture definition already exists: ${exportDef.manufacturer} ${exportDef.model}`
          );
        } else if (options.fixtureConflictStrategy === 'replace') {
          // Delete existing and recreate
          await this.prisma.fixtureDefinition.delete({ where: { id: existing.id } });
        }
      }

      // Create fixture definition with channels and modes
      const channelIdMap = new Map<string, string>();

      const definition = await this.prisma.fixtureDefinition.create({
        data: {
          manufacturer: exportDef.manufacturer,
          model: exportDef.model,
          type: exportDef.type,
          isBuiltIn: exportDef.isBuiltIn,
          channels: {
            create: exportDef.channels.map((ch) => ({
              name: ch.name,
              type: ch.type,
              offset: ch.offset,
              minValue: ch.minValue,
              maxValue: ch.maxValue,
              defaultValue: ch.defaultValue,
            })),
          },
        },
        include: {
          channels: true,
        },
      });

      // Map channel ref IDs to database IDs
      for (let i = 0; i < exportDef.channels.length; i++) {
        channelIdMap.set(exportDef.channels[i].refId, definition.channels[i].id);
      }

      // Create modes with mode channels
      for (const exportMode of exportDef.modes) {
        await this.prisma.fixtureMode.create({
          data: {
            definitionId: definition.id,
            name: exportMode.name,
            shortName: exportMode.shortName,
            channelCount: exportMode.channelCount,
            modeChannels: {
              create: exportMode.modeChannels.map((mc) => ({
                channelId: channelIdMap.get(mc.channelRefId)!,
                offset: mc.offset,
              })),
            },
          },
        });
      }

      definitionIdMap.set(exportDef.refId, definition.id);
      stats.fixtureDefinitionsCreated++;
    }
  }

  /**
   * Import fixture instances
   */
  private async importFixtureInstances(
    exportData: LacyLightsExport,
    projectId: string,
    definitionIdMap: Map<string, string>,
    fixtureIdMap: Map<string, string>,
    stats: ImportResult['stats'],
    warnings: string[]
  ): Promise<void> {
    for (const exportFixture of exportData.fixtureInstances) {
      const definitionId = definitionIdMap.get(exportFixture.definitionRefId);
      if (!definitionId) {
        warnings.push(`Skipped fixture instance: ${exportFixture.name} (missing definition)`);
        continue;
      }

      // Check for DMX address conflicts
      const existing = await this.prisma.fixtureInstance.findFirst({
        where: {
          projectId,
          universe: exportFixture.universe,
          startChannel: exportFixture.startChannel,
        },
      });

      if (existing) {
        warnings.push(
          `DMX address conflict: ${exportFixture.name} at universe ${exportFixture.universe}, channel ${exportFixture.startChannel}`
        );
        // Skip this fixture to avoid conflicts
        continue;
      }

      const fixture = await this.prisma.fixtureInstance.create({
        data: {
          projectId,
          definitionId,
          name: exportFixture.name,
          description: exportFixture.description,
          manufacturer: exportFixture.definitionRefId, // Will be denormalized via trigger/hook
          model: exportFixture.definitionRefId,
          modeName: exportFixture.modeName,
          channelCount: exportFixture.channelCount,
          universe: exportFixture.universe,
          startChannel: exportFixture.startChannel,
          tags: exportFixture.tags,
          projectOrder: exportFixture.projectOrder,
          channels: {
            create: exportFixture.instanceChannels.map((ic) => ({
              name: ic.name,
              type: ic.type,
              offset: ic.offset,
              minValue: ic.minValue,
              maxValue: ic.maxValue,
              defaultValue: ic.defaultValue,
            })),
          },
        },
      });

      fixtureIdMap.set(exportFixture.refId, fixture.id);
      stats.fixtureInstancesCreated++;
    }
  }

  /**
   * Import scenes
   */
  private async importScenes(
    exportData: LacyLightsExport,
    projectId: string,
    fixtureIdMap: Map<string, string>,
    sceneIdMap: Map<string, string>,
    stats: ImportResult['stats'],
    warnings: string[]
  ): Promise<void> {
    for (const exportScene of exportData.scenes) {
      // Filter out fixture values for fixtures that weren't imported
      const fixtureValues = exportScene.fixtureValues.filter((fv) => {
        const fixtureId = fixtureIdMap.get(fv.fixtureRefId);
        if (!fixtureId) {
          warnings.push(
            `Skipped fixture value in scene ${exportScene.name} (missing fixture ${fv.fixtureRefId})`
          );
          return false;
        }
        return true;
      });

      const scene = await this.prisma.scene.create({
        data: {
          projectId,
          name: exportScene.name,
          description: exportScene.description,
          fixtureValues: {
            create: fixtureValues.map((fv) => ({
              fixtureId: fixtureIdMap.get(fv.fixtureRefId)!,
              channelValues: fv.channelValues,
              sceneOrder: fv.sceneOrder,
            })),
          },
        },
      });

      sceneIdMap.set(exportScene.refId, scene.id);
      stats.scenesCreated++;
    }
  }

  /**
   * Import cue lists
   */
  private async importCueLists(
    exportData: LacyLightsExport,
    projectId: string,
    sceneIdMap: Map<string, string>,
    stats: ImportResult['stats'],
    warnings: string[]
  ): Promise<void> {
    for (const exportCueList of exportData.cueLists) {
      // Filter out cues for scenes that weren't imported
      const cues = exportCueList.cues.filter((cue) => {
        const sceneId = sceneIdMap.get(cue.sceneRefId);
        if (!sceneId) {
          warnings.push(
            `Skipped cue ${cue.name} in cue list ${exportCueList.name} (missing scene)`
          );
          return false;
        }
        return true;
      });

      await this.prisma.cueList.create({
        data: {
          projectId,
          name: exportCueList.name,
          description: exportCueList.description,
          cues: {
            create: cues.map((cue) => ({
              name: cue.name,
              cueNumber: cue.cueNumber,
              sceneId: sceneIdMap.get(cue.sceneRefId)!,
              fadeInTime: cue.fadeInTime,
              fadeOutTime: cue.fadeOutTime,
              followTime: cue.followTime,
              easingType: cue.easingType,
              notes: cue.notes,
            })),
          },
        },
      });

      stats.cueListsCreated++;
      stats.cuesCreated += cues.length;
    }
  }

  /**
   * Generate a unique project name by adding/incrementing a number suffix
   * @param baseName - The base name to make unique
   * @returns A unique project name
   */
  private async generateUniqueProjectName(baseName: string): Promise<string> {
    // Check if base name already exists
    const existingWithBaseName = await this.prisma.project.findFirst({
      where: { name: baseName },
    });

    if (!existingWithBaseName) {
      return baseName;
    }

    // Extract any existing number suffix
    const match = baseName.match(/^(.+?)(?:\s+\((\d+)\))?$/);
    const nameWithoutSuffix = match ? match[1] : baseName;
    const startingNumber = match && match[2] ? parseInt(match[2], 10) : 1;

    // Find all projects with similar names
    const similarProjects = await this.prisma.project.findMany({
      where: {
        name: {
          startsWith: nameWithoutSuffix,
        },
      },
      select: { name: true },
    });

    // Extract all numbers used in similar names
    const usedNumbers = new Set<number>();
    const pattern = new RegExp(`^${this.escapeRegex(nameWithoutSuffix)}\\s+\\((\\d+)\\)$`);

    for (const project of similarProjects) {
      if (project.name === nameWithoutSuffix) {
        usedNumbers.add(0); // Base name without number
      } else {
        const numberMatch = project.name.match(pattern);
        if (numberMatch) {
          usedNumbers.add(parseInt(numberMatch[1], 10));
        }
      }
    }

    // Find the next available number
    let nextNumber = startingNumber;
    while (usedNumbers.has(nextNumber)) {
      nextNumber++;
    }

    return `${nameWithoutSuffix} (${nextNumber})`;
  }

  /**
   * Escape special regex characters in a string
   * @param str - String to escape
   * @returns Escaped string
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Parse JSON export data
   * @param jsonString - JSON string to parse
   * @returns Parsed export data
   */
  parseJson(jsonString: string): LacyLightsExport {
    try {
      const data = JSON.parse(jsonString);

      // Basic validation
      if (!data.version || !data.project || !data.metadata) {
        throw new Error('Invalid export format: missing required fields');
      }

      return data as LacyLightsExport;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to parse export JSON: ${error.message}`);
      }
      throw error;
    }
  }
}