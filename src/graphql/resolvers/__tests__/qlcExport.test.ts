import * as xml2js from "xml2js";
import { qlcExportResolvers } from "../qlcExport";
import { QLCFixtureLibrary } from "../../../services/qlcFixtureLibrary";

// Mock dependencies
jest.mock("xml2js");
jest.mock("../../../services/qlcFixtureLibrary");

const mockXml2js = xml2js as jest.Mocked<typeof xml2js>;
const MockQLCFixtureLibrary = QLCFixtureLibrary as jest.MockedClass<typeof QLCFixtureLibrary>;

// Mock context
const mockContext = {
  prisma: {
    project: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    fixtureInstance: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    fixtureDefinition: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    scene: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    cueList: {
      create: jest.fn(),
    },
    cue: {
      create: jest.fn(),
    },
    fixtureValue: {
      createMany: jest.fn(),
    },
  },
};

// Create global mocks for xml2js to avoid redefinition errors
const mockBuilderInstance = {
  buildObject: jest.fn().mockReturnValue('<?xml version="1.0" encoding="UTF-8"?><test></test>'),
};
const mockParserInstance = {
  parseStringPromise: jest.fn(),
};
const mockBuilder = jest.fn().mockReturnValue(mockBuilderInstance);
const mockParser = jest.fn().mockReturnValue(mockParserInstance);

