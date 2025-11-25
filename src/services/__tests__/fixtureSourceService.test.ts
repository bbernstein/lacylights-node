import { FixtureSourceService, FixtureSource } from "../fixtureSourceService";
import { IFileSystemService } from "../abstractions/FileSystemService";
import { IPathService } from "../abstractions/PathService";
import { IDatabaseService } from "../abstractions/DatabaseService";
import { IHttpService } from "../abstractions/HttpService";
import { IArchiveService } from "../abstractions/ArchiveService";

// Mock the dependent services
jest.mock("../fixtureSetupService", () => ({
  FixtureSetupService: jest.fn().mockImplementation(() => ({
    ensureFixturesPopulated: jest.fn(),
    cleanup: jest.fn(),
  })),
}));

jest.mock("../githubFixtureService", () => ({
  GitHubFixtureService: jest.fn().mockImplementation(() => ({
    ensureFixturesPopulated: jest.fn(),
    cleanup: jest.fn(),
  })),
}));

describe("FixtureSourceService", () => {
  let mockFileSystem: jest.Mocked<IFileSystemService>;
  let mockHttp: jest.Mocked<IHttpService>;
  let mockPathService: jest.Mocked<IPathService>;
  let mockDatabase: jest.Mocked<IDatabaseService>;
  let mockArchive: jest.Mocked<IArchiveService>;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };

    mockFileSystem = {
      existsSync: jest.fn(),
      mkdirSync: jest.fn(),
      createWriteStream: jest.fn(),
      readFileSync: jest.fn(),
      writeFileSync: jest.fn(),
      unlinkSync: jest.fn(),
      readdirSync: jest.fn(),
      statSync: jest.fn(),
      createReadStream: jest.fn(),
    };

    mockHttp = {
      get: jest.fn(),
    };

    mockPathService = {
      join: jest.fn((...args) => args.join("/")),
      resolve: jest.fn((...args) => args.join("/")),
      dirname: jest.fn((p) => p.split("/").slice(0, -1).join("/")),
      basename: jest.fn(),
      extname: jest.fn(),
    };

    mockDatabase = {
      getFixtureCount: jest.fn(),
      createFixtures: jest.fn(),
    };

    mockArchive = {
      extractZip: jest.fn(),
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should use default source 'auto' when not configured", () => {
      delete process.env.FIXTURE_SOURCE;
      delete process.env.FIXTURE_FALLBACK_ENABLED;

      const service = new FixtureSourceService(
        mockFileSystem,
        mockHttp,
        mockPathService,
        mockDatabase,
        mockArchive
      );

      expect(service.getConfiguredSource()).toBe("auto");
      expect(service.isFallbackEnabled()).toBe(true);
    });

    it("should use FIXTURE_SOURCE environment variable", () => {
      process.env.FIXTURE_SOURCE = "github";

      const service = new FixtureSourceService(
        mockFileSystem,
        mockHttp,
        mockPathService,
        mockDatabase,
        mockArchive
      );

      expect(service.getConfiguredSource()).toBe("github");
    });

    it("should respect FIXTURE_FALLBACK_ENABLED environment variable", () => {
      process.env.FIXTURE_FALLBACK_ENABLED = "false";

      const service = new FixtureSourceService(
        mockFileSystem,
        mockHttp,
        mockPathService,
        mockDatabase,
        mockArchive
      );

      expect(service.isFallbackEnabled()).toBe(false);
    });

    it("should allow config override", () => {
      process.env.FIXTURE_SOURCE = "github";

      const service = new FixtureSourceService(
        mockFileSystem,
        mockHttp,
        mockPathService,
        mockDatabase,
        mockArchive,
        { source: "ofl", enableFallback: false }
      );

      expect(service.getConfiguredSource()).toBe("ofl");
      expect(service.isFallbackEnabled()).toBe(false);
    });
  });

  describe("ensureFixturesPopulated", () => {
    it("should skip import when SKIP_FIXTURE_IMPORT is set", async () => {
      process.env.SKIP_FIXTURE_IMPORT = "true";
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      const service = new FixtureSourceService(
        mockFileSystem,
        mockHttp,
        mockPathService,
        mockDatabase,
        mockArchive
      );

      await service.ensureFixturesPopulated();

      expect(consoleSpy).toHaveBeenCalledWith(
        "Skipping fixture import (SKIP_FIXTURE_IMPORT=true)"
      );

      consoleSpy.mockRestore();
    });

    it("should log configured source", async () => {
      process.env.FIXTURE_SOURCE = "github";
      delete process.env.SKIP_FIXTURE_IMPORT;
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();
      jest.spyOn(console, "error").mockImplementation();

      // Mock the internal services to succeed BEFORE creating the service
      const { GitHubFixtureService } = jest.requireMock("../githubFixtureService");
      const { FixtureSetupService } = jest.requireMock("../fixtureSetupService");

      GitHubFixtureService.mockImplementation(() => ({
        ensureFixturesPopulated: jest.fn().mockResolvedValue(undefined),
        cleanup: jest.fn().mockResolvedValue(undefined),
      }));

      FixtureSetupService.mockImplementation(() => ({
        ensureFixturesPopulated: jest.fn().mockResolvedValue(undefined),
        cleanup: jest.fn().mockResolvedValue(undefined),
      }));

      const service = new FixtureSourceService(
        mockFileSystem,
        mockHttp,
        mockPathService,
        mockDatabase,
        mockArchive
      );

      await service.ensureFixturesPopulated();

      expect(consoleSpy).toHaveBeenCalledWith(
        "Fixture source configuration: github (fallback: true)"
      );

      consoleSpy.mockRestore();
    });
  });

  describe("getConfiguredSource", () => {
    it.each<[FixtureSource]>([["ofl"], ["github"], ["auto"]])(
      "should return configured source: %s",
      (source) => {
        const service = new FixtureSourceService(
          mockFileSystem,
          mockHttp,
          mockPathService,
          mockDatabase,
          mockArchive,
          { source }
        );

        expect(service.getConfiguredSource()).toBe(source);
      }
    );
  });

  describe("isFallbackEnabled", () => {
    it("should return true when fallback is enabled", () => {
      const service = new FixtureSourceService(
        mockFileSystem,
        mockHttp,
        mockPathService,
        mockDatabase,
        mockArchive,
        { source: "ofl", enableFallback: true }
      );

      expect(service.isFallbackEnabled()).toBe(true);
    });

    it("should return false when fallback is disabled", () => {
      const service = new FixtureSourceService(
        mockFileSystem,
        mockHttp,
        mockPathService,
        mockDatabase,
        mockArchive,
        { source: "ofl", enableFallback: false }
      );

      expect(service.isFallbackEnabled()).toBe(false);
    });
  });

  describe("cleanup", () => {
    it("should call cleanup on both services", async () => {
      const { FixtureSetupService } = jest.requireMock("../fixtureSetupService");
      const { GitHubFixtureService } = jest.requireMock("../githubFixtureService");

      const oflCleanup = jest.fn().mockResolvedValue(undefined);
      const githubCleanup = jest.fn().mockResolvedValue(undefined);

      FixtureSetupService.mockImplementation(() => ({
        ensureFixturesPopulated: jest.fn(),
        cleanup: oflCleanup,
      }));

      GitHubFixtureService.mockImplementation(() => ({
        ensureFixturesPopulated: jest.fn(),
        cleanup: githubCleanup,
      }));

      const service = new FixtureSourceService(
        mockFileSystem,
        mockHttp,
        mockPathService,
        mockDatabase,
        mockArchive
      );

      await service.cleanup();

      expect(oflCleanup).toHaveBeenCalled();
      expect(githubCleanup).toHaveBeenCalled();
    });
  });
});
