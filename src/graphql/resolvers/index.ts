import { projectResolvers } from "./project";
import { fixtureResolvers } from "./fixture";
import { sceneResolvers } from "./scene";
import { cueResolvers } from "./cue";
import { dmxResolvers } from "./dmx";
import { previewResolvers } from "./preview";
import { qlcExportResolvers } from "./qlcExport";
import { fixtureOrderingResolvers } from "./fixtureOrdering";

export const resolvers = {
  Query: {
    ...projectResolvers.Query,
    ...fixtureResolvers.Query,
    ...sceneResolvers.Query,
    ...cueResolvers.Query,
    ...dmxResolvers.Query,
    ...previewResolvers.Query,
    ...qlcExportResolvers.Query,
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
  },
  Subscription: {
    ...dmxResolvers.Subscription,
    ...projectResolvers.Subscription,
    ...previewResolvers.Subscription,
    ...cueResolvers.Subscription,
  },
  // Type resolvers
  ...projectResolvers.types,
  ...fixtureResolvers.types,
  ...sceneResolvers.types,
  ...cueResolvers.types,
  CueListPlaybackStatus: cueResolvers.CueListPlaybackStatus,
};
