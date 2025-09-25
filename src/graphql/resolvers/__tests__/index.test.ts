// Mock fadeEngine to prevent intervals from starting during tests
jest.mock("../../../services/fadeEngine", () => ({
  fadeEngine: {
    fadeToScene: jest.fn(),
    fadeToBlack: jest.fn(),
    fadeChannels: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    cancelAllFades: jest.fn(),
    isRunning: false,
  },
  EasingType: {
    LINEAR: "LINEAR",
    EASE_IN_OUT_CUBIC: "EASE_IN_OUT_CUBIC",
    EASE_IN_OUT_SINE: "EASE_IN_OUT_SINE",
    EASE_OUT_EXPONENTIAL: "EASE_OUT_EXPONENTIAL",
    BEZIER: "BEZIER",
    S_CURVE: "S_CURVE",
  },
}));

// Mock DMX service to prevent hardware access
jest.mock("../../../services/dmx", () => ({
  dmxService: {
    getCurrentActiveSceneId: jest.fn(),
    setChannelValue: jest.fn(),
    getChannelValue: jest.fn(),
    setActiveScene: jest.fn(),
    clearActiveScene: jest.fn(),
    getUniverseOutput: jest.fn(),
    getAllUniverseOutputs: jest.fn(),
  },
}));

import { resolvers } from "../index";

describe("GraphQL Resolvers Index", () => {
  it("should export Query resolvers", () => {
    expect(resolvers.Query).toBeDefined();
    expect(typeof resolvers.Query).toBe("object");
  });

  it("should export Mutation resolvers", () => {
    expect(resolvers.Mutation).toBeDefined();
    expect(typeof resolvers.Mutation).toBe("object");
  });

  it("should export Subscription resolvers", () => {
    expect(resolvers.Subscription).toBeDefined();
    expect(typeof resolvers.Subscription).toBe("object");
  });

  it("should export CueListPlaybackStatus resolver", () => {
    expect(resolvers.CueListPlaybackStatus).toBeDefined();
    expect(typeof resolvers.CueListPlaybackStatus).toBe("object");
  });

  it("should have project resolvers in Query", () => {
    expect(resolvers.Query.projects).toBeDefined();
    expect(resolvers.Query.project).toBeDefined();
  });

  it("should have fixture resolvers in Query", () => {
    expect(resolvers.Query.fixtureDefinitions).toBeDefined();
    expect(resolvers.Query.fixtureDefinition).toBeDefined();
  });

  it("should have dmx resolvers in Query", () => {
    expect(resolvers.Query.dmxOutput).toBeDefined();
  });

  it("should have mutation resolvers from multiple modules", () => {
    expect(resolvers.Mutation.createProject).toBeDefined();
    expect(resolvers.Mutation.createFixtureInstance).toBeDefined();
    expect(resolvers.Mutation.createScene).toBeDefined();
    expect(resolvers.Mutation.setChannelValue).toBeDefined();
  });

  it("should have subscription resolvers from multiple modules", () => {
    expect(resolvers.Subscription.dmxOutputChanged).toBeDefined();
    expect(resolvers.Subscription.projectUpdated).toBeDefined();
  });

  it("should include type resolvers", () => {
    expect(resolvers.Project).toBeDefined();
    expect(resolvers.FixtureInstance).toBeDefined();
    expect(resolvers.CueListPlaybackStatus).toBeDefined();
  });
});