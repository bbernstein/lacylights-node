import fs from "fs";
import path from "path";
import * as xml2js from "xml2js";
import {
  QLCFixtureLibrary,
  LacyLightsFixtureDetails,
} from "../qlcFixtureLibrary";

// Mock dependencies
jest.mock("fs");
jest.mock("path");
jest.mock("xml2js");

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;
const mockXml2js = xml2js as jest.Mocked<typeof xml2js>;

// Mock console.error
const originalConsoleError = console.error;
const mockConsoleError = jest.fn();

describe("QLCFixtureLibrary", () => {
  let library: QLCFixtureLibrary;

  beforeEach(() => {
    jest.clearAllMocks();
    console.error = mockConsoleError;

    // Setup default mocks
    mockPath.join.mockImplementation((...args) => args.join("/"));
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([]);
    mockFs.statSync.mockReturnValue({
      isDirectory: () => true,
    } as any);
    mockFs.readFileSync.mockReturnValue("<xml></xml>");

    // Mock xml2js Parser
    const mockParser = {
      parseStringPromise: jest.fn(),
    };
    mockXml2js.Parser.mockImplementation(() => mockParser as any);

    library = new QLCFixtureLibrary();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  describe("constructor", () => {
    it("should use provided path", () => {
      const customPath = "/custom/path";
      const customLibrary = new QLCFixtureLibrary(customPath);
      expect(customLibrary["fixtureListPath"]).toBe(customPath);
    });

    it("should use environment variable when no path provided", () => {
      process.env.QLC_FIXTURES_PATH = "/env/path";
      const envLibrary = new QLCFixtureLibrary();
      expect(envLibrary["fixtureListPath"]).toBe("/env/path");
      delete process.env.QLC_FIXTURES_PATH;
    });

    it("should use default path when nothing provided", () => {
      delete process.env.QLC_FIXTURES_PATH;
      new QLCFixtureLibrary();
      expect(mockPath.join).toHaveBeenCalledWith(
        expect.anything(),
        "../../resources/qlc-fixtures"
      );
    });
  });

  describe("loadFixtureLibrary", () => {
    it("should throw error when fixture path doesn't exist", async () => {
      mockFs.existsSync.mockReturnValue(false);

      await expect(library.loadFixtureLibrary()).rejects.toThrow(
        "QLC+ fixtures path not found"
      );
    });

    it("should load fixtures from directory structure", async () => {
      // Mock directory structure
      mockFs.readdirSync
        .mockReturnValueOnce(["american-dj", "chauvet"] as any)  // manufacturer dirs
        .mockReturnValueOnce(["fixture1.qxf", "fixture2.qxf", "readme.txt"] as any)  // american-dj files
        .mockReturnValueOnce(["fixture3.qxf"] as any);  // chauvet files

      // Mock XML parsing
      const mockParser = new xml2js.Parser();
      (mockParser.parseStringPromise as jest.Mock)
        .mockResolvedValueOnce({
          FixtureDefinition: {
            Manufacturer: ["American DJ"],
            Model: ["Test Fixture 1"],
            Type: ["LED PAR"],
            Channel: [
              { $: { Name: "Red", Preset: "IntensityRed" } },
              { $: { Name: "Green", Preset: "IntensityGreen" } },
            ],
            Mode: [{
              $: { Name: "2-Channel" },
              Channel: [
                { $: { Number: "0" }, _: "Red" },
                { $: { Number: "1" }, _: "Green" },
              ]
            }]
          }
        })
        .mockResolvedValueOnce({
          FixtureDefinition: {
            Manufacturer: ["American DJ"],
            Model: ["Test Fixture 2"],
            Type: ["LED PAR"],
            Channel: [{ $: { Name: "Intensity" } }],
            Mode: [{
              $: { Name: "1-Channel" },
              Channel: [{ $: { Number: "0" }, _: "Intensity" }]
            }]
          }
        })
        .mockResolvedValueOnce({
          FixtureDefinition: {
            Manufacturer: ["Chauvet"],
            Model: ["RGB Light"],
            Type: ["LED PAR"],
          }
        });

      await library.loadFixtureLibrary();

      const fixtures = library["fixtures"];
      expect(fixtures.size).toBe(3);
      expect(fixtures.has("American DJ/Test Fixture 1")).toBe(true);
      expect(fixtures.has("American DJ/Test Fixture 2")).toBe(true);
      expect(fixtures.has("Chauvet/RGB Light")).toBe(true);
    });

    it("should skip invalid fixture files", async () => {
      mockFs.readdirSync
        .mockReturnValueOnce(["test-manufacturer"] as any)
        .mockReturnValueOnce(["valid.qxf", "invalid.qxf"] as any);

      const mockParser = new xml2js.Parser();
      (mockParser.parseStringPromise as jest.Mock)
        .mockResolvedValueOnce({
          FixtureDefinition: {
            Manufacturer: ["Test"],
            Model: ["Valid"],
            Type: ["LED"],
          }
        })
        .mockRejectedValueOnce(new Error("Parse error"));

      await library.loadFixtureLibrary();

      const fixtures = library["fixtures"];
      expect(fixtures.size).toBe(1);
      expect(fixtures.has("Test/Valid")).toBe(true);
    });

    it("should handle fixtures without channels or modes", async () => {
      mockFs.readdirSync
        .mockReturnValueOnce(["manufacturer"] as any)
        .mockReturnValueOnce(["simple.qxf"] as any);

      const mockParser = new xml2js.Parser();
      (mockParser.parseStringPromise as jest.Mock).mockResolvedValue({
        FixtureDefinition: {
          Manufacturer: ["Simple"],
          Model: ["Light"],
          Type: ["Generic"],
          // No Channel or Mode arrays
        }
      });

      await library.loadFixtureLibrary();

      const fixture = library.getFixture("Simple", "Light");
      expect(fixture).toBeDefined();
      expect(fixture?.channels).toEqual([]);
      expect(fixture?.modes).toEqual([]);
    });
  });

  describe("searchFixtures", () => {
    beforeEach(async () => {
      // Setup test fixtures
      const fixtures = library["fixtures"];
      fixtures.set("American DJ/LED PAR 64", {
        manufacturer: "American DJ",
        model: "LED PAR 64",
        type: "LED PAR",
        modes: [],
        channels: [],
      });
      fixtures.set("Chauvet/LED EZpar T6", {
        manufacturer: "Chauvet",
        model: "LED EZpar T6",
        type: "LED PAR",
        modes: [],
        channels: [],
      });
      fixtures.set("Martin/MAC 250", {
        manufacturer: "Martin",
        model: "MAC 250",
        type: "Moving Head",
        modes: [],
        channels: [],
      });
    });

    it("should find fixtures by manufacturer", () => {
      const results = library.searchFixtures("american");
      expect(results).toHaveLength(1);
      expect(results[0].manufacturer).toBe("American DJ");
    });

    it("should find fixtures by model", () => {
      const results = library.searchFixtures("par");
      expect(results).toHaveLength(2);
      expect(results.map(f => f.manufacturer)).toEqual(
        expect.arrayContaining(["American DJ", "Chauvet"])
      );
    });

    it("should be case insensitive", () => {
      const results = library.searchFixtures("CHAUVET");
      expect(results).toHaveLength(1);
      expect(results[0].manufacturer).toBe("Chauvet");
    });

    it("should return empty array for no matches", () => {
      const results = library.searchFixtures("nonexistent");
      expect(results).toHaveLength(0);
    });

    it("should sort results by manufacturer then model", () => {
      const results = library.searchFixtures("led");
      expect(results).toHaveLength(2);
      expect(results[0].manufacturer).toBe("American DJ");
      expect(results[1].manufacturer).toBe("Chauvet");
    });
  });

  describe("getFixture", () => {
    beforeEach(() => {
      const fixtures = library["fixtures"];
      fixtures.set("Test/Fixture", {
        manufacturer: "Test",
        model: "Fixture",
        type: "LED",
        modes: [],
        channels: [],
      });
    });

    it("should return fixture when found", () => {
      const fixture = library.getFixture("Test", "Fixture");
      expect(fixture).toBeDefined();
      expect(fixture?.manufacturer).toBe("Test");
      expect(fixture?.model).toBe("Fixture");
    });

    it("should return undefined when not found", () => {
      const fixture = library.getFixture("Unknown", "Fixture");
      expect(fixture).toBeUndefined();
    });
  });

  describe("suggestFixtureMappings", () => {
    beforeEach(() => {
      const fixtures = library["fixtures"];
      fixtures.set("American DJ/LED PAR 64", {
        manufacturer: "American DJ",
        model: "LED PAR 64",
        type: "LED PAR",
        modes: [],
        channels: [],
      });
      fixtures.set("Chauvet/SlimPAR Pro H USB", {
        manufacturer: "Chauvet",
        model: "SlimPAR Pro H USB",
        type: "LED PAR",
        modes: [],
        channels: [],
      });
    });

    it("should suggest mappings for LacyLights fixtures", () => {
      const lacyFixtures = [
        { manufacturer: "American DJ", model: "LED PAR" },
        { manufacturer: "Chauvet", model: "SlimPAR" },
      ];

      const results = library.suggestFixtureMappings(lacyFixtures);

      expect(results).toHaveLength(2);
      expect(results[0].fixture).toEqual(lacyFixtures[0]);
      expect(results[0].suggestions).toHaveLength(1);
      expect(results[0].suggestions[0].model).toBe("LED PAR 64");

      expect(results[1].suggestions).toHaveLength(1);
      expect(results[1].suggestions[0].model).toBe("SlimPAR Pro H USB");
    });

    it("should limit suggestions to top 5", () => {
      const fixtures = library["fixtures"];
      // Add many fixtures that match "LED"
      for (let i = 1; i <= 10; i++) {
        fixtures.set(`Manufacturer${i}/LED Light ${i}`, {
          manufacturer: `Manufacturer${i}`,
          model: `LED Light ${i}`,
          type: "LED PAR",
          modes: [],
          channels: [],
        });
      }

      const results = library.suggestFixtureMappings([
        { manufacturer: "Test", model: "LED" }
      ]);

      expect(results[0].suggestions.length).toBeLessThanOrEqual(5);
    });
  });

  describe("findCompatibleFixtures", () => {
    beforeEach(() => {
      const fixtures = library["fixtures"];
      fixtures.set("Chauvet/SlimPAR T6", {
        manufacturer: "Chauvet",
        model: "SlimPAR T6",
        type: "LED PAR",
        modes: [
          {
            name: "3-Channel",
            channelCount: 3,
            channels: [
              { number: 0, name: "Red" },
              { number: 1, name: "Green" },
              { number: 2, name: "Blue" },
            ]
          },
          {
            name: "7-Channel",
            channelCount: 7,
            channels: [
              { number: 0, name: "Red" },
              { number: 1, name: "Green" },
              { number: 2, name: "Blue" },
              { number: 3, name: "Color Macro" },
              { number: 4, name: "Strobe" },
              { number: 5, name: "Dimmer" },
              { number: 6, name: "Auto Programs" },
            ]
          }
        ],
        channels: [],
      });
    });

    it("should find compatible fixtures with scoring", () => {
      const lacyFixture: LacyLightsFixtureDetails = {
        manufacturer: "Chauvet",
        model: "SlimPAR",
        channelCount: 3,
        channels: [
          { offset: 1, name: "Red", type: "RED" },
          { offset: 2, name: "Green", type: "GREEN" },
          { offset: 3, name: "Blue", type: "BLUE" },
        ]
      };

      const results = library.findCompatibleFixtures(lacyFixture);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].fixture.manufacturer).toBe("Chauvet");
      expect(results[0].fixture.model).toBe("SlimPAR T6");
      expect(results[0].score).toBeGreaterThan(0);
      expect(results[0].reasons).toEqual(expect.any(Array));
    });

    it("should handle fixtures without matching modes", () => {
      const lacyFixture: LacyLightsFixtureDetails = {
        manufacturer: "Unknown",
        model: "Fixture",
        channelCount: 10,
        channels: [
          { offset: 1, name: "Custom1", type: "OTHER" },
          { offset: 2, name: "Custom2", type: "OTHER" },
        ]
      };

      const results = library.findCompatibleFixtures(lacyFixture);

      // Should still return results but with lower scores
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("parseFixtureFile error handling", () => {
    it("should handle XML parsing errors", async () => {
      mockFs.readdirSync
        .mockReturnValueOnce(["manufacturer"] as any)
        .mockReturnValueOnce(["broken.qxf"] as any);

      const mockParser = new xml2js.Parser();
      (mockParser.parseStringPromise as jest.Mock)
        .mockRejectedValue(new Error("Invalid XML"));

      await library.loadFixtureLibrary();

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining("Failed to parse fixture file"),
        expect.any(Error)
      );
    });

    it("should handle fixtures without FixtureDefinition", async () => {
      mockFs.readdirSync
        .mockReturnValueOnce(["manufacturer"] as any)
        .mockReturnValueOnce(["empty.qxf"] as any);

      const mockParser = new xml2js.Parser();
      (mockParser.parseStringPromise as jest.Mock)
        .mockResolvedValue({}); // No FixtureDefinition

      await library.loadFixtureLibrary();

      const fixtures = library["fixtures"];
      expect(fixtures.size).toBe(0);
    });

    it("should handle file read errors", async () => {
      mockFs.readdirSync
        .mockReturnValueOnce(["manufacturer"] as any)
        .mockReturnValueOnce(["unreadable.qxf"] as any);

      mockFs.readFileSync.mockImplementation(() => {
        throw new Error("File read error");
      });

      await library.loadFixtureLibrary();

      expect(mockConsoleError).toHaveBeenCalled();
    });
  });

  describe("channel and mode parsing", () => {
    it("should parse channels with all attributes", async () => {
      mockFs.readdirSync
        .mockReturnValueOnce(["test"] as any)
        .mockReturnValueOnce(["detailed.qxf"] as any);

      const mockParser = new xml2js.Parser();
      (mockParser.parseStringPromise as jest.Mock).mockResolvedValue({
        FixtureDefinition: {
          Manufacturer: ["Test"],
          Model: ["Detailed"],
          Type: ["LED"],
          Channel: [
            { $: { Name: "Red Intensity", Preset: "IntensityRed" } },
            { $: { Name: "Green Intensity", Preset: "IntensityGreen" } },
            { $: { Name: "Blue Intensity" } }, // No preset
          ],
          Mode: [{
            $: { Name: "RGB Mode" },
            Channel: [
              { $: { Number: "0" }, _: "Red Intensity" },
              { $: { Number: "1" }, _: "Green Intensity" },
              { $: { Number: "2" }, _: "Blue Intensity" },
            ]
          }]
        }
      });

      await library.loadFixtureLibrary();

      const fixture = library.getFixture("Test", "Detailed");
      expect(fixture?.channels).toHaveLength(3);
      expect(fixture?.channels[0]).toEqual({
        name: "Red Intensity",
        preset: "IntensityRed"
      });
      expect(fixture?.channels[2]).toEqual({
        name: "Blue Intensity",
        preset: undefined
      });

      expect(fixture?.modes).toHaveLength(1);
      expect(fixture?.modes[0]).toEqual({
        name: "RGB Mode",
        channelCount: 3,
        channels: [
          { number: 0, name: "Red Intensity" },
          { number: 1, name: "Green Intensity" },
          { number: 2, name: "Blue Intensity" },
        ]
      });
    });

    it("should handle mode channels without names", async () => {
      mockFs.readdirSync
        .mockReturnValueOnce(["test"] as any)
        .mockReturnValueOnce(["minimal.qxf"] as any);

      const mockParser = new xml2js.Parser();
      (mockParser.parseStringPromise as jest.Mock).mockResolvedValue({
        FixtureDefinition: {
          Manufacturer: ["Test"],
          Model: ["Minimal"],
          Type: ["Generic"],
          Mode: [{
            $: { Name: "Basic" },
            Channel: [
              { $: { Number: "0" } }, // No name
              { $: {} }, // No number or name
            ]
          }]
        }
      });

      await library.loadFixtureLibrary();

      const fixture = library.getFixture("Test", "Minimal");
      expect(fixture?.modes[0].channels).toEqual([
        { number: 0, name: "Channel 0" },
        { number: 0, name: "Channel 0" },
      ]);
    });
  });

  describe("calculateFixtureCompatibility", () => {
    beforeEach(() => {
      const fixtures = library["fixtures"];
      fixtures.set("Chauvet/SlimPAR T6", {
        manufacturer: "Chauvet",
        model: "SlimPAR T6",
        type: "LED PAR",
        modes: [
          {
            name: "RGB Mode",
            channelCount: 3,
            channels: [
              { number: 0, name: "Red" },
              { number: 1, name: "Green" },
              { number: 2, name: "Blue" },
            ]
          }
        ],
        channels: [],
      });

      fixtures.set("Chauvet DJ/LED EZpar Pro", {
        manufacturer: "Chauvet DJ",
        model: "LED EZpar Pro",
        type: "LED PAR",
        modes: [
          {
            name: "RGBA Mode",
            channelCount: 4,
            channels: [
              { number: 0, name: "Red" },
              { number: 1, name: "Green" },
              { number: 2, name: "Blue" },
              { number: 3, name: "Amber" },
            ]
          }
        ],
        channels: [],
      });

      fixtures.set("American DJ/LED Par Different", {
        manufacturer: "American DJ",
        model: "LED Par Different",
        type: "LED PAR",
        modes: [
          {
            name: "Test Mode",
            channelCount: 5,
            channels: [
              { number: 0, name: "Master Intensity" },
              { number: 1, name: "Strobe Effect" },
              { number: 2, name: "Color Macro" },
              { number: 3, name: "Auto Programs" },
              { number: 4, name: "Red Channel" },
            ]
          }
        ],
        channels: [],
      });
    });

    it("should score partial manufacturer matches correctly", () => {
      const lacyFixture: LacyLightsFixtureDetails = {
        manufacturer: "Chauvet",
        model: "LED EZpar",
        channelCount: 4,
        channels: [
          { offset: 1, name: "Red", type: "RED" },
          { offset: 2, name: "Green", type: "GREEN" },
          { offset: 3, name: "Blue", type: "BLUE" },
          { offset: 4, name: "Amber", type: "AMBER" },
        ]
      };

      const results = library.findCompatibleFixtures(lacyFixture);

      // Should find partial match with "Chauvet DJ" even though input is just "Chauvet"
      const chauvetDJMatch = results.find(r => r.fixture.manufacturer === "Chauvet DJ");
      expect(chauvetDJMatch).toBeDefined();
      expect(chauvetDJMatch!.reasons.some(reason => reason.includes("Partial manufacturer match"))).toBe(true);
    });

    it("should handle channel count differences with scoring", () => {
      const lacyFixture: LacyLightsFixtureDetails = {
        manufacturer: "Chauvet",  // Use manufacturer that exists in our fixtures
        model: "SlimPAR",  // Use model name that will match
        channelCount: 4, // Close to 3-channel fixture
        channels: [
          { offset: 1, name: "Red", type: "RED" },
          { offset: 2, name: "Green", type: "GREEN" },
          { offset: 3, name: "Blue", type: "BLUE" },
          { offset: 4, name: "Extra", type: "OTHER" },
        ]
      };

      const results = library.findCompatibleFixtures(lacyFixture);
      const slimParMatch = results.find(r => r.fixture.model === "SlimPAR T6");

      expect(slimParMatch).toBeDefined();
      expect(slimParMatch!.reasons.some(reason => reason.includes("Similar channel count"))).toBe(true);
    });

    it("should score exact channel count matches higher", () => {
      const lacyFixture: LacyLightsFixtureDetails = {
        manufacturer: "Chauvet",  // Use manufacturer that exists
        model: "SlimPAR",  // Use model name that will match
        channelCount: 3,  // Exact match with SlimPAR T6
        channels: [
          { offset: 1, name: "Red", type: "RED" },
          { offset: 2, name: "Green", type: "GREEN" },
          { offset: 3, name: "Blue", type: "BLUE" },
        ]
      };

      const results = library.findCompatibleFixtures(lacyFixture);
      const exactMatch = results.find(r => r.fixture.model === "SlimPAR T6");

      expect(exactMatch).toBeDefined();
      expect(exactMatch!.reasons.some(reason => reason.includes("Exact channel count match"))).toBe(true);
      expect(exactMatch!.score).toBeGreaterThan(50); // Should have high score for exact match
    });

    it("should handle mode name matching when lacyFixture has mode", () => {
      const lacyFixture: LacyLightsFixtureDetails = {
        manufacturer: "Chauvet",
        model: "Test",
        mode: "RGB", // This should match "RGB Mode"
        channelCount: 3,
        channels: [
          { offset: 1, name: "Red", type: "RED" },
          { offset: 2, name: "Green", type: "GREEN" },
          { offset: 3, name: "Blue", type: "BLUE" },
        ]
      };

      const results = library.findCompatibleFixtures(lacyFixture);
      const rgbMatch = results.find(r => r.fixture.model === "SlimPAR T6");

      expect(rgbMatch).toBeDefined();
      expect(rgbMatch!.reasons).toContain("Mode name match");
    });

    it("should apply color channel missing penalties", () => {
      const lacyFixture: LacyLightsFixtureDetails = {
        manufacturer: "Chauvet",  // Use manufacturer that exists
        model: "RGB",  // Use model name that will match fixtures
        channelCount: 3,
        channels: [
          { offset: 1, name: "Red", type: "RED" },
          { offset: 2, name: "Green", type: "GREEN" },
          { offset: 3, name: "White", type: "WHITE" }, // Has White but QLC fixture has Blue instead
        ]
      };

      const results = library.findCompatibleFixtures(lacyFixture);

      // Should still get results but with penalties for missing color channels
      expect(results.length).toBeGreaterThan(0);
    });

    it("should score fixtures with 3+ color channel matches highly", () => {
      const lacyFixture: LacyLightsFixtureDetails = {
        manufacturer: "Chauvet DJ",  // Use exact manufacturer that exists
        model: "EZpar",  // Use model name that will match
        channelCount: 4,
        channels: [
          { offset: 1, name: "Red", type: "RED" },
          { offset: 2, name: "Green", type: "GREEN" },
          { offset: 3, name: "Blue", type: "BLUE" },
          { offset: 4, name: "Amber", type: "AMBER" },
        ]
      };

      const results = library.findCompatibleFixtures(lacyFixture);
      const rgbaMatch = results.find(r => r.fixture.model === "LED EZpar Pro");

      expect(rgbaMatch).toBeDefined();
      expect(rgbaMatch!.reasons.some(reason => reason.includes("4 color channels match"))).toBe(true);
    });

    it("should score fixtures with 2 color channel matches moderately", () => {
      const lacyFixture: LacyLightsFixtureDetails = {
        manufacturer: "Chauvet",  // Use manufacturer that exists
        model: "SlimPAR",  // Use model that will match
        channelCount: 2,
        channels: [
          { offset: 1, name: "Red", type: "RED" },
          { offset: 2, name: "Green", type: "GREEN" },
        ]
      };

      const results = library.findCompatibleFixtures(lacyFixture);
      const rgMatch = results.find(r => r.fixture.model === "SlimPAR T6");

      expect(rgMatch).toBeDefined();
      expect(rgMatch!.reasons.some(reason => reason.includes("2 color channels match"))).toBe(true);
    });

    it("should score fixtures with 1 color channel match lowly", () => {
      const lacyFixture: LacyLightsFixtureDetails = {
        manufacturer: "Chauvet",  // Use manufacturer that exists
        model: "SlimPAR",  // Use model that will match
        channelCount: 1,
        channels: [
          { offset: 1, name: "Red", type: "RED" },
        ]
      };

      const results = library.findCompatibleFixtures(lacyFixture);
      const rMatch = results.find(r => r.fixture.model === "SlimPAR T6");

      expect(rMatch).toBeDefined();
      expect(rMatch!.reasons.some(reason => reason.includes("1 color channel matches"))).toBe(true);
    });

    it("should detect intensity channel compatibility", () => {
      const lacyFixture: LacyLightsFixtureDetails = {
        manufacturer: "American DJ",
        model: "Test",
        channelCount: 5,
        channels: [
          { offset: 1, name: "Master", type: "INTENSITY" },
          { offset: 2, name: "Strobe", type: "STROBE" },
          { offset: 3, name: "Macro", type: "COLOR_MACRO" },
          { offset: 4, name: "Auto", type: "OTHER" },
          { offset: 5, name: "Red", type: "RED" },
        ]
      };

      const results = library.findCompatibleFixtures(lacyFixture);
      const intensityMatch = results.find(r => r.fixture.model === "LED Par Different");

      expect(intensityMatch).toBeDefined();
      expect(intensityMatch!.reasons).toContain("Both have intensity channel");
    });

    it("should detect special effect channel matches", () => {
      const lacyFixture: LacyLightsFixtureDetails = {
        manufacturer: "American DJ",
        model: "LED",  // Use model name that will match
        channelCount: 3,
        channels: [
          { offset: 1, name: "Strobe Speed", type: "STROBE" },
          { offset: 2, name: "Color Macros", type: "MACRO" },  // Use MACRO instead of COLOR_MACRO
          { offset: 3, name: "Effect Select", type: "EFFECT" },  // Use EFFECT instead of OTHER
        ]
      };

      const results = library.findCompatibleFixtures(lacyFixture);
      const effectsMatch = results.find(r => r.fixture.model === "LED Par Different");

      expect(effectsMatch).toBeDefined();
      expect(effectsMatch!.reasons.some(reason => reason.includes("Both have strobe channel"))).toBe(true);
      expect(effectsMatch!.reasons.some(reason => reason.includes("Both have macro channel"))).toBe(true);
    });

    it("should detect lack of intensity channel compatibility", () => {
      const lacyFixture: LacyLightsFixtureDetails = {
        manufacturer: "Chauvet",  // Use manufacturer that exists
        model: "SlimPAR",  // Use model that will match
        channelCount: 3,
        channels: [
          { offset: 1, name: "Red", type: "RED" },
          { offset: 2, name: "Green", type: "GREEN" },
          { offset: 3, name: "Blue", type: "BLUE" },
        ]
      };

      const results = library.findCompatibleFixtures(lacyFixture);
      const noIntensityMatch = results.find(r => r.fixture.model === "SlimPAR T6");

      expect(noIntensityMatch).toBeDefined();
      expect(noIntensityMatch!.reasons.some(reason => reason.includes("Both lack intensity channel"))).toBe(true);
    });
  });

  describe("suggestFixtureMappingsEnhanced", () => {
    it("should limit results to top 5 suggestions", () => {
      const fixtures = library["fixtures"];
      // Add many similar fixtures
      for (let i = 1; i <= 10; i++) {
        fixtures.set(`Test${i}/LED Fixture ${i}`, {
          manufacturer: `Test${i}`,
          model: `LED Fixture ${i}`,
          type: "LED PAR",
          modes: [
            {
              name: "RGB Mode",
              channelCount: 3,
              channels: [
                { number: 0, name: "Red" },
                { number: 1, name: "Green" },
                { number: 2, name: "Blue" },
              ]
            }
          ],
          channels: [],
        });
      }

      const lacyFixtures: LacyLightsFixtureDetails[] = [
        {
          manufacturer: "Test",
          model: "LED",
          channelCount: 3,
          channels: [
            { offset: 1, name: "Red", type: "RED" },
            { offset: 2, name: "Green", type: "GREEN" },
            { offset: 3, name: "Blue", type: "BLUE" },
          ]
        }
      ];

      const results = library.suggestFixtureMappingsEnhanced(lacyFixtures);

      expect(results).toHaveLength(1);
      expect(results[0].compatibleFixtures.length).toBeLessThanOrEqual(5);
    });

    it("should handle multiple input fixtures", () => {
      const fixtures = library["fixtures"];
      fixtures.set("Test/RGB Light", {
        manufacturer: "Test",
        model: "RGB Light",
        type: "LED PAR",
        modes: [
          {
            name: "RGB Mode",
            channelCount: 3,
            channels: [
              { number: 0, name: "Red" },
              { number: 1, name: "Green" },
              { number: 2, name: "Blue" },
            ]
          }
        ],
        channels: [],
      });

      const lacyFixtures: LacyLightsFixtureDetails[] = [
        {
          manufacturer: "Test1",
          model: "RGB",
          channelCount: 3,
          channels: [
            { offset: 1, name: "Red", type: "RED" },
            { offset: 2, name: "Green", type: "GREEN" },
            { offset: 3, name: "Blue", type: "BLUE" },
          ]
        },
        {
          manufacturer: "Test2",
          model: "Different",
          channelCount: 1,
          channels: [
            { offset: 1, name: "Intensity", type: "INTENSITY" },
          ]
        }
      ];

      const results = library.suggestFixtureMappingsEnhanced(lacyFixtures);

      expect(results).toHaveLength(2);
      expect(results[0].fixture).toEqual(lacyFixtures[0]);
      expect(results[1].fixture).toEqual(lacyFixtures[1]);
    });
  });
});