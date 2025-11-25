import { FixtureSourceService, FixtureSource } from "../fixtureSourceService";
import { IFileSystemService } from "../abstractions/FileSystemService";
import { IPathService } from "../abstractions/PathService";
import { IDatabaseService } from "../abstractions/DatabaseService";
import { IHttpService } from "../abstractions/HttpService";
import { IArchiveService } from "../abstractions/ArchiveService";

// Mock the dependent services
jest.mock("../fixtureSetupService", () => ({
  FixtureSetupService: jest.fn().mockImplementation(() => ({
    ensureFixturesPopulated: jest.fn().mockResolvedValue(undefined),
    cleanup: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("../githubFixtureService", () => ({
  GitHubFixtureService: jest.fn().mockImplementation(() => ({
    ensureFixturesPopulated: jest.fn().mockResolvedValue(undefined),
    cleanup: jest.fn().mockResolvedValue(undefined),
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
    delete process.env.FIXTURE_SOURCE;
    delete process.env.FIXTURE_FALLBACK_ENABLED;
    delete process.env.SKIP_FIXTURE_IMPORT;

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

    // Reset mocks
    const { FixtureSetupService } = jest.requireMock("../fixtureSetupService");
    const { GitHubFixtureService } = jest.requireMock("../githubFixtureService");

    FixtureSetupService.mockImplementation(() => ({
      ensureFixturesPopulated: jest.fn().mockResolvedValue(undefined),
      cleanup: jest.fn().mockResolvedValue(undefined),
    }));

    GitHubFixtureService.mockImplementation(() => ({
      ensureFixturesPopulated: jest.fn().mockResolvedValue(undefined),
      cleanup: jest.fn().mockResolvedValue(undefined),
    }));
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should use default source 'auto' when not configured", () => {
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

    it("should use FIXTURE_SOURCE=ofl from environment", () => {
      process.env.FIXTURE_SOURCE = "ofl";

      const service = new FixtureSourceService(
        mockFileSystem,
        mockHttp,
        mockPathService,
        mockDatabase,
        mockArchive
      );

      expect(service.getConfiguredSource()).toBe("ofl");
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

    it("should warn and fallback to auto for invalid FIXTURE_SOURCE", () => {
      process.env.FIXTURE_SOURCE = "invalid_source";
      const warnSpy = jest.spyOn(console, "warn").mockImplementation();

      const service = new FixtureSourceService(
        mockFileSystem,
        mockHttp,
        mockPathService,
        mockDatabase,
        mockArchive
      );

      expect(service.getConfiguredSource()).toBe("auto");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid FIXTURE_SOURCE "invalid_source"')
      );

      warnSpy.mockRestore();
    });
  });

  describe("static create", () => {
    it("should create a service with default dependencies", () => {
      const createdService = FixtureSourceService.create();
      expect(createdService).toBeInstanceOf(FixtureSourceService);
    });
  });

  describe("static ensureFixturesPopulated", () => {
    it("should create service and call ensureFixturesPopulated", async () => {
      process.env.SKIP_FIXTURE_IMPORT = "true";
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      await FixtureSourceService.ensureFixturesPopulated();

      expect(consoleSpy).toHaveBeenCalledWith(
        "Skipping fixture import (SKIP_FIXTURE_IMPORT=true)"
      );

      consoleSpy.mockRestore();
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

    it("should log configured source - github", async () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      const service = new FixtureSourceService(
        mockFileSystem,
        mockHttp,
        mockPathService,
        mockDatabase,
        mockArchive,
        { source: "github" }
      );

      await service.ensureFixturesPopulated();

      expect(consoleSpy).toHaveBeenCalledWith(
        "Fixture source configuration: github (fallback: true)"
      );

      consoleSpy.mockRestore();
    });

    it("should use OFL source when configured", async () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      const service = new FixtureSourceService(
        mockFileSystem,
        mockHttp,
        mockPathService,
        mockDatabase,
        mockArchive,
        { source: "ofl" }
      );

      await service.ensureFixturesPopulated();

      expect(consoleSpy).toHaveBeenCalledWith(
        "Attempting to download fixtures from OFL website..."
      );

      consoleSpy.mockRestore();
    });

    it("should use auto source by default", async () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      const service = new FixtureSourceService(
        mockFileSystem,
        mockHttp,
        mockPathService,
        mockDatabase,
        mockArchive,
        { source: "auto" }
      );

      await service.ensureFixturesPopulated();

      expect(consoleSpy).toHaveBeenCalledWith(
        "Auto mode: Attempting to download fixtures from GitHub..."
      );

      consoleSpy.mockRestore();
    });
  });

  describe("OFL source with fallback", () => {
    it("should fall back to GitHub when OFL fails", async () => {
      const { FixtureSetupService } = jest.requireMock("../fixtureSetupService");
      const { GitHubFixtureService } = jest.requireMock("../githubFixtureService");

      const oflMock = jest.fn().mockRejectedValue(new Error("OFL failed"));
      const githubMock = jest.fn().mockResolvedValue(undefined);

      FixtureSetupService.mockImplementation(() => ({
        ensureFixturesPopulated: oflMock,
        cleanup: jest.fn(),
      }));

      GitHubFixtureService.mockImplementation(() => ({
        ensureFixturesPopulated: githubMock,
        cleanup: jest.fn(),
      }));

      const consoleSpy = jest.spyOn(console, "log").mockImplementation();
      jest.spyOn(console, "error").mockImplementation();

      const service = new FixtureSourceService(
        mockFileSystem,
        mockHttp,
        mockPathService,
        mockDatabase,
        mockArchive,
        { source: "ofl", enableFallback: true }
      );

      await service.ensureFixturesPopulated();

      expect(consoleSpy).toHaveBeenCalledWith("Falling back to GitHub repository...");

      consoleSpy.mockRestore();
    });

    it("should throw error when OFL fails and fallback disabled", async () => {
      const { FixtureSetupService } = jest.requireMock("../fixtureSetupService");

      FixtureSetupService.mockImplementation(() => ({
        ensureFixturesPopulated: jest.fn().mockRejectedValue(new Error("OFL failed")),
        cleanup: jest.fn(),
      }));

      jest.spyOn(console, "log").mockImplementation();
      jest.spyOn(console, "error").mockImplementation();

      const service = new FixtureSourceService(
        mockFileSystem,
        mockHttp,
        mockPathService,
        mockDatabase,
        mockArchive,
        { source: "ofl", enableFallback: false }
      );

      await expect(service.ensureFixturesPopulated()).rejects.toThrow("OFL failed");
    });
  });

  describe("GitHub source with fallback", () => {
    it("should fall back to OFL when GitHub fails", async () => {
      const { FixtureSetupService } = jest.requireMock("../fixtureSetupService");
      const { GitHubFixtureService } = jest.requireMock("../githubFixtureService");

      const oflMock = jest.fn().mockResolvedValue(undefined);
      const githubMock = jest.fn().mockRejectedValue(new Error("GitHub failed"));

      FixtureSetupService.mockImplementation(() => ({
        ensureFixturesPopulated: oflMock,
        cleanup: jest.fn(),
      }));

      GitHubFixtureService.mockImplementation(() => ({
        ensureFixturesPopulated: githubMock,
        cleanup: jest.fn(),
      }));

      const consoleSpy = jest.spyOn(console, "log").mockImplementation();
      jest.spyOn(console, "error").mockImplementation();

      const service = new FixtureSourceService(
        mockFileSystem,
        mockHttp,
        mockPathService,
        mockDatabase,
        mockArchive,
        { source: "github", enableFallback: true }
      );

      await service.ensureFixturesPopulated();

      expect(consoleSpy).toHaveBeenCalledWith("Falling back to OFL website...");

      consoleSpy.mockRestore();
    });

    it("should throw error when GitHub fails and fallback disabled", async () => {
      const { GitHubFixtureService } = jest.requireMock("../githubFixtureService");

      GitHubFixtureService.mockImplementation(() => ({
        ensureFixturesPopulated: jest.fn().mockRejectedValue(new Error("GitHub failed")),
        cleanup: jest.fn(),
      }));

      jest.spyOn(console, "log").mockImplementation();
      jest.spyOn(console, "error").mockImplementation();

      const service = new FixtureSourceService(
        mockFileSystem,
        mockHttp,
        mockPathService,
        mockDatabase,
        mockArchive,
        { source: "github", enableFallback: false }
      );

      await expect(service.ensureFixturesPopulated()).rejects.toThrow("GitHub failed");
    });
  });

  describe("Auto mode with fallback", () => {
    it("should try GitHub first then fall back to OFL", async () => {
      const { FixtureSetupService } = jest.requireMock("../fixtureSetupService");
      const { GitHubFixtureService } = jest.requireMock("../githubFixtureService");

      const oflMock = jest.fn().mockResolvedValue(undefined);
      const githubMock = jest.fn().mockRejectedValue(new Error("GitHub failed"));

      FixtureSetupService.mockImplementation(() => ({
        ensureFixturesPopulated: oflMock,
        cleanup: jest.fn(),
      }));

      GitHubFixtureService.mockImplementation(() => ({
        ensureFixturesPopulated: githubMock,
        cleanup: jest.fn(),
      }));

      const consoleSpy = jest.spyOn(console, "log").mockImplementation();
      jest.spyOn(console, "error").mockImplementation();

      const service = new FixtureSourceService(
        mockFileSystem,
        mockHttp,
        mockPathService,
        mockDatabase,
        mockArchive,
        { source: "auto" }
      );

      await service.ensureFixturesPopulated();

      expect(consoleSpy).toHaveBeenCalledWith("Attempting OFL website as fallback...");

      consoleSpy.mockRestore();
    });

    it("should throw combined error when both sources fail", async () => {
      const { FixtureSetupService } = jest.requireMock("../fixtureSetupService");
      const { GitHubFixtureService } = jest.requireMock("../githubFixtureService");

      FixtureSetupService.mockImplementation(() => ({
        ensureFixturesPopulated: jest.fn().mockRejectedValue(new Error("OFL failed")),
        cleanup: jest.fn(),
      }));

      GitHubFixtureService.mockImplementation(() => ({
        ensureFixturesPopulated: jest.fn().mockRejectedValue(new Error("GitHub failed")),
        cleanup: jest.fn(),
      }));

      jest.spyOn(console, "log").mockImplementation();
      jest.spyOn(console, "error").mockImplementation();

      const service = new FixtureSourceService(
        mockFileSystem,
        mockHttp,
        mockPathService,
        mockDatabase,
        mockArchive,
        { source: "auto" }
      );

      await expect(service.ensureFixturesPopulated()).rejects.toThrow(
        "Failed to download fixtures from both sources"
      );
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
