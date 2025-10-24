import { projectResolvers } from "./project";
import { fixtureResolvers } from "./fixture";
import { sceneResolvers } from "./scene";
import { cueResolvers } from "./cue";
import { dmxResolvers } from "./dmx";
import { previewResolvers } from "./preview";
import { qlcExportResolvers } from "./qlcExport";
import { fixtureOrderingResolvers } from "./fixtureOrdering";
import { exportResolvers } from "./export";
import { settingsResolvers } from "./settings";
import { relationshipResolvers } from "./relationships";
import { searchResolvers } from "./search";

export const resolvers = {
  Query: {
    ...projectResolvers.Query,
    ...fixtureResolvers.Query,
    ...sceneResolvers.Query,
    ...cueResolvers.Query,
    ...dmxResolvers.Query,
    ...previewResolvers.Query,
    ...qlcExportResolvers.Query,
    ...settingsResolvers.Query,
    ...relationshipResolvers.Query,
    ...searchResolvers.Query,
  },
  Mutation: {
    ...projectResolvers.Mutation,
    ...fixtureResolvers.Mutation,
    ...sceneResolvers.Mutation,
    ...cueResolvers.Mutation,
    ...dmxResolvers.Mutation,
    ...previewResolvers.Mutation,
    ...qlcExportResolvers.Mutation,
    ...fixtureOrderingResolvers.Mutation,
    ...exportResolvers.Mutation,
    ...settingsResolvers.Mutation,
  },
  Subscription: {
    ...projectResolvers.Subscription,
    ...previewResolvers.Subscription,
    ...cueResolvers.Subscription,
    ...settingsResolvers.Subscription,
  },
  // Type resolvers
  ...projectResolvers.types,
  ...fixtureResolvers.types,
  ...sceneResolvers.types,
  ...cueResolvers.types,
  CueListPlaybackStatus: cueResolvers.CueListPlaybackStatus,
};