describe("qlcExportResolvers", () => {
  let mockQLCInstance: {
    loadFixtureLibrary: jest.MockedFunction<any>;
    suggestFixtureMappings: jest.MockedFunction<any>;
    getDefaultMappings: jest.MockedFunction<any>;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Skip xml2js mocking due to readonly property issues - focus on other coverage
    mockBuilder.mockClear();
    mockParser.mockClear();
    mockBuilderInstance.buildObject.mockClear();
    mockParserInstance.parseStringPromise.mockClear();

    // Setup QLCFixtureLibrary mock
    mockQLCInstance = {
      loadFixtureLibrary: jest.fn(),
      suggestFixtureMappings: jest.fn(),
      getDefaultMappings: jest.fn(),
    };
    MockQLCFixtureLibrary.mockImplementation(() => mockQLCInstance as any);
  });

  describe("Query.getQLCFixtureMappingSuggestions", () => {
    it("should return fixture mapping suggestions", async () => {
      const mockFixtures = [
        {
          id: "fixture-1",
          manufacturer: "Chauvet",
          model: "SlimPAR Pro",
          definition: {
            manufacturer: "Chauvet",
            model: "SlimPAR Pro H USB",
          },
        },
      ];

      const mockSuggestions = [
        {
          fixture: { manufacturer: "Chauvet", model: "SlimPAR Pro" },
          suggestions: [
            {
              manufacturer: "Chauvet",
              model: "SlimPAR Pro H USB",
              type: "LED PAR",
              modes: [],
              channels: [],
            },
          ],
        },
      ];

      const mockDefaultMappings = [
        {
          lacyLightsKey: "Chauvet/SlimPAR Pro",
          qlcManufacturer: "Chauvet",
          qlcModel: "SlimPAR Pro H USB",
          qlcMode: "6-Channel",
        },
      ];

      mockContext.prisma.fixtureInstance.findMany.mockResolvedValue(mockFixtures as any);

      mockQLCInstance.loadFixtureLibrary.mockResolvedValue(undefined);
      mockQLCInstance.suggestFixtureMappings.mockReturnValue(mockSuggestions);
      mockQLCInstance.getDefaultMappings.mockReturnValue(mockDefaultMappings);

      const result = await qlcExportResolvers.Query.getQLCFixtureMappingSuggestions(
        {},
        { projectId: "project-1" },
        mockContext as any
      );

      expect(result).toEqual({
        projectId: "project-1",
        lacyLightsFixtures: [{ manufacturer: "Chauvet", model: "SlimPAR Pro" }],
        suggestions: mockSuggestions,
        defaultMappings: mockDefaultMappings,
      });

      expect(mockContext.prisma.fixtureInstance.findMany).toHaveBeenCalledWith({
        where: { projectId: "project-1" },
        include: { definition: true },
        distinct: ["definitionId"],
      });
    });

    it("should handle fixtures with definition fallback", async () => {
      const mockFixtures = [
        {
          id: "fixture-1",
          manufacturer: null,
          model: null,
          definition: {
            manufacturer: "American DJ",
            model: "LED PAR 64",
          },
        },
      ];

      mockContext.prisma.fixtureInstance.findMany.mockResolvedValue(mockFixtures as any);

      mockQLCInstance.loadFixtureLibrary.mockResolvedValue(undefined);
      mockQLCInstance.suggestFixtureMappings.mockReturnValue([]);
      mockQLCInstance.getDefaultMappings.mockReturnValue([]);

      const result = await qlcExportResolvers.Query.getQLCFixtureMappingSuggestions(
        {},
        { projectId: "project-1" },
        mockContext as any
      );

      expect(result.lacyLightsFixtures).toEqual([
        { manufacturer: "American DJ", model: "LED PAR 64" }
      ]);
    });
  });

  describe("Mutation.exportProjectToQLC", () => {
    it("should export project to QLC format", async () => {
      const mockProject = {
        id: "project-1",
        name: "Test Project",
        fixtures: [
          {
            id: "fixture-1",
            name: "Test Light 1",
            manufacturer: "Chauvet",
            model: "SlimPAR Pro",
            universe: 1,
            startChannel: 1,
            channelCount: 6,
            channels: [
              { id: "ch-1", name: "Red", offset: 1 },
              { id: "ch-2", name: "Green", offset: 2 },
            ],
            definition: {
              manufacturer: "Chauvet",
              model: "SlimPAR Pro H USB",
            },
          },
        ],
        scenes: [
          {
            id: "scene-1",
            name: "Scene 1",
            fixtureValues: [
              {
                fixtureId: "fixture-1",
                fixture: { id: "fixture-1" },
                channelValues: [255, 128, 64],
              },
            ],
          },
        ],
        cueLists: [
          {
            id: "cuelist-1",
            name: "Cue List 1",
            cues: [
              {
                id: "cue-1",
                sceneId: "scene-1",
                cueNumber: 1,
                fadeInTime: 2.5,
                fadeOutTime: 3.0,
              },
            ],
          },
        ],
      };

      mockContext.prisma.project.findUnique.mockResolvedValue(mockProject as any);

      const mockBuilder = {
        buildObject: jest.fn().mockReturnValue('<?xml version="1.0" encoding="UTF-8"?><Workspace></Workspace>'),
      };
      (mockXml2js.Builder as jest.Mock).mockReturnValue(mockBuilder);

      const result = await qlcExportResolvers.Mutation.exportProjectToQLC(
        {},
        { projectId: "project-1", fixtureMappings: [] },
        mockContext as any
      );

      expect(result.projectName).toBe("Test Project");
      expect(result.xmlContent).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(result.xmlContent).toContain('<!DOCTYPE Workspace>');
      expect(result.fixtureCount).toBe(1);
      expect(result.sceneCount).toBe(1);
      expect(result.cueListCount).toBe(1);

      expect(mockBuilder.buildObject).toHaveBeenCalledWith({
        Workspace: expect.objectContaining({
          $: expect.objectContaining({
            xmlns: "http://www.qlcplus.org/Workspace",
            CurrentWindow: "FunctionManager",
          }),
          Engine: expect.objectContaining({
            Fixture: expect.arrayContaining([
              expect.objectContaining({
                Manufacturer: "Chauvet",
                Model: "SlimPAR Pro",
                Name: "Test Light 1",
                Universe: "0", // 0-based
                Address: "0", // 0-based
                Channels: "6",
              }),
            ]),
            Function: expect.arrayContaining([
              expect.objectContaining({
                $: expect.objectContaining({
                  Type: "Scene",
                  Name: "Scene 1",
                }),
              }),
              expect.objectContaining({
                $: expect.objectContaining({
                  Type: "Chaser",
                  Name: "Cue List 1",
                }),
              }),
            ]),
          }),
        }),
      });
    });

    it("should handle project not found", async () => {
      mockContext.prisma.project.findUnique.mockResolvedValue(null);

      await expect(
        qlcExportResolvers.Mutation.exportProjectToQLC(
          {},
          { projectId: "nonexistent" },
          mockContext as any
        )
      ).rejects.toThrow("Project not found");
    });

    it("should use provided fixture mappings", async () => {
      const mockProject = {
        id: "project-1",
        name: "Test Project",
        fixtures: [
          {
            id: "fixture-1",
            name: "Test Light",
            manufacturer: "Generic",
            model: "LED PAR",
            universe: 1,
            startChannel: 1,
            channelCount: 3,
            channels: [],
            definition: { manufacturer: "Generic", model: "LED PAR" },
          },
        ],
        scenes: [],
        cueLists: [],
      };

      const customMappings = [
        {
          lacyLightsKey: "Generic/LED PAR",
          qlcManufacturer: "Chauvet",
          qlcModel: "SlimPAR Pro H USB",
          qlcMode: "6-Channel",
        },
      ];

      mockContext.prisma.project.findUnique.mockResolvedValue(mockProject as any);

      const mockBuilder = {
        buildObject: jest.fn().mockReturnValue('<xml></xml>'),
      };
      (mockXml2js.Builder as jest.Mock).mockReturnValue(mockBuilder);

      await qlcExportResolvers.Mutation.exportProjectToQLC(
        {},
        { projectId: "project-1", fixtureMappings: customMappings },
        mockContext as any
      );

      expect(mockBuilder.buildObject).toHaveBeenCalledWith(
        expect.objectContaining({
          Workspace: expect.objectContaining({
            Engine: expect.objectContaining({
              Fixture: expect.arrayContaining([
                expect.objectContaining({
                  Manufacturer: "Chauvet",
                  Model: "SlimPAR Pro H USB",
                  Mode: "6-Channel",
                }),
              ]),
            }),
          }),
        })
      );
    });

    it("should handle scene fixture values correctly", async () => {
      const mockProject = {
        id: "project-1",
        name: "Test Project",
        fixtures: [
          {
            id: "fixture-1",
            name: "Test Light",
            manufacturer: "Test",
            model: "Light",
            universe: 1,
            startChannel: 1,
            channelCount: 3,
            channels: [],
            definition: { manufacturer: "Test", model: "Light" },
          },
        ],
        scenes: [
          {
            id: "scene-1",
            name: "Test Scene",
            fixtureValues: [
              {
                fixtureId: "fixture-1",
                fixture: { id: "fixture-1" },
                channelValues: [255, 128, 64],
              },
            ],
          },
          {
            id: "scene-2",
            name: "Empty Scene",
            fixtureValues: [],
          },
        ],
        cueLists: [],
      };

      mockContext.prisma.project.findUnique.mockResolvedValue(mockProject as any);

      const mockBuilder = {
        buildObject: jest.fn().mockReturnValue('<xml></xml>'),
      };
      (mockXml2js.Builder as jest.Mock).mockReturnValue(mockBuilder);

      await qlcExportResolvers.Mutation.exportProjectToQLC(
        {},
        { projectId: "project-1", fixtureMappings: [] },
        mockContext as any
      );

      const sceneFunction = mockBuilder.buildObject.mock.calls[0][0].Workspace.Engine.Function[0];
      expect(sceneFunction.FixtureVal[0]._).toBe("0,255,1,128,2,64");

      const emptySceneFunction = mockBuilder.buildObject.mock.calls[0][0].Workspace.Engine.Function[1];
      expect(emptySceneFunction.FixtureVal[0].$).toEqual({ ID: "0" });
      expect(emptySceneFunction.FixtureVal[0]._).toBeUndefined();
    });

    it("should handle cue list timing correctly", async () => {
      const mockProject = {
        id: "project-1",
        name: "Test Project",
        fixtures: [],
        scenes: [{ id: "scene-1", name: "Scene 1" }],
        cueLists: [
          {
            id: "cuelist-1",
            name: "Test Cue List",
            cues: [
              {
                id: "cue-1",
                sceneId: "scene-1",
                cueNumber: 1,
                fadeInTime: 2.5,  // 2.5 seconds
                fadeOutTime: 3.25, // 3.25 seconds
              },
            ],
          },
        ],
      };

      mockContext.prisma.project.findUnique.mockResolvedValue(mockProject as any);

      const mockBuilder = {
        buildObject: jest.fn().mockReturnValue('<xml></xml>'),
      };
      (mockXml2js.Builder as jest.Mock).mockReturnValue(mockBuilder);

      await qlcExportResolvers.Mutation.exportProjectToQLC(
        {},
        { projectId: "project-1", fixtureMappings: [] },
        mockContext as any
      );

      const functions = mockBuilder.buildObject.mock.calls[0][0].Workspace.Engine.Function;
      const chaserFunction = functions.find((f: any) => f.$.Type === "Chaser");
      expect(chaserFunction.Step[0].$).toEqual({
        Number: "0",
        FadeIn: "2500",  // milliseconds
        Hold: "4294967294", // QLC+ default hold time
        FadeOut: "3250", // milliseconds
      });
    });
  });

  describe("Mutation.importProjectFromQLC", () => {
    const mockWorkspace = {
      Workspace: {
        Engine: [{
          Fixture: [
            {
              Manufacturer: ["Chauvet"],
              Model: ["SlimPAR Pro H USB"],
              Mode: ["6-Channel"],
              Name: ["Test Light 1"],
              Universe: ["0"], // 0-based in QLC+
              Address: ["0"],   // 0-based in QLC+
              Channels: ["6"],
              ID: ["0"],
            },
          ],
          Function: [
            {
              $: { ID: "0", Type: "Scene", Name: "Test Scene" },
              FixtureVal: [
                {
                  $: { ID: "0" },
                  _: "0,255,1,128,2,64",
                },
              ],
            },
          ],
        }],
      },
    };

    beforeEach(() => {
      const mockParser = {
        parseStringPromise: jest.fn().mockResolvedValue(mockWorkspace),
      };
      (mockXml2js.Parser as any).mockReturnValue(mockParser);

      // Mock fixture definition lookup
      mockContext.prisma.fixtureDefinition.findFirst.mockResolvedValue({
        id: "def-1",
        manufacturer: "Chauvet",
        model: "SlimPAR Pro H USB",
        type: "LED_PAR",
        modes: [{
          id: "mode-1",
          name: "6-Channel",
          channelCount: 6,
        }],
        channels: [
          { id: "ch-1", name: "Red", type: "RED", offset: 1, minValue: 0, maxValue: 255, defaultValue: 0 },
          { id: "ch-2", name: "Green", type: "GREEN", offset: 2, minValue: 0, maxValue: 255, defaultValue: 0 },
        ],
      });

      mockContext.prisma.fixtureDefinition.findUnique.mockResolvedValue({
        id: "def-1",
        manufacturer: "Chauvet",
        model: "SlimPAR Pro H USB",
        channels: [
          { id: "ch-1", name: "Red", type: "RED", offset: 1, minValue: 0, maxValue: 255, defaultValue: 0 },
        ],
        modes: [{
          id: "mode-1",
          name: "6-Channel",
          channelCount: 6,
          modeChannels: [
            {
              offset: 1,
              channel: { name: "Red", type: "RED", minValue: 0, maxValue: 255, defaultValue: 0 },
            },
          ],
        }],
      });

      // Mock project creation
      mockContext.prisma.project.create.mockResolvedValue({
        id: "project-1",
        name: "test_2025-01-01_12-00-00",
      });

      // Mock fixture instance creation
      mockContext.prisma.fixtureInstance.create.mockResolvedValue({
        id: "fixture-1",
        name: "Test Light 1",
        channelCount: 6,
      });

      // Mock final project fetch
      mockContext.prisma.project.findUnique.mockResolvedValue({
        id: "project-1",
        name: "test_2025-01-01_12-00-00",
        fixtures: [],
        scenes: [],
        cueLists: [],
        users: [],
      });

      // Mock scene queries
      mockContext.prisma.scene.findMany.mockResolvedValue([]);
    });

    it("should import QLC+ project successfully", async () => {
      const xmlContent = '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE Workspace><Workspace></Workspace>';

      const result = await qlcExportResolvers.Mutation.importProjectFromQLC(
        {},
        { xmlContent, originalFileName: "test.qxw" },
        mockContext as any
      );

      expect(result.project).toBeDefined();
      expect(result.originalFileName).toBe("test.qxw");
      expect(result.fixtureCount).toBe(1);
      expect(result.sceneCount).toBe(1);
      expect(result.warnings).toEqual(expect.any(Array));

      expect(mockContext.prisma.project.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: expect.stringMatching(/^test_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/),
          description: "Imported from QLC+ file: test.qxw",
        }),
      });
    });

    it("should handle invalid XML content", async () => {
      const mockParser = {
        parseStringPromise: jest.fn().mockResolvedValue({ NotWorkspace: {} }),
      };
      (mockXml2js.Parser as any).mockReturnValue(mockParser);

      await expect(
        qlcExportResolvers.Mutation.importProjectFromQLC(
          {},
          { xmlContent: "<invalid></invalid>", originalFileName: "test.qxw" },
          mockContext as any
        )
      ).rejects.toThrow("Invalid QLC+ file: Missing Workspace element");
    });

    it("should handle fixtures without exact match", async () => {
      mockContext.prisma.fixtureDefinition.findFirst.mockResolvedValueOnce(null);
      mockContext.prisma.fixtureDefinition.findMany.mockResolvedValue([
        {
          id: "def-2",
          manufacturer: "Chauvet DJ",
          model: "SlimPAR Pro",
          type: "LED_PAR",
          modes: [{ id: "mode-2", name: "3-Channel", channelCount: 6 }],
          channels: [],
        },
      ]);

      const result = await qlcExportResolvers.Mutation.importProjectFromQLC(
        {},
        { xmlContent: "<xml></xml>", originalFileName: "test.qxw" },
        mockContext as any
      );

      expect(result.warnings.some(w => w.includes("Manufacturer match"))).toBe(true);
    });

    it("should handle fixtures with no matching definition", async () => {
      mockContext.prisma.fixtureDefinition.findFirst.mockResolvedValue(null);
      mockContext.prisma.fixtureDefinition.findMany.mockResolvedValue([]);

      const result = await qlcExportResolvers.Mutation.importProjectFromQLC(
        {},
        { xmlContent: "<xml></xml>", originalFileName: "test.qxw" },
        mockContext as any
      );

      expect(result.warnings.some(w => w.includes("Could not find or match fixture"))).toBe(true);
    });

    it("should handle scene import with channel values", async () => {
      // Mock successful fixture creation first
      mockContext.prisma.fixtureInstance.create.mockResolvedValue({
        id: "fixture-1",
        channelCount: 6,
      });

      await qlcExportResolvers.Mutation.importProjectFromQLC(
        {},
        { xmlContent: "<xml></xml>", originalFileName: "test.qxw" },
        mockContext as any
      );

      expect(mockContext.prisma.scene.create).toHaveBeenCalledWith({
        data: {
          name: "Test Scene",
          description: "Imported from QLC+",
          projectId: "project-1",
          fixtureValues: {
            create: [{
              fixtureId: "fixture-1",
              channelValues: [255, 128, 64, 0, 0, 0],
            }],
          },
        },
      });
    });

    it("should handle parsing errors gracefully", async () => {
      const mockParser = {
        parseStringPromise: jest.fn().mockRejectedValue(new Error("Parse error")),
      };
      (mockXml2js.Parser as any).mockReturnValue(mockParser);

      await expect(
        qlcExportResolvers.Mutation.importProjectFromQLC(
          {},
          { xmlContent: "invalid", originalFileName: "test.qxw" },
          mockContext as any
        )
      ).rejects.toThrow("Failed to import QLC+ file: Error: Parse error");
    });

    it("should clean existing timestamps from filename", async () => {
      await qlcExportResolvers.Mutation.importProjectFromQLC(
        {},
        { xmlContent: "<xml></xml>", originalFileName: "test_2024-01-01_10-00-00.qxw" },
        mockContext as any
      );

      expect(mockContext.prisma.project.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: expect.stringMatching(/^test_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/),
        }),
      });
    });

    it("should handle fixture creation errors", async () => {
      mockContext.prisma.fixtureInstance.create.mockRejectedValue(new Error("Creation failed"));

      const result = await qlcExportResolvers.Mutation.importProjectFromQLC(
        {},
        { xmlContent: "<xml></xml>", originalFileName: "test.qxw" },
        mockContext as any
      );

      expect(result.warnings.some(w => w.includes("Failed to create fixture"))).toBe(true);
    });

    it.skip("should handle cross-manufacturer model similarity matching during import", async () => {
      const mockWorkspace = {
        Workspace: {
          Engine: [{
            Fixture: [
              {
                Manufacturer: ["Generic"], // Different manufacturer
                Model: ["LED PAR ZOOM"], // Similar model to existing fixtures
                Mode: ["8-Channel"],
                Name: ["Generic Light"],
                Universe: ["0"],
                Address: ["0"],
                Channels: ["8"],
                ID: ["0"],
              },
            ],
            Function: [{
              $: { ID: "0", Type: "Scene", Name: "Test Scene" },
              FixtureVal: [{
                $: { ID: "0" },
                _: ["0,255,1,128,2,64"],
              }],
            }],
          }],
        },
      };

      mockParserInstance.parseStringPromise.mockResolvedValue(mockWorkspace);

      // Mock fixture definitions for similarity matching
      const mockFixtures = [
        {
          id: "fixture-def-1",
          manufacturer: "Martin", // Very different from "Generic" to avoid fuzzy match
          model: "LED PAR Professional", // Similar to "LED PAR ZOOM" - should match on "LED" and "PAR"
          type: "LED_PAR",
          modes: [
            { name: "8-Channel", channelCount: 8 }, // Matching channel count
          ],
        },
      ];
      mockContext.prisma.fixtureDefinition.findMany.mockResolvedValue(mockFixtures);

      // Mock project creation
      const mockProject = { id: "new-project", name: "Test Project" };
      mockContext.prisma.project.create.mockResolvedValue(mockProject);
      mockContext.prisma.fixtureInstance.create.mockResolvedValue({ id: "fixture-1" });
      mockContext.prisma.scene.create.mockResolvedValue({ id: "scene-1" });
      mockContext.prisma.fixtureValue.createMany.mockResolvedValue({ count: 1 });

      const result = await qlcExportResolvers.Mutation.importProjectFromQLC(
        {},
        { xmlContent: '<xml></xml>', originalFileName: "test.qxw" },
        mockContext as any
      );

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings).toEqual(expect.arrayContaining([
        expect.stringContaining("Model similarity match")
      ]));
    });
  });
});