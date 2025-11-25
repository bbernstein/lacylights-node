import { GitHubFixtureService, GitHubFixtureConfig } from "../githubFixtureService";
import { IFileSystemService } from "../abstractions/FileSystemService";
import { IPathService } from "../abstractions/PathService";
import { IDatabaseService } from "../abstractions/DatabaseService";
import { ChannelType, FixtureType } from "../../types/enums";

// Mock https module
jest.mock("https", () => ({
  get: jest.fn(),
}));

describe("GitHubFixtureService", () => {
  let mockFileSystem: jest.Mocked<IFileSystemService>;
  let mockPathService: jest.Mocked<IPathService>;
  let mockDatabase: jest.Mocked<IDatabaseService>;
  let service: GitHubFixtureService;

  beforeEach(() => {
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

    mockPathService = {
      join: jest.fn((...args) => args.join("/")),
      resolve: jest.fn((...args) => args.join("/")),
      dirname: jest.fn((p) => p.split("/").slice(0, -1).join("/")),
      basename: jest.fn((path, ext) => {
        const parts = path.split("/");
        const filename = parts[parts.length - 1];
        return ext ? filename.replace(ext, "") : filename;
      }),
      extname: jest.fn((p) => {
        const parts = p.split(".");
        return parts.length > 1 ? "." + parts[parts.length - 1] : "";
      }),
    };

    mockDatabase = {
      getFixtureCount: jest.fn(),
      createFixtures: jest.fn(),
    };

    service = new GitHubFixtureService(
      mockFileSystem,
      mockPathService,
      mockDatabase,
      {
        tempDir: "/tmp/test",
        oflJsonPath: "/tmp/test/ofl-github.json",
      }
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should use default configuration when none provided", () => {
      const defaultService = new GitHubFixtureService(
        mockFileSystem,
        mockPathService,
        mockDatabase
      );

      const config = defaultService.testConfig;
      expect(config.owner).toBe("OpenLightingProject");
      expect(config.repo).toBe("open-fixture-library");
      expect(config.branch).toBe("master");
      expect(config.fixturesPath).toBe("fixtures");
    });

    it("should merge custom configuration with defaults", () => {
      const customConfig: Partial<GitHubFixtureConfig> = {
        owner: "custom-owner",
        requestTimeoutMs: 60000,
      };

      const customService = new GitHubFixtureService(
        mockFileSystem,
        mockPathService,
        mockDatabase,
        customConfig
      );

      const config = customService.testConfig;
      expect(config.owner).toBe("custom-owner");
      expect(config.repo).toBe("open-fixture-library"); // Default
      expect(config.requestTimeoutMs).toBe(60000);
    });
  });

  describe("ensureFixturesPopulated", () => {
    it("should skip import when SKIP_FIXTURE_IMPORT is set", async () => {
      process.env.SKIP_FIXTURE_IMPORT = "true";
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      await service.ensureFixturesPopulated();

      expect(consoleSpy).toHaveBeenCalledWith(
        "Skipping fixture import (SKIP_FIXTURE_IMPORT=true)"
      );
      expect(mockDatabase.getFixtureCount).not.toHaveBeenCalled();

      delete process.env.SKIP_FIXTURE_IMPORT;
      consoleSpy.mockRestore();
    });

    it("should not download if fixtures already exist", async () => {
      mockDatabase.getFixtureCount.mockResolvedValue(100);
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      await service.ensureFixturesPopulated();

      expect(mockDatabase.getFixtureCount).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        "Found 100 fixture definitions in database"
      );

      consoleSpy.mockRestore();
    });

    it("should throw error on database failure", async () => {
      mockDatabase.getFixtureCount.mockRejectedValue(
        new Error("Database connection failed")
      );

      await expect(service.ensureFixturesPopulated()).rejects.toThrow(
        "Database connection failed"
      );
    });
  });

  describe("formatManufacturerName", () => {
    it("should convert slug to proper name", () => {
      expect(service.formatManufacturerName("chauvet-dj")).toBe("Chauvet DJ");
      expect(service.formatManufacturerName("american-dj")).toBe("American DJ");
      expect(service.formatManufacturerName("martin")).toBe("Martin");
    });

    it("should handle special acronyms", () => {
      expect(service.formatManufacturerName("led-lights")).toBe("LED Lights");
      expect(service.formatManufacturerName("dmx-pro")).toBe("DMX Pro");
      expect(service.formatManufacturerName("rgb-systems")).toBe("RGB Systems");
      expect(service.formatManufacturerName("usa-lighting")).toBe("USA Lighting");
      expect(service.formatManufacturerName("uk-stage")).toBe("UK Stage");
    });
  });

  describe("mapChannelType", () => {
    it("should map Intensity to INTENSITY", () => {
      expect(service.mapChannelType({ type: "Intensity" })).toBe(
        ChannelType.INTENSITY
      );
    });

    it("should map ColorIntensity with colors", () => {
      expect(
        service.mapChannelType({ type: "ColorIntensity", color: "Red" })
      ).toBe(ChannelType.RED);
      expect(
        service.mapChannelType({ type: "ColorIntensity", color: "Green" })
      ).toBe(ChannelType.GREEN);
      expect(
        service.mapChannelType({ type: "ColorIntensity", color: "Blue" })
      ).toBe(ChannelType.BLUE);
      expect(
        service.mapChannelType({ type: "ColorIntensity", color: "White" })
      ).toBe(ChannelType.WHITE);
      expect(
        service.mapChannelType({ type: "ColorIntensity", color: "Amber" })
      ).toBe(ChannelType.AMBER);
      expect(
        service.mapChannelType({ type: "ColorIntensity", color: "UV" })
      ).toBe(ChannelType.UV);
    });

    it("should map position channels", () => {
      expect(service.mapChannelType({ type: "Pan" })).toBe(ChannelType.PAN);
      expect(service.mapChannelType({ type: "Tilt" })).toBe(ChannelType.TILT);
    });

    it("should map other channel types", () => {
      expect(service.mapChannelType({ type: "Zoom" })).toBe(ChannelType.ZOOM);
      expect(service.mapChannelType({ type: "Focus" })).toBe(ChannelType.FOCUS);
      expect(service.mapChannelType({ type: "Iris" })).toBe(ChannelType.IRIS);
      expect(service.mapChannelType({ type: "Gobo" })).toBe(ChannelType.GOBO);
      expect(service.mapChannelType({ type: "ColorWheel" })).toBe(
        ChannelType.COLOR_WHEEL
      );
      expect(service.mapChannelType({ type: "Effect" })).toBe(
        ChannelType.EFFECT
      );
      expect(service.mapChannelType({ type: "ShutterStrobe" })).toBe(
        ChannelType.STROBE
      );
      expect(service.mapChannelType({ type: "Maintenance" })).toBe(
        ChannelType.MACRO
      );
    });

    it("should return OTHER for unknown types", () => {
      expect(service.mapChannelType({ type: "Unknown" })).toBe(ChannelType.OTHER);
    });
  });

  describe("mapFixtureType", () => {
    it("should map moving head fixtures", () => {
      expect(service.mapFixtureType(["Moving Head"])).toBe(
        FixtureType.MOVING_HEAD
      );
      expect(service.mapFixtureType(["Scanner"])).toBe(FixtureType.MOVING_HEAD);
    });

    it("should map strobe fixtures", () => {
      expect(service.mapFixtureType(["Strobe"])).toBe(FixtureType.STROBE);
      expect(service.mapFixtureType(["Blinder"])).toBe(FixtureType.STROBE);
    });

    it("should map dimmer fixtures", () => {
      expect(service.mapFixtureType(["Dimmer"])).toBe(FixtureType.DIMMER);
    });

    it("should map LED PAR fixtures", () => {
      expect(service.mapFixtureType(["Color Changer"])).toBe(FixtureType.LED_PAR);
      expect(service.mapFixtureType(["PAR"])).toBe(FixtureType.LED_PAR);
      expect(service.mapFixtureType(["Wash"])).toBe(FixtureType.LED_PAR);
    });

    it("should return OTHER for unknown types", () => {
      expect(service.mapFixtureType(["Unknown"])).toBe(FixtureType.OTHER);
      expect(service.mapFixtureType([])).toBe(FixtureType.OTHER);
    });
  });

  describe("getDefaultValue", () => {
    it("should return dmxRange start if provided", () => {
      expect(service.getDefaultValue({ type: "Intensity", dmxRange: [10, 255] })).toBe(10);
    });

    it("should return 0 for Intensity/ColorIntensity without dmxRange", () => {
      expect(service.getDefaultValue({ type: "Intensity" })).toBe(0);
      expect(service.getDefaultValue({ type: "ColorIntensity" })).toBe(0);
    });

    it("should return 128 for other types without dmxRange", () => {
      expect(service.getDefaultValue({ type: "Pan" })).toBe(128);
      expect(service.getDefaultValue({ type: "Gobo" })).toBe(128);
    });
  });

  describe("getMinMaxValues", () => {
    it("should return dmxRange values if provided", () => {
      expect(service.getMinMaxValues({ type: "Intensity", dmxRange: [10, 200] })).toEqual({
        min: 10,
        max: 200,
      });
    });

    it("should return 0-255 if no dmxRange", () => {
      expect(service.getMinMaxValues({ type: "Intensity" })).toEqual({
        min: 0,
        max: 255,
      });
    });
  });

  describe("cleanup", () => {
    it("should delete cache file if it exists", async () => {
      mockFileSystem.existsSync.mockReturnValue(true);
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      await service.cleanup();

      expect(mockFileSystem.unlinkSync).toHaveBeenCalledWith(
        "/tmp/test/ofl-github.json"
      );
      expect(consoleSpy).toHaveBeenCalledWith("Cleaned up GitHub fixture cache file");

      consoleSpy.mockRestore();
    });

    it("should not try to delete if file doesn't exist", async () => {
      mockFileSystem.existsSync.mockReturnValue(false);

      await service.cleanup();

      expect(mockFileSystem.unlinkSync).not.toHaveBeenCalled();
    });

    it("should handle errors during cleanup", async () => {
      mockFileSystem.existsSync.mockReturnValue(true);
      mockFileSystem.unlinkSync.mockImplementation(() => {
        throw new Error("Permission denied");
      });
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      await service.cleanup();

      expect(consoleSpy).toHaveBeenCalledWith(
        "Error during cleanup:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });
});
