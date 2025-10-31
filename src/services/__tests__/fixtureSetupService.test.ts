import { FixtureType, ChannelType } from "../../types/enums";
import { FixtureSetupService } from "../fixtureSetupService";
import { IFileSystemService } from "../abstractions/FileSystemService";
import { IHttpService, HttpRequest } from "../abstractions/HttpService";
import { IPathService } from "../abstractions/PathService";
import { IDatabaseService } from "../abstractions/DatabaseService";
import { IArchiveService } from "../abstractions/ArchiveService";

// Mock all dependencies
const createMockFileSystem = (): jest.Mocked<IFileSystemService> => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  createWriteStream: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
  unlinkSync: jest.fn(),
  createReadStream: jest.fn(),
});

const createMockHttp = (): jest.Mocked<IHttpService> => ({
  get: jest.fn(),
});

const createMockPath = (): jest.Mocked<IPathService> => ({
  join: jest.fn((...paths) => paths.join('/')),
  resolve: jest.fn((...paths) => paths.join('/')),
  dirname: jest.fn((path) => path.split('/').slice(0, -1).join('/')),
  basename: jest.fn((path, ext) => {
    const base = path.split('/').pop() || '';
    return ext ? base.replace(ext, '') : base;
  }),
  extname: jest.fn((path) => {
    const parts = path.split('.');
    return parts.length > 1 ? '.' + parts.pop() : '';
  }),
});

const createMockDatabase = (): jest.Mocked<IDatabaseService> => ({
  getFixtureCount: jest.fn(),
  createFixtures: jest.fn(),
});

const createMockArchive = (): jest.Mocked<IArchiveService> => ({
  extractZip: jest.fn(),
});

const createMockWriteStream = () => ({
  close: jest.fn(),
  on: jest.fn().mockReturnThis(),
  emit: jest.fn().mockReturnThis(),
});

const createMockHttpRequest = (): jest.Mocked<HttpRequest> => ({
  on: jest.fn().mockReturnThis(),
});

