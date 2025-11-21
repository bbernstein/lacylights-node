/**
 * Type definitions for GraphQL responses in integration tests
 */

// Common entity types
export interface Project {
  id: string;
  name: string;
  description?: string;
}

export interface FixtureDefinition {
  id: string;
  manufacturer: string;
  model: string;
  type: string;
}

export interface FixtureInstance {
  id: string;
  name: string;
  universe: number;
  startChannel: number;
}

export interface Scene {
  id: string;
  name: string;
  projectId: string;
}

export interface CueList {
  id: string;
  name: string;
  projectId: string;
}

export interface Cue {
  id: string;
  cueListId: string;
  sceneId: string;
  cueNumber: number;
  name: string;
}

export interface PreviewSession {
  id: string;
  projectId: string;
  isActive: boolean;
}

export interface CueListPlaybackStatus {
  cueListId: string;
  isPlaying: boolean;
  currentCueIndex: number;
}

export interface Setting {
  key: string;
  value: string;
}

// Mutation response types
export interface CreateProjectResponse {
  createProject: Project;
}

export interface CreateFixtureDefinitionResponse {
  createFixtureDefinition: FixtureDefinition;
}

export interface CreateFixtureInstanceResponse {
  createFixtureInstance: FixtureInstance;
}

export interface CreateSceneResponse {
  createScene: Scene;
}

export interface CreateCueListResponse {
  createCueList: CueList;
}

export interface CreateCueResponse {
  createCue: Cue;
}

export interface StartPreviewSessionResponse {
  startPreviewSession: PreviewSession;
}

export interface SetChannelValueResponse {
  setChannelValue: boolean;
}

export interface StartCueListResponse {
  startCueList: boolean;
}

export interface FadeToBlackResponse {
  fadeToBlack: boolean;
}

export interface UpdateSettingResponse {
  updateSetting: Setting;
}

// Query response types
export interface DmxOutputResponse {
  dmxOutput: number[];
}

export interface CueListPlaybackStatusResponse {
  cueListPlaybackStatus: CueListPlaybackStatus;
}
