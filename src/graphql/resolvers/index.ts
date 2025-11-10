import { projectResolvers } from "./project";
import { fixtureResolvers } from "./fixture";
import { sceneResolvers } from "./scene";
import { sceneBoardResolvers } from "./sceneBoard";
import { cueResolvers } from "./cue";
import { dmxResolvers } from "./dmx";
import { previewResolvers } from "./preview";
import { qlcExportResolvers } from "./qlcExport";
import { fixtureOrderingResolvers } from "./fixtureOrdering";
import { exportResolvers } from "./export";
import { settingsResolvers } from "./settings";
import { relationshipResolvers } from "./relationships";
import { searchResolvers } from "./search";
import { wifiResolvers } from "./wifi";

export const resolvers = {
  Query: {
    ...projectResolvers.Query,
    ...fixtureResolvers.Query,
    ...sceneResolvers.Query,
    ...sceneBoardResolvers.Query,
    ...cueResolvers.Query,
    ...dmxResolvers.Query,
    ...previewResolvers.Query,
    ...qlcExportResolvers.Query,
    ...settingsResolvers.Query,
    ...relationshipResolvers.Query,
    ...searchResolvers.Query,
    ...wifiResolvers.Query,
  },
  Mutation: {
    ...projectResolvers.Mutation,
    ...fixtureResolvers.Mutation,
    ...sceneResolvers.Mutation,
    ...sceneBoardResolvers.Mutation,
    ...cueResolvers.Mutation,
    ...dmxResolvers.Mutation,
    ...previewResolvers.Mutation,
    ...qlcExportResolvers.Mutation,
    ...fixtureOrderingResolvers.Mutation,
    ...exportResolvers.Mutation,
    ...settingsResolvers.Mutation,
    ...wifiResolvers.Mutation,
  },
  Subscription: {
    ...projectResolvers.Subscription,
    ...previewResolvers.Subscription,
    ...cueResolvers.Subscription,
    ...settingsResolvers.Subscription,
    ...wifiResolvers.Subscription,
  },
  // Type resolvers - merge Project type resolvers
  Project: {
    ...projectResolvers.types?.Project,
    ...sceneBoardResolvers.types?.Project,
  },
  ...fixtureResolvers.types,
  ...sceneResolvers.types,
  SceneBoard: sceneBoardResolvers.types?.SceneBoard,
  SceneBoardButton: sceneBoardResolvers.types?.SceneBoardButton,
  ...cueResolvers.types,
  CueListPlaybackStatus: cueResolvers.CueListPlaybackStatus,
};
