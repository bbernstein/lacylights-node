import { GitHubFixtureService, GitHubFixtureConfig } from "../githubFixtureService";
import { IFileSystemService } from "../abstractions/FileSystemService";
import { IPathService } from "../abstractions/PathService";
import { IDatabaseService } from "../abstractions/DatabaseService";
import { ChannelType, FixtureType } from "../../types/enums";
import https from "https";
import { EventEmitter } from "events";

// Mock https module
jest.mock("https");

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
    delete process.env.SKIP_FIXTURE_IMPORT;
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
      expect(config.requestTimeoutMs).toBe(30000);
      expect(config.maxConcurrentRequests).toBe(5);
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
      expect(config.repo).toBe("open-fixture-library");
      expect(config.requestTimeoutMs).toBe(60000);
    });
  });

  describe("static create", () => {
    it("should create a service with default dependencies", () => {
      const createdService = GitHubFixtureService.create();
      expect(createdService).toBeInstanceOf(GitHubFixtureService);
    });
  });

  describe("static ensureFixturesPopulated", () => {
    it("should create service and call ensureFixturesPopulated", async () => {
      process.env.SKIP_FIXTURE_IMPORT = "true";
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      await GitHubFixtureService.ensureFixturesPopulated();

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

      await service.ensureFixturesPopulated();

      expect(consoleSpy).toHaveBeenCalledWith(
        "Skipping fixture import (SKIP_FIXTURE_IMPORT=true)"
      );
      expect(mockDatabase.getFixtureCount).not.toHaveBeenCalled();

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
      jest.spyOn(console, "error").mockImplementation();

      await expect(service.ensureFixturesPopulated()).rejects.toThrow(
        "Database connection failed"
      );
    });
  });

  describe("downloadAndImportFixtures", () => {
    let mockRequest: EventEmitter & { destroy: jest.Mock };
    let mockResponse: EventEmitter & { statusCode: number; headers: Record<string, string> };

    beforeEach(() => {
      mockRequest = Object.assign(new EventEmitter(), {
        destroy: jest.fn(),
      });
      mockResponse = Object.assign(new EventEmitter(), {
        statusCode: 200,
        headers: {},
      });

      (https.get as jest.Mock).mockImplementation((url, options, callback) => {
        if (typeof options === "function") {
          callback = options;
        }
        process.nextTick(() => callback(mockResponse));
        return mockRequest;
      });
    });

    it("should create temp directory if it does not exist", async () => {
      mockFileSystem.existsSync.mockReturnValueOnce(false); // temp dir
      mockFileSystem.existsSync.mockReturnValueOnce(true); // json file exists

      const oflData = { manufacturer: { fixture: { name: "Test", modes: [], categories: [], availableChannels: {} } } };
      mockFileSystem.readFileSync.mockReturnValue(JSON.stringify(oflData));
      mockDatabase.createFixtures.mockResolvedValue({ count: 0 });
      jest.spyOn(console, "log").mockImplementation();

      await service.downloadAndImportFixtures();

      expect(mockFileSystem.mkdirSync).toHaveBeenCalledWith("/tmp/test", { recursive: true });
    });

    it("should skip download if json file already exists", async () => {
      mockFileSystem.existsSync.mockReturnValueOnce(true); // temp dir
      mockFileSystem.existsSync.mockReturnValueOnce(true); // json file exists

      const oflData = { manufacturer: { fixture: { name: "Test", modes: [], categories: [], availableChannels: {} } } };
      mockFileSystem.readFileSync.mockReturnValue(JSON.stringify(oflData));
      mockDatabase.createFixtures.mockResolvedValue({ count: 0 });
      jest.spyOn(console, "log").mockImplementation();

      await service.downloadAndImportFixtures();

      expect(https.get).not.toHaveBeenCalled();
    });

    it("should download fixtures from GitHub when json file does not exist", async () => {
      mockFileSystem.existsSync.mockReturnValueOnce(true); // temp dir
      mockFileSystem.existsSync.mockReturnValueOnce(false); // json file doesn't exist

      // Mock GitHub API response for fixtures directory
      const fixturesResponse = JSON.stringify([
        { name: "chauvet", path: "fixtures/chauvet", type: "dir" },
      ]);

      // Mock fixture files response
      const chauvetResponse = JSON.stringify([
        { name: "par.json", path: "fixtures/chauvet/par.json", type: "file", download_url: "https://raw.githubusercontent.com/test/par.json" },
      ]);

      // Mock actual fixture file
      const fixtureData = JSON.stringify({
        name: "PAR",
        categories: ["Color Changer"],
        modes: [{ name: "3ch", channels: ["Red"] }],
        availableChannels: { "Red": { capability: { type: "ColorIntensity", color: "Red" } } },
      });

      let callCount = 0;
      (https.get as jest.Mock).mockImplementation((url, options, callback) => {
        if (typeof options === "function") {
          callback = options;
        }
        const response = Object.assign(new EventEmitter(), {
          statusCode: 200,
          headers: {},
        });
        process.nextTick(() => {
          callback(response);
          if (callCount === 0) {
            response.emit("data", fixturesResponse);
          } else if (callCount === 1) {
            response.emit("data", chauvetResponse);
          } else {
            response.emit("data", fixtureData);
          }
          response.emit("end");
          callCount++;
        });
        return mockRequest;
      });

      // Mock readFileSync to return OFL data after download
      const oflData = {
        chauvet: {
          "par": {
            name: "PAR",
            categories: ["Color Changer"],
            modes: [{ name: "3ch", channels: ["Red"] }],
            availableChannels: { "Red": { capability: { type: "ColorIntensity", color: "Red" } } },
          },
        },
      };
      mockFileSystem.readFileSync.mockReturnValue(JSON.stringify(oflData));
      mockDatabase.createFixtures.mockResolvedValue({ count: 1 });
      jest.spyOn(console, "log").mockImplementation();
      jest.spyOn(console, "warn").mockImplementation();

      await service.downloadAndImportFixtures();

      expect(mockFileSystem.writeFileSync).toHaveBeenCalled();
      expect(mockDatabase.createFixtures).toHaveBeenCalled();
    });

    it("should handle GitHub API rate limit error", async () => {
      mockFileSystem.existsSync.mockReturnValueOnce(true); // temp dir
      mockFileSystem.existsSync.mockReturnValueOnce(false); // json file doesn't exist

      (https.get as jest.Mock).mockImplementation((url, options, callback) => {
        if (typeof options === "function") {
          callback = options;
        }
        const response = Object.assign(new EventEmitter(), {
          statusCode: 403,
          headers: {},
        });
        process.nextTick(() => callback(response));
        return mockRequest;
      });

      jest.spyOn(console, "log").mockImplementation();
      jest.spyOn(console, "error").mockImplementation();

      await expect(service.downloadAndImportFixtures()).rejects.toThrow(
        "GitHub API rate limit exceeded"
      );
    });

    it("should handle GitHub API error", async () => {
      mockFileSystem.existsSync.mockReturnValueOnce(true); // temp dir
      mockFileSystem.existsSync.mockReturnValueOnce(false); // json file doesn't exist

      (https.get as jest.Mock).mockImplementation((url, options, callback) => {
        if (typeof options === "function") {
          callback = options;
        }
        const response = Object.assign(new EventEmitter(), {
          statusCode: 500,
          headers: {},
        });
        process.nextTick(() => callback(response));
        return mockRequest;
      });

      jest.spyOn(console, "log").mockImplementation();
      jest.spyOn(console, "error").mockImplementation();

      await expect(service.downloadAndImportFixtures()).rejects.toThrow(
        "GitHub API error: 500"
      );
    });

    it("should handle network error", async () => {
      mockFileSystem.existsSync.mockReturnValueOnce(true); // temp dir
      mockFileSystem.existsSync.mockReturnValueOnce(false); // json file doesn't exist

      (https.get as jest.Mock).mockImplementation(() => {
        process.nextTick(() => mockRequest.emit("error", new Error("Network error")));
        return mockRequest;
      });

      jest.spyOn(console, "log").mockImplementation();
      jest.spyOn(console, "error").mockImplementation();

      await expect(service.downloadAndImportFixtures()).rejects.toThrow("Network error");
    });

    it("should handle timeout", async () => {
      mockFileSystem.existsSync.mockReturnValueOnce(true); // temp dir
      mockFileSystem.existsSync.mockReturnValueOnce(false); // json file doesn't exist

      (https.get as jest.Mock).mockImplementation(() => {
        process.nextTick(() => mockRequest.emit("timeout"));
        return mockRequest;
      });

      jest.spyOn(console, "log").mockImplementation();
      jest.spyOn(console, "error").mockImplementation();

      await expect(service.downloadAndImportFixtures()).rejects.toThrow(
        "GitHub API request timed out"
      );
      expect(mockRequest.destroy).toHaveBeenCalled();
    });

    it("should handle invalid JSON response", async () => {
      mockFileSystem.existsSync.mockReturnValueOnce(true); // temp dir
      mockFileSystem.existsSync.mockReturnValueOnce(false); // json file doesn't exist

      (https.get as jest.Mock).mockImplementation((url, options, callback) => {
        if (typeof options === "function") {
          callback = options;
        }
        const response = Object.assign(new EventEmitter(), {
          statusCode: 200,
          headers: {},
        });
        process.nextTick(() => {
          callback(response);
          response.emit("data", "not valid json");
          response.emit("end");
        });
        return mockRequest;
      });

      jest.spyOn(console, "log").mockImplementation();
      jest.spyOn(console, "error").mockImplementation();

      await expect(service.downloadAndImportFixtures()).rejects.toThrow(
        "Failed to parse GitHub response"
      );
    });

    it("should handle redirect when downloading raw files", async () => {
      mockFileSystem.existsSync.mockReturnValueOnce(true); // temp dir
      mockFileSystem.existsSync.mockReturnValueOnce(false); // json file doesn't exist

      // First call returns fixtures list, second redirects, third returns actual file
      let callCount = 0;
      (https.get as jest.Mock).mockImplementation((url, options, callback) => {
        if (typeof options === "function") {
          callback = options;
        }
        const response = Object.assign(new EventEmitter(), {
          statusCode: callCount === 2 ? 301 : 200,
          headers: callCount === 2 ? { location: "https://redirect.url" } : {},
        });
        process.nextTick(() => {
          callback(response);
          if (callCount === 0) {
            response.emit("data", JSON.stringify([{ name: "test", path: "fixtures/test", type: "dir" }]));
          } else if (callCount === 1) {
            response.emit("data", JSON.stringify([{ name: "test.json", path: "fixtures/test/test.json", type: "file", download_url: "https://raw.test" }]));
          } else if (callCount >= 2) {
            // Simulate redirect handling
            response.emit("data", JSON.stringify({ name: "Test", categories: [], modes: [], availableChannels: {} }));
          }
          response.emit("end");
          callCount++;
        });
        return mockRequest;
      });

      // Mock readFileSync to return OFL data after download
      const oflData = {
        test: {
          "test": {
            name: "Test",
            categories: [],
            modes: [{ name: "1ch", channels: ["Dimmer"] }],
            availableChannels: { "Dimmer": { capability: { type: "Intensity" } } },
          },
        },
      };
      mockFileSystem.readFileSync.mockReturnValue(JSON.stringify(oflData));
      mockDatabase.createFixtures.mockResolvedValue({ count: 1 });
      jest.spyOn(console, "log").mockImplementation();

      await service.downloadAndImportFixtures();

      expect(mockFileSystem.writeFileSync).toHaveBeenCalled();
    });
  });

  describe("importFixtures", () => {
    it("should import fixtures with valid channels", async () => {
      mockFileSystem.existsSync.mockReturnValue(true);

      const oflData = {
        chauvet: {
          "slimpar": {
            name: "SlimPAR",
            categories: ["Color Changer"],
            modes: [
              { name: "3ch", shortName: "3ch", channels: ["Red", "Green", "Blue"] },
            ],
            availableChannels: {
              "Red": { capability: { type: "ColorIntensity", color: "Red" } },
              "Green": { capability: { type: "ColorIntensity", color: "Green" } },
              "Blue": { capability: { type: "ColorIntensity", color: "Blue" } },
            },
          },
        },
      };
      mockFileSystem.readFileSync.mockReturnValue(JSON.stringify(oflData));
      mockDatabase.createFixtures.mockResolvedValue({ count: 1 });
      jest.spyOn(console, "log").mockImplementation();

      await service.downloadAndImportFixtures();

      expect(mockDatabase.createFixtures).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            manufacturer: "Chauvet",
            model: "SlimPAR",
            type: FixtureType.LED_PAR,
          }),
        ])
      );
    });

    it("should skip fixtures with no modes", async () => {
      mockFileSystem.existsSync.mockReturnValue(true);

      const oflData = {
        chauvet: {
          "nomode": {
            name: "No Mode Fixture",
            categories: ["Other"],
            modes: [],
            availableChannels: {},
          },
        },
      };
      mockFileSystem.readFileSync.mockReturnValue(JSON.stringify(oflData));
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      await service.downloadAndImportFixtures();

      // When no valid fixtures are found, createFixtures is not called
      expect(mockDatabase.createFixtures).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith("No valid fixture definitions found to import");
    });

    it("should handle fixtures with capabilities array", async () => {
      mockFileSystem.existsSync.mockReturnValue(true);

      const oflData = {
        test: {
          "multicap": {
            name: "Multi Capability",
            categories: ["Color Changer"],
            modes: [{ name: "1ch", channels: ["Dimmer"] }],
            availableChannels: {
              "Dimmer": { capabilities: [{ type: "Intensity", dmxRange: [0, 255] }] },
            },
          },
        },
      };
      mockFileSystem.readFileSync.mockReturnValue(JSON.stringify(oflData));
      mockDatabase.createFixtures.mockResolvedValue({ count: 1 });
      jest.spyOn(console, "log").mockImplementation();

      await service.downloadAndImportFixtures();

      expect(mockDatabase.createFixtures).toHaveBeenCalled();
    });

    it("should warn on fixture processing error", async () => {
      mockFileSystem.existsSync.mockReturnValue(true);

      const oflData = {
        test: {
          "bad": null, // Will cause processing error
        },
      };
      mockFileSystem.readFileSync.mockReturnValue(JSON.stringify(oflData));
      mockDatabase.createFixtures.mockResolvedValue({ count: 0 });
      jest.spyOn(console, "log").mockImplementation();
      const warnSpy = jest.spyOn(console, "warn").mockImplementation();

      await service.downloadAndImportFixtures();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Warning: Could not process fixture"),
        expect.any(String)
      );
    });

    it("should log when no valid fixture definitions found", async () => {
      mockFileSystem.existsSync.mockReturnValue(true);

      const oflData = {};
      mockFileSystem.readFileSync.mockReturnValue(JSON.stringify(oflData));
      const logSpy = jest.spyOn(console, "log").mockImplementation();

      await service.downloadAndImportFixtures();

      expect(logSpy).toHaveBeenCalledWith("No valid fixture definitions found to import");
    });

    it("should handle import error", async () => {
      mockFileSystem.existsSync.mockReturnValue(true);
      mockFileSystem.readFileSync.mockImplementation(() => {
        throw new Error("Read error");
      });

      jest.spyOn(console, "log").mockImplementation();
      jest.spyOn(console, "error").mockImplementation();

      await expect(service.downloadAndImportFixtures()).rejects.toThrow("Read error");
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
      expect(service.formatManufacturerName("rgbw-fixtures")).toBe("RGBW Fixtures");
      expect(service.formatManufacturerName("usa-lighting")).toBe("USA Lighting");
      expect(service.formatManufacturerName("uk-stage")).toBe("UK Stage");
    });
  });

  describe("mapChannelType", () => {
    it("should map Intensity to INTENSITY", () => {
      expect(service.mapChannelType({ type: "Intensity" })).toBe(ChannelType.INTENSITY);
    });

    it("should map ColorIntensity with colors", () => {
      expect(service.mapChannelType({ type: "ColorIntensity", color: "Red" })).toBe(ChannelType.RED);
      expect(service.mapChannelType({ type: "ColorIntensity", color: "Green" })).toBe(ChannelType.GREEN);
      expect(service.mapChannelType({ type: "ColorIntensity", color: "Blue" })).toBe(ChannelType.BLUE);
      expect(service.mapChannelType({ type: "ColorIntensity", color: "White" })).toBe(ChannelType.WHITE);
      expect(service.mapChannelType({ type: "ColorIntensity", color: "Amber" })).toBe(ChannelType.AMBER);
      expect(service.mapChannelType({ type: "ColorIntensity", color: "UV" })).toBe(ChannelType.UV);
      expect(service.mapChannelType({ type: "ColorIntensity", color: "Unknown" })).toBe(ChannelType.OTHER);
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
      expect(service.mapChannelType({ type: "ColorWheel" })).toBe(ChannelType.COLOR_WHEEL);
      expect(service.mapChannelType({ type: "Effect" })).toBe(ChannelType.EFFECT);
      expect(service.mapChannelType({ type: "ShutterStrobe" })).toBe(ChannelType.STROBE);
      expect(service.mapChannelType({ type: "Maintenance" })).toBe(ChannelType.MACRO);
    });

    it("should return OTHER for unknown types", () => {
      expect(service.mapChannelType({ type: "Unknown" })).toBe(ChannelType.OTHER);
    });
  });

  describe("mapFixtureType", () => {
    it("should map moving head fixtures", () => {
      expect(service.mapFixtureType(["Moving Head"])).toBe(FixtureType.MOVING_HEAD);
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

      expect(mockFileSystem.unlinkSync).toHaveBeenCalledWith("/tmp/test/ofl-github.json");
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

      expect(consoleSpy).toHaveBeenCalledWith("Error during cleanup:", expect.any(Error));

      consoleSpy.mockRestore();
    });
  });
});
