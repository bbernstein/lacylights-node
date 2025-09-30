/**
 * LacyLights Native Export Format
 * A normalized JSON format for exporting and importing complete project data
 */

import type { FixtureType, ChannelType, EasingType } from '@prisma/client';

/**
 * Root export format containing all project data
 */
export interface LacyLightsExport {
  /** Format version for backward compatibility */
  version: string;
  /** Export metadata */
  metadata: ExportMetadata;
  /** Project data */
  project: ExportProject;
  /** Fixture definitions used in the project */
  fixtureDefinitions: ExportFixtureDefinition[];
  /** Fixture instances in the project */
  fixtureInstances: ExportFixtureInstance[];
  /** Scenes in the project */
  scenes: ExportScene[];
  /** Cue lists in the project */
  cueLists: ExportCueList[];
}

/**
 * Metadata about the export
 */
export interface ExportMetadata {
  /** When the export was created */
  exportedAt: string;
  /** Version of LacyLights that created the export */
  lacyLightsVersion: string;
  /** Optional user-provided description */
  description?: string;
}

/**
 * Project information
 */
export interface ExportProject {
  /** Original project ID (for reference only) */
  originalId: string;
  /** Project name */
  name: string;
  /** Project description */
  description?: string;
  /** Original creation date */
  createdAt: string;
  /** Last update date */
  updatedAt: string;
}

/**
 * Fixture definition with modes and channels
 */
export interface ExportFixtureDefinition {
  /** Reference ID within this export */
  refId: string;
  /** Manufacturer name */
  manufacturer: string;
  /** Model name */
  model: string;
  /** Fixture type */
  type: FixtureType;
  /** Whether this is a built-in fixture */
  isBuiltIn: boolean;
  /** Available modes */
  modes: ExportFixtureMode[];
  /** Channel definitions */
  channels: ExportChannelDefinition[];
}

/**
 * Fixture mode configuration
 */
export interface ExportFixtureMode {
  /** Reference ID within this export */
  refId: string;
  /** Mode name */
  name: string;
  /** Short name */
  shortName?: string;
  /** Number of channels in this mode */
  channelCount: number;
  /** Channel mapping for this mode */
  modeChannels: ExportModeChannel[];
}

/**
 * Mode-specific channel mapping
 */
export interface ExportModeChannel {
  /** Reference to channel definition */
  channelRefId: string;
  /** Offset within this mode */
  offset: number;
}

/**
 * Channel definition
 */
export interface ExportChannelDefinition {
  /** Reference ID within this export */
  refId: string;
  /** Channel name */
  name: string;
  /** Channel type */
  type: ChannelType;
  /** Base offset (from definition) */
  offset: number;
  /** Minimum value */
  minValue: number;
  /** Maximum value */
  maxValue: number;
  /** Default value */
  defaultValue: number;
}

/**
 * Fixture instance with flattened mode data
 */
export interface ExportFixtureInstance {
  /** Reference ID within this export */
  refId: string;
  /** Original instance ID (for reference) */
  originalId: string;
  /** Instance name */
  name: string;
  /** Instance description */
  description?: string;
  /** Reference to fixture definition */
  definitionRefId: string;
  /** Flattened mode name */
  modeName?: string;
  /** Flattened channel count */
  channelCount?: number;
  /** DMX universe */
  universe: number;
  /** Starting DMX channel */
  startChannel: number;
  /** Tags */
  tags: string[];
  /** Order in project fixture list */
  projectOrder?: number;
  /** Instance-specific channel definitions */
  instanceChannels: ExportInstanceChannel[];
  /** Creation date */
  createdAt: string;
  /** Last update date */
  updatedAt: string;
}

/**
 * Instance-specific channel definition
 */
export interface ExportInstanceChannel {
  /** Channel name */
  name: string;
  /** Channel type */
  type: ChannelType;
  /** Offset within fixture */
  offset: number;
  /** Minimum value */
  minValue: number;
  /** Maximum value */
  maxValue: number;
  /** Default value */
  defaultValue: number;
}

/**
 * Scene with fixture values
 */
export interface ExportScene {
  /** Reference ID within this export */
  refId: string;
  /** Original scene ID (for reference) */
  originalId: string;
  /** Scene name */
  name: string;
  /** Scene description */
  description?: string;
  /** Fixture values in this scene */
  fixtureValues: ExportFixtureValue[];
  /** Creation date */
  createdAt: string;
  /** Last update date */
  updatedAt: string;
}

/**
 * Fixture values within a scene
 */
export interface ExportFixtureValue {
  /** Reference to fixture instance */
  fixtureRefId: string;
  /** Channel values (array of 0-255) */
  channelValues: number[];
  /** Order within scene */
  sceneOrder?: number;
}

/**
 * Cue list with cues
 */
export interface ExportCueList {
  /** Reference ID within this export */
  refId: string;
  /** Original cue list ID (for reference) */
  originalId: string;
  /** Cue list name */
  name: string;
  /** Cue list description */
  description?: string;
  /** Cues in this list */
  cues: ExportCue[];
  /** Creation date */
  createdAt: string;
  /** Last update date */
  updatedAt: string;
}

/**
 * Individual cue
 */
export interface ExportCue {
  /** Original cue ID (for reference) */
  originalId: string;
  /** Cue name */
  name: string;
  /** Cue number */
  cueNumber: number;
  /** Reference to scene */
  sceneRefId: string;
  /** Fade in time (seconds) */
  fadeInTime: number;
  /** Fade out time (seconds) */
  fadeOutTime: number;
  /** Follow time (seconds, null for manual) */
  followTime?: number;
  /** Easing type */
  easingType?: EasingType;
  /** Notes */
  notes?: string;
  /** Creation date */
  createdAt: string;
  /** Last update date */
  updatedAt: string;
}

/**
 * Re-export Prisma enums to avoid duplication
 * These types match the database schema exactly
 */
export type { FixtureType, ChannelType, EasingType };