describe("FixtureSetupService", () => {
  let mockFileSystem: jest.Mocked<IFileSystemService>;
  let mockHttp: jest.Mocked<IHttpService>;
  let mockPath: jest.Mocked<IPathService>;
  let mockDatabase: jest.Mocked<IDatabaseService>;
  let mockArchive: jest.Mocked<IArchiveService>;
  let service: FixtureSetupService;

  beforeEach(() => {
    mockFileSystem = createMockFileSystem();
    mockHttp = createMockHttp();
    mockPath = createMockPath();
    mockDatabase = createMockDatabase();
    mockArchive = createMockArchive();

    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    service = new FixtureSetupService(
      mockFileSystem,
      mockHttp,
      mockPath,
      mockDatabase,
      mockArchive
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("ensureFixturesPopulated", () => {
    it("should skip import when SKIP_FIXTURE_IMPORT is set", async () => {
      const originalEnv = process.env.SKIP_FIXTURE_IMPORT;
      process.env.SKIP_FIXTURE_IMPORT = "true";

      await service.ensureFixturesPopulated();

      expect(mockDatabase.getFixtureCount).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith("⏩ Skipping fixture import (SKIP_FIXTURE_IMPORT=true)");

      // Restore original env
      if (originalEnv === undefined) {
        delete process.env.SKIP_FIXTURE_IMPORT;
      } else {
        process.env.SKIP_FIXTURE_IMPORT = originalEnv;
      }
    });

    it("should skip import when fixtures already exist", async () => {
      mockDatabase.getFixtureCount.mockResolvedValue(100);

      await service.ensureFixturesPopulated();

      expect(mockDatabase.getFixtureCount).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith("✓ Found 100 fixture definitions in database");
    });

    it("should start import process when no fixtures exist", async () => {
      mockDatabase.getFixtureCount.mockResolvedValue(0);
      mockFileSystem.existsSync.mockReturnValue(true); // Pretend temp dir and json exist
      mockFileSystem.readFileSync.mockReturnValue('{}'); // Empty fixture data
      mockDatabase.createFixtures.mockResolvedValue({ count: 0 });

      await service.ensureFixturesPopulated();

      expect(mockDatabase.getFixtureCount).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith("🎭 No fixture definitions found. Starting initial fixture import...");
    });

    it("should handle errors gracefully", async () => {
      const error = new Error("Database connection failed");
      mockDatabase.getFixtureCount.mockRejectedValue(error);

      await expect(service.ensureFixturesPopulated()).rejects.toThrow("Database connection failed");
      expect(console.error).toHaveBeenCalledWith("Error ensuring fixtures populated:", error);
    });
  });

  describe("downloadAndImportFixtures", () => {
    beforeEach(() => {
      // Default setup for successful download and import
      mockFileSystem.existsSync.mockImplementation((path) => {
        if (path.includes('temp')) {return true;} // temp dir exists
        if (path.includes('ofl.json')) {return false;} // need to download
        return true;
      });
    });

    it("should create temp directory if it doesn't exist", async () => {
      // Setup mocks for scenario where JSON exists (skip download)
      mockFileSystem.existsSync.mockImplementation((path) => {
        if (path.includes('temp') && !path.includes('ofl.json')) {return false;} // temp dir doesn't exist
        if (path.includes('ofl.json')) {return true;} // json exists, skip download
        return true;
      });
      mockFileSystem.readFileSync.mockReturnValue('{"TestManufacturer": {}}');
      mockDatabase.createFixtures.mockResolvedValue({ count: 0 });

      await service.downloadAndImportFixtures();

      expect(mockFileSystem.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('temp'),
        { recursive: true }
      );
      // Should not call HTTP since JSON exists
      expect(mockHttp.get).not.toHaveBeenCalled();
    });

    it.skip("should download and extract OFL data when json doesn't exist", async () => {
      // This test uses the beforeEach setup where ofl.json doesn't exist
      // Just need to complete the HTTP and extraction mocking

      const mockWriteStream = createMockWriteStream();
      const mockRequest = createMockHttpRequest();
      const mockResponse = {
        statusCode: 200,
        headers: { "content-length": "1000" },
        on: jest.fn(),
        pipe: jest.fn().mockImplementation((stream) => {
          // Simulate successful download
          process.nextTick(() => stream.emit('finish'));
          return mockResponse;
        }),
      } as any;

      mockFileSystem.createWriteStream.mockReturnValue(mockWriteStream as any);
      mockHttp.get.mockImplementation((url, callback) => {
        // Immediately call callback with successful response
        process.nextTick(() => callback(mockResponse));
        return mockRequest;
      });

      // Mock extraction and processing success
      mockArchive.extractZip.mockResolvedValue();
      mockFileSystem.readdirSync.mockImplementation((path) => {
        if (path.includes('extract')) {return ['open-fixture-library-master'];}
        if (path.includes('fixtures')) {return ['TestManufacturer'];}
        if (path.includes('TestManufacturer')) {return ['TestFixture.json'];}
        return [];
      });
      mockFileSystem.statSync.mockReturnValue({ isDirectory: () => true } as any);
      mockFileSystem.readFileSync.mockImplementation((path) => {
        if (path.includes('TestFixture.json')) {
          return JSON.stringify({
            name: "Test Fixture",
            categories: ["LED"],
            modes: [{ name: "basic", channels: ["Intensity"] }],
            availableChannels: {
              "Intensity": { capability: { type: "Intensity" } }
            }
          });
        }
        if (path.includes('ofl.json')) {
          return JSON.stringify({ "TestManufacturer": { "TestFixture": {} } });
        }
        return '{}';
      });
      mockDatabase.createFixtures.mockResolvedValue({ count: 1 });

      await service.downloadAndImportFixtures();

      expect(mockHttp.get).toHaveBeenCalled();
      expect(mockArchive.extractZip).toHaveBeenCalled();
    });

    it("should handle HTTP download errors", async () => {
      // Ensure JSON file doesn't exist so we try to download
      mockFileSystem.existsSync.mockImplementation((path) => {
        if (path.includes('ofl.json')) {return false;} // force download
        if (path.includes('temp')) {return true;}
        return true;
      });

      const mockWriteStream = createMockWriteStream();
      const mockRequest = createMockHttpRequest();
      const mockResponse = { statusCode: 404 } as any;

      mockFileSystem.createWriteStream.mockReturnValue(mockWriteStream as any);
      mockHttp.get.mockImplementation((url, callback) => {
        callback(mockResponse);
        return mockRequest;
      });

      await expect(service.downloadAndImportFixtures()).rejects.toThrow(
        "Failed to download OFL fixtures. Status code: 404"
      );
    });

    it.skip("should handle extraction errors", async () => {
      // Ensure JSON file doesn't exist so we try to download
      mockFileSystem.existsSync.mockImplementation((path) => {
        if (path.includes('ofl.json')) {return false;} // force download
        if (path.includes('temp')) {return true;}
        return true;
      });

      const mockWriteStream = createMockWriteStream();
      const mockRequest = createMockHttpRequest();
      const mockResponse = {
        statusCode: 200,
        headers: {},
        on: jest.fn(),
        pipe: jest.fn().mockImplementation((stream) => {
          process.nextTick(() => stream.emit('finish'));
          return mockResponse;
        }),
      } as any;

      mockFileSystem.createWriteStream.mockReturnValue(mockWriteStream as any);
      mockHttp.get.mockImplementation((url, callback) => {
        process.nextTick(() => callback(mockResponse));
        return mockRequest;
      });

      const extractionError = new Error("Failed to extract zip");
      mockArchive.extractZip.mockRejectedValue(extractionError);

      await expect(service.downloadAndImportFixtures()).rejects.toThrow("Failed to extract zip");
      expect(console.error).toHaveBeenCalledWith("Error extracting OFL data:", extractionError);
    });
  });

  describe("Utility methods", () => {
    describe("mapChannelType", () => {
      it("should map intensity types correctly", () => {
        expect(service.mapChannelType({ type: "Intensity" })).toBe(ChannelType.INTENSITY);
        expect(service.mapChannelType({ type: "ColorIntensity", color: "Red" })).toBe(ChannelType.RED);
        expect(service.mapChannelType({ type: "ColorIntensity", color: "green" })).toBe(ChannelType.GREEN);
      });

      it("should map movement types correctly", () => {
        expect(service.mapChannelType({ type: "Pan" })).toBe(ChannelType.PAN);
        expect(service.mapChannelType({ type: "Tilt" })).toBe(ChannelType.TILT);
      });

      it("should map additional channel types correctly", () => {
        expect(service.mapChannelType({ type: "Zoom" })).toBe(ChannelType.ZOOM);
        expect(service.mapChannelType({ type: "Focus" })).toBe(ChannelType.FOCUS);
        expect(service.mapChannelType({ type: "Iris" })).toBe(ChannelType.IRIS);
        expect(service.mapChannelType({ type: "Gobo" })).toBe(ChannelType.GOBO);
        expect(service.mapChannelType({ type: "ColorWheel" })).toBe(ChannelType.COLOR_WHEEL);
        expect(service.mapChannelType({ type: "Effect" })).toBe(ChannelType.EFFECT);
        expect(service.mapChannelType({ type: "ShutterStrobe" })).toBe(ChannelType.STROBE);
        expect(service.mapChannelType({ type: "Maintenance" })).toBe(ChannelType.MACRO);
      });

      it("should map all color intensity types", () => {
        expect(service.mapChannelType({ type: "ColorIntensity", color: "White" })).toBe(ChannelType.WHITE);
        expect(service.mapChannelType({ type: "ColorIntensity", color: "Amber" })).toBe(ChannelType.AMBER);
        expect(service.mapChannelType({ type: "ColorIntensity", color: "UV" })).toBe(ChannelType.UV);
      });

      it("should default to OTHER for unknown types", () => {
        expect(service.mapChannelType({ type: "UnknownType" })).toBe(ChannelType.OTHER);
        expect(service.mapChannelType({ type: "ColorIntensity", color: "Purple" })).toBe(ChannelType.OTHER);
      });
    });

    describe("mapFixtureType", () => {
      it("should map fixture categories correctly", () => {
        expect(service.mapFixtureType(["Moving Head"])).toBe(FixtureType.MOVING_HEAD);
        expect(service.mapFixtureType(["Strobe"])).toBe(FixtureType.STROBE);
        expect(service.mapFixtureType(["Color Changer"])).toBe(FixtureType.LED_PAR);
        expect(service.mapFixtureType(["Dimmer"])).toBe(FixtureType.DIMMER);
        expect(service.mapFixtureType(["Laser"])).toBe(FixtureType.OTHER);
      });
    });

    describe("getDefaultValue", () => {
      it("should use DMX range start value when available", () => {
        expect(service.getDefaultValue({ type: "Pan", dmxRange: [10, 50] as [number, number] })).toBe(10);
      });

      it("should return 0 for intensity types without DMX range", () => {
        expect(service.getDefaultValue({ type: "Intensity" })).toBe(0);
        expect(service.getDefaultValue({ type: "ColorIntensity" })).toBe(0);
      });

      it("should return 128 for other types without DMX range", () => {
        expect(service.getDefaultValue({ type: "Pan" })).toBe(128);
        expect(service.getDefaultValue({ type: "UnknownType" })).toBe(128);
      });
    });

    describe("getMinMaxValues", () => {
      it("should use DMX range when available", () => {
        const result = service.getMinMaxValues({ type: "Pan", dmxRange: [10, 200] as [number, number] });
        expect(result).toEqual({ min: 10, max: 200 });
      });

      it("should default to 0-255 when no DMX range", () => {
        const result = service.getMinMaxValues({ type: "Intensity" });
        expect(result).toEqual({ min: 0, max: 255 });
      });
    });
  });

  describe("cleanup", () => {
    it("should remove OFL zip file when it exists", async () => {
      mockFileSystem.existsSync.mockReturnValue(true);

      await service.cleanup();

      expect(mockFileSystem.unlinkSync).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith("Cleaned up OFL zip file");
    });

    it("should skip cleanup when file doesn't exist", async () => {
      mockFileSystem.existsSync.mockReturnValue(false);

      await service.cleanup();

      expect(mockFileSystem.unlinkSync).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith("OFL zip file not found, nothing to clean up");
    });

    it("should handle cleanup errors gracefully", async () => {
      mockFileSystem.existsSync.mockReturnValue(true);
      mockFileSystem.unlinkSync.mockImplementation(() => {
        throw new Error("Permission denied");
      });

      await service.cleanup();

      expect(console.error).toHaveBeenCalledWith("Error during cleanup:", expect.any(Error));
    });
  });

  describe("Integration scenarios", () => {
    it("should process realistic fixture data correctly", async () => {
      const fixtureData = {
        name: "LED Par 64",
        categories: ["Color Changer", "LED"],
        modes: [{
          name: "8-channel",
          channels: ["Red", "Green", "Blue", "White", "Dimmer", "Strobe", "Programs", "Speed"]
        }],
        availableChannels: {
          "Red": { capability: { type: "ColorIntensity", color: "Red", dmxRange: [0, 255] as [number, number] } },
          "Green": { capability: { type: "ColorIntensity", color: "Green", dmxRange: [0, 255] as [number, number] } },
          "Blue": { capability: { type: "ColorIntensity", color: "Blue", dmxRange: [0, 255] as [number, number] } },
          "White": { capability: { type: "ColorIntensity", color: "White", dmxRange: [0, 255] as [number, number] } },
          "Dimmer": { capability: { type: "Intensity", dmxRange: [0, 255] as [number, number] } },
          "Strobe": { capability: { type: "ShutterStrobe", dmxRange: [0, 255] as [number, number] } },
          "Programs": { capability: { type: "Effect", dmxRange: [0, 255] as [number, number] } },
          "Speed": { capability: { type: "Effect", dmxRange: [0, 255] as [number, number] } }
        }
      };

      // Test channel mapping for realistic fixture
      const channels = fixtureData.modes[0].channels;
      const mappedChannels = channels.map((channelName, index) => {
        const channelData = fixtureData.availableChannels[channelName as keyof typeof fixtureData.availableChannels];
        const capability = channelData.capability;
        return {
          name: channelName,
          type: service.mapChannelType(capability),
          offset: index + 1,
          minValue: service.getMinMaxValues(capability).min,
          maxValue: service.getMinMaxValues(capability).max,
          defaultValue: service.getDefaultValue(capability),
        };
      });

      expect(mappedChannels).toHaveLength(8);
      expect(mappedChannels[0]).toEqual({
        name: "Red",
        type: ChannelType.RED,
        offset: 1,
        minValue: 0,
        maxValue: 255,
        defaultValue: 0,
      });
      expect(mappedChannels[4]).toEqual({
        name: "Dimmer",
        type: ChannelType.INTENSITY,
        offset: 5,
        minValue: 0,
        maxValue: 255,
        defaultValue: 0,
      });

      // Test fixture type mapping
      expect(service.mapFixtureType(fixtureData.categories)).toBe(FixtureType.LED_PAR);
    });

    it("should handle downloadOFLData progress tracking and error conditions", async () => {
      const mockResponse: any = {
        statusCode: 200,
        headers: { "content-length": "1000" },
        pipe: jest.fn(),
        on: jest.fn().mockImplementation((event, callback) => {
          if (event === "data") {
            // Simulate progress chunks
            callback(Buffer.alloc(100));
            callback(Buffer.alloc(200));
            callback(Buffer.alloc(300));
            callback(Buffer.alloc(400));
          }
          return mockResponse;
        }),
      };

      const mockFile = {
        close: jest.fn(),
        on: jest.fn().mockImplementation((event, callback) => {
          if (event === "finish") {callback();}
          return mockFile;
        }),
      };

      mockFileSystem.existsSync
        .mockReturnValueOnce(true)  // temp dir exists
        .mockReturnValueOnce(false) // ofl.json doesn't exist
        .mockReturnValue(true); // all other paths exist (including fixtures directory)

      mockFileSystem.createWriteStream.mockReturnValue(mockFile as any);
      mockHttp.get.mockImplementation((url, callback) => {
        callback(mockResponse);
        return { on: jest.fn() };
      });

      // Mock processExtractedData dependencies
      mockFileSystem.readdirSync
        .mockReturnValueOnce(["open-fixture-library-master"]) // extracted dirs
        .mockReturnValueOnce(["chauvet"]) // manufacturers
        .mockReturnValueOnce(["led-par-56.json"]); // fixtures

      mockFileSystem.statSync.mockReturnValue({ isDirectory: () => true } as any);
      mockFileSystem.readFileSync
        .mockReturnValueOnce(JSON.stringify({
          name: "LED PAR 56",
          categories: ["Color Changer"],
          modes: [{
            name: "8-channel",
            channels: ["Red", "Green", "Blue", "Dimmer"]
          }],
          availableChannels: {
            "Red": { capability: { type: "ColorIntensity", color: "Red" } },
            "Green": { capability: { type: "ColorIntensity", color: "Green" } },
            "Blue": { capability: { type: "ColorIntensity", color: "Blue" } },
            "Dimmer": { capability: { type: "Intensity" } }
          }
        })) // fixture JSON
        .mockReturnValueOnce(JSON.stringify({
          "chauvet": {
            "led-par-56": {
              name: "LED PAR 56",
              categories: ["Color Changer"],
              modes: [{
                name: "8-channel",
                channels: ["Red", "Green", "Blue", "Dimmer"]
              }],
              availableChannels: {
                "Red": { capability: { type: "ColorIntensity", color: "Red" } },
                "Green": { capability: { type: "ColorIntensity", color: "Green" } },
                "Blue": { capability: { type: "ColorIntensity", color: "Blue" } },
                "Dimmer": { capability: { type: "Intensity" } }
              }
            }
          }
        })); // processed OFL data for importFixtures

      mockArchive.extractZip.mockResolvedValue(undefined);
      mockDatabase.createFixtures.mockResolvedValue({ count: 1 });

      await expect(service.downloadAndImportFixtures()).resolves.not.toThrow();
      expect(mockFileSystem.createWriteStream).toHaveBeenCalledWith(service.testConfig.oflZipPath);
    });

    it("should handle downloadOFLData HTTP errors", async () => {
      const mockError = new Error("Network error");
      const mockWriteStream = createMockWriteStream();

      mockFileSystem.createWriteStream.mockReturnValue(mockWriteStream as any);
      mockHttp.get.mockImplementation(() => {
        const mockRequest = { on: jest.fn() };
        mockRequest.on.mockImplementation((event, callback) => {
          if (event === "error") {callback(mockError);}
          return mockRequest;
        });
        return mockRequest;
      });

      mockFileSystem.existsSync
        .mockReturnValueOnce(true)  // temp dir exists
        .mockReturnValueOnce(false) // ofl.json doesn't exist
        .mockReturnValueOnce(true); // zip file exists for cleanup

      await expect(service.downloadAndImportFixtures()).rejects.toThrow("Network error");
      expect(mockFileSystem.unlinkSync).toHaveBeenCalledWith(service.testConfig.oflZipPath);
    });

    it("should handle downloadOFLData non-200 status codes", async () => {
      const mockWriteStream = createMockWriteStream();
      const mockResponse: any = {
        statusCode: 404,
        headers: {},
      };

      mockFileSystem.createWriteStream.mockReturnValue(mockWriteStream as any);
      mockHttp.get.mockImplementation((url, callback) => {
        callback(mockResponse);
        return { on: jest.fn() };
      });

      mockFileSystem.existsSync
        .mockReturnValueOnce(true)  // temp dir exists
        .mockReturnValueOnce(false); // ofl.json doesn't exist

      await expect(service.downloadAndImportFixtures()).rejects.toThrow("Failed to download OFL fixtures. Status code: 404");
    });

    it("should test extractOFLData with successful extraction", async () => {
      mockFileSystem.existsSync
        .mockReturnValueOnce(true)  // temp dir exists
        .mockReturnValueOnce(false) // ofl.json doesn't exist
        .mockReturnValue(true); // all other paths exist (including fixtures directory)

      mockArchive.extractZip.mockResolvedValue(undefined);

      // Mock the file stream and HTTP response for download
      const mockFile = {
        close: jest.fn(),
        on: jest.fn().mockImplementation((event, callback) => {
          if (event === "finish") {callback();}
          return mockFile;
        }),
      };

      const mockResponse: any = {
        statusCode: 200,
        headers: { "content-length": "1000" },
        pipe: jest.fn(),
        on: jest.fn(),
      };
      mockResponse.on.mockReturnValue(mockResponse);

      mockFileSystem.createWriteStream.mockReturnValue(mockFile as any);
      mockHttp.get.mockImplementation((url, callback) => {
        callback(mockResponse);
        return { on: jest.fn() };
      });

      // Mock processExtractedData dependencies
      mockFileSystem.readdirSync
        .mockReturnValueOnce(["open-fixture-library-master"]) // extracted dirs
        .mockReturnValueOnce(["chauvet"]) // manufacturers
        .mockReturnValueOnce(["led-par-56.json"]); // fixtures

      mockFileSystem.statSync.mockReturnValue({ isDirectory: () => true } as any);
      mockFileSystem.readFileSync
        .mockReturnValueOnce(JSON.stringify({
          name: "LED PAR 56",
          categories: ["Color Changer"],
          modes: [{
            name: "8-channel",
            channels: ["Red", "Green", "Blue", "Dimmer"]
          }],
          availableChannels: {
            "Red": { capability: { type: "ColorIntensity", color: "Red" } },
            "Green": { capability: { type: "ColorIntensity", color: "Green" } },
            "Blue": { capability: { type: "ColorIntensity", color: "Blue" } },
            "Dimmer": { capability: { type: "Intensity" } }
          }
        })) // fixture JSON
        .mockReturnValueOnce(JSON.stringify({
          "chauvet": {
            "led-par-56": {
              name: "LED PAR 56",
              categories: ["Color Changer"],
              modes: [{
                name: "8-channel",
                channels: ["Red", "Green", "Blue", "Dimmer"]
              }],
              availableChannels: {
                "Red": { capability: { type: "ColorIntensity", color: "Red" } },
                "Green": { capability: { type: "ColorIntensity", color: "Green" } },
                "Blue": { capability: { type: "ColorIntensity", color: "Blue" } },
                "Dimmer": { capability: { type: "Intensity" } }
              }
            }
          }
        })); // processed OFL data for importFixtures

      mockDatabase.createFixtures.mockResolvedValue({ count: 1 });

      await expect(service.downloadAndImportFixtures()).resolves.not.toThrow();
      expect(mockArchive.extractZip).toHaveBeenCalledWith(service.testConfig.oflZipPath, service.testConfig.oflExtractPath);
    });

    it("should test extractOFLData with extraction failure", async () => {
      const extractError = new Error("Extraction failed");
      mockArchive.extractZip.mockRejectedValue(extractError);

      mockFileSystem.existsSync
        .mockReturnValueOnce(true)  // temp dir exists
        .mockReturnValueOnce(false); // ofl.json doesn't exist

      // Mock successful download
      const mockFile = {
        close: jest.fn(),
        on: jest.fn().mockImplementation((event, callback) => {
          if (event === "finish") {callback();}
          return mockFile;
        }),
      };

      const mockResponse: any = {
        statusCode: 200,
        headers: { "content-length": "1000" },
        pipe: jest.fn(),
        on: jest.fn(),
      };
      mockResponse.on.mockReturnValue(mockResponse);

      mockFileSystem.createWriteStream.mockReturnValue(mockFile as any);
      mockHttp.get.mockImplementation((url, callback) => {
        callback(mockResponse);
        return { on: jest.fn() };
      });

      await expect(service.downloadAndImportFixtures()).rejects.toThrow("Extraction failed");
    });

    it("should test processExtractedData with comprehensive fixture processing", async () => {
      // Mock complete fixture data with all channel types
      const complexFixtureData = {
        name: "Moving Head Pro",
        categories: ["Moving Head", "Color Changer"],
        modes: [{
          name: "16-channel",
          channels: [
            "Pan", "Tilt", "Red", "Green", "Blue", "White", "Amber", "UV",
            "Dimmer", "Zoom", "Focus", "Iris", "Gobo", "ColorWheel", "Effect", "Macro"
          ]
        }],
        availableChannels: {
          "Pan": { capability: { type: "Pan" } },
          "Tilt": { capability: { type: "Tilt" } },
          "Red": { capability: { type: "ColorIntensity", color: "Red" } },
          "Green": { capability: { type: "ColorIntensity", color: "Green" } },
          "Blue": { capability: { type: "ColorIntensity", color: "Blue" } },
          "White": { capability: { type: "ColorIntensity", color: "White" } },
          "Amber": { capability: { type: "ColorIntensity", color: "Amber" } },
          "UV": { capability: { type: "ColorIntensity", color: "UV" } },
          "Dimmer": { capability: { type: "Intensity" } },
          "Zoom": { capability: { type: "Zoom" } },
          "Focus": { capability: { type: "Focus" } },
          "Iris": { capability: { type: "Iris" } },
          "Gobo": { capability: { type: "Gobo" } },
          "ColorWheel": { capability: { type: "ColorWheel" } },
          "Effect": { capability: { type: "Effect" } },
          "Macro": { capability: { type: "Maintenance" } }
        }
      };

      mockFileSystem.existsSync
        .mockReturnValueOnce(true)  // temp dir exists
        .mockReturnValueOnce(false) // ofl.json doesn't exist
        .mockReturnValue(true); // all other paths exist (including fixtures directory)

      // Mock successful download
      const mockFile = {
        close: jest.fn(),
        on: jest.fn().mockImplementation((event, callback) => {
          if (event === "finish") {callback();}
          return mockFile;
        }),
      };

      const mockResponse: any = {
        statusCode: 200,
        headers: { "content-length": "1000" },
        pipe: jest.fn(),
        on: jest.fn(),
      };
      mockResponse.on.mockReturnValue(mockResponse);

      mockFileSystem.createWriteStream.mockReturnValue(mockFile as any);
      mockHttp.get.mockImplementation((url, callback) => {
        callback(mockResponse);
        return { on: jest.fn() };
      });

      mockArchive.extractZip.mockResolvedValue(undefined);

      // Mock directory structure and fixture files
      mockFileSystem.readdirSync
        .mockReturnValueOnce(["open-fixture-library-master"]) // extracted dirs
        .mockReturnValueOnce(["martin"]) // manufacturers
        .mockReturnValueOnce(["moving-head-pro.json"]); // fixtures

      mockFileSystem.statSync.mockReturnValue({ isDirectory: () => true } as any);
      mockFileSystem.readFileSync
        .mockReturnValueOnce(JSON.stringify(complexFixtureData)) // fixture JSON
        .mockReturnValueOnce(JSON.stringify({
          "martin": {
            "moving-head-pro": complexFixtureData
          }
        })); // processed OFL data for importFixtures

      mockDatabase.createFixtures.mockResolvedValue({ count: 1 });

      await expect(service.downloadAndImportFixtures()).resolves.not.toThrow();

      // Verify all channel types were processed
      expect(mockDatabase.createFixtures).toHaveBeenCalledWith([
        expect.objectContaining({
          manufacturer: "Martin", // Formatted from "martin"
          model: "Moving Head Pro",
          type: FixtureType.MOVING_HEAD,
          isBuiltIn: true,
          channels: {
            create: expect.arrayContaining([
              expect.objectContaining({ name: "Pan", type: ChannelType.PAN }),
              expect.objectContaining({ name: "Tilt", type: ChannelType.TILT }),
              expect.objectContaining({ name: "Zoom", type: ChannelType.ZOOM }),
              expect.objectContaining({ name: "Focus", type: ChannelType.FOCUS }),
              expect.objectContaining({ name: "Iris", type: ChannelType.IRIS }),
              expect.objectContaining({ name: "Gobo", type: ChannelType.GOBO }),
              expect.objectContaining({ name: "ColorWheel", type: ChannelType.COLOR_WHEEL }),
              expect.objectContaining({ name: "Effect", type: ChannelType.EFFECT }),
              expect.objectContaining({ name: "Macro", type: ChannelType.MACRO }),
              expect.objectContaining({ name: "White", type: ChannelType.WHITE }),
              expect.objectContaining({ name: "Amber", type: ChannelType.AMBER }),
              expect.objectContaining({ name: "UV", type: ChannelType.UV })
            ])
          },
          modes: expect.arrayContaining([
            expect.objectContaining({
              name: "16-channel",
              channelCount: 16
            })
          ])
        })
      ]);
    });

    it("should test loadOFLData with missing fixtures directory", async () => {
      const invalidPath = "/invalid/fixtures/path";
      mockFileSystem.existsSync.mockReturnValue(false);

      await expect((service as any).loadOFLData(invalidPath)).rejects.toThrow(`Fixtures directory not found: ${invalidPath}`);
    });

    it("should test loadOFLData with invalid JSON files", async () => {
      const fixturesPath = "/mock/fixtures";
      mockFileSystem.existsSync.mockReturnValue(true);
      mockFileSystem.readdirSync
        .mockReturnValueOnce(["chauvet"]) // manufacturers
        .mockReturnValueOnce(["invalid.json", "valid.json"]); // fixtures

      mockFileSystem.statSync.mockReturnValue({ isDirectory: () => true } as any);
      mockFileSystem.readFileSync
        .mockReturnValueOnce("{ invalid json }") // invalid JSON
        .mockReturnValueOnce(JSON.stringify({ name: "Valid Fixture", categories: [] })); // valid JSON

      const result = await (service as any).loadOFLData(fixturesPath);

      expect(result).toEqual({
        chauvet: {
          valid: { name: "Valid Fixture", categories: [] }
        }
      });
    });

    it("should test importFixtures with complex scenarios", async () => {
      const mockOFLData = {
        "martin": {
          "strobe-fixture": {
            name: "Strobe Pro",
            categories: ["Strobe", "Blinder"],
            modes: [{
              name: "1-channel",
              channels: ["Strobe"]
            }],
            availableChannels: {
              "Strobe": { capability: { type: "ShutterStrobe" } }
            }
          }
        },
        "etc": {
          "dimmer-pack": {
            name: "Dimmer Pack 4",
            categories: ["Dimmer"],
            modes: [{
              name: "4-channel",
              channels: ["Ch1", "Ch2", "Ch3", "Ch4"]
            }],
            availableChannels: {
              "Ch1": { capability: { type: "Intensity" } },
              "Ch2": { capability: { type: "Intensity" } },
              "Ch3": { capability: { type: "Intensity" } },
              "Ch4": { capability: { type: "Intensity" } }
            }
          }
        }
      };

      mockFileSystem.readFileSync.mockReturnValue(JSON.stringify(mockOFLData));
      mockDatabase.createFixtures.mockResolvedValue({ count: 2 });

      await (service as any).importFixtures();

      expect(mockDatabase.createFixtures).toHaveBeenCalledWith([
        expect.objectContaining({
          manufacturer: "Martin", // Formatted from "martin"
          model: "Strobe Pro",
          type: FixtureType.STROBE,
          isBuiltIn: true,
          channels: {
            create: expect.arrayContaining([
              expect.objectContaining({ name: "Strobe", type: ChannelType.STROBE })
            ])
          },
          modes: expect.arrayContaining([
            expect.objectContaining({
              name: "1-channel",
              channelCount: 1,
              channels: expect.arrayContaining([
                expect.objectContaining({ offset: 1, channelName: "Strobe" })
              ])
            })
          ])
        }),
        expect.objectContaining({
          manufacturer: "Etc", // Formatted from "etc"
          model: "Dimmer Pack 4",
          type: FixtureType.DIMMER,
          isBuiltIn: true,
          channels: {
            create: expect.arrayContaining([
              expect.objectContaining({ name: "Ch1", type: ChannelType.INTENSITY }),
              expect.objectContaining({ name: "Ch2", type: ChannelType.INTENSITY }),
              expect.objectContaining({ name: "Ch3", type: ChannelType.INTENSITY }),
              expect.objectContaining({ name: "Ch4", type: ChannelType.INTENSITY })
            ])
          },
          modes: expect.arrayContaining([
            expect.objectContaining({
              name: "4-channel",
              channelCount: 4,
              channels: expect.arrayContaining([
                expect.objectContaining({ offset: 1, channelName: "Ch1" }),
                expect.objectContaining({ offset: 2, channelName: "Ch2" }),
                expect.objectContaining({ offset: 3, channelName: "Ch3" }),
                expect.objectContaining({ offset: 4, channelName: "Ch4" })
              ])
            })
          ])
        })
      ]);
    });
  });
});