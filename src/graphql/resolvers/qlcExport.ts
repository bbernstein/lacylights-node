import { Context } from "../../context";
import * as xml2js from "xml2js";
import {
  QLCFixtureLibrary,
  FixtureMapping,
} from "../../services/qlcFixtureLibrary";
import { ChannelType } from "../../types/enums";
import { serializeTags } from "../../utils/db-helpers";

// Constants
const FIXTURE_INDEX_DELIMITER = "|||";

export const qlcExportResolvers = {
  Query: {
    getQLCFixtureMappingSuggestions: async (
      _: any,
      { projectId }: { projectId: string },
      { prisma }: Context,
    ) => {
      // Get all unique fixtures in the project
      const fixtures = await prisma.fixtureInstance.findMany({
        where: { projectId },
        include: { definition: true },
        distinct: ["definitionId"],
      });

      // Load QLC+ fixture library
      const qlcLibrary = new QLCFixtureLibrary();
      await qlcLibrary.loadFixtureLibrary();

      // Get unique fixture types
      const uniqueFixtures = fixtures.map((f) => ({
        manufacturer: f.manufacturer || f.definition.manufacturer,
        model: f.model || f.definition.model,
      }));

      // Get suggestions and default mappings
      const suggestions = qlcLibrary.suggestFixtureMappings(uniqueFixtures);
      const defaultMappings = qlcLibrary.getDefaultMappings();

      return {
        projectId,
        lacyLightsFixtures: uniqueFixtures,
        suggestions,
        defaultMappings,
      };
    },
  },

  Mutation: {
    exportProjectToQLC: async (
      _: any,
      {
        projectId,
        fixtureMappings,
      }: { projectId: string; fixtureMappings?: FixtureMapping[] },
      { prisma }: Context,
    ) => {
      // Fetch project with all related data
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          fixtures: {
            include: {
              definition: true,
              channels: {
                orderBy: { offset: "asc" },
              },
            },
            orderBy: [
              { projectOrder: "asc" },
              { universe: "asc" },
              { startChannel: "asc" },
            ],
          },
          scenes: {
            include: {
              fixtureValues: {
                orderBy: [{ sceneOrder: "asc" }, { id: "asc" }],
                include: {
                  fixture: true,
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
          cueLists: {
            include: {
              cues: {
                include: {
                  scene: {
                    include: {
                      fixtureValues: true,
                    },
                  },
                },
                orderBy: { cueNumber: "asc" },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!project) {
        throw new Error("Project not found");
      }

      // Create mapping lookup for fixture definitions
      const mappingMap = new Map<string, FixtureMapping>();

      // Use provided mappings or defaults
      const mappingsToUse =
        fixtureMappings || new QLCFixtureLibrary().getDefaultMappings();

      for (const mapping of mappingsToUse) {
        mappingMap.set(mapping.lacyLightsKey, mapping);
      }

      // Build QLC+ XML structure
      const qlcProject = {
        Workspace: {
          $: {
            xmlns: "http://www.qlcplus.org/Workspace",
            CurrentWindow: "FunctionManager",
          },
          Creator: {
            Name: "Q Light Controller Plus",
            Version: "4.14.3",
            Author: "LacyLights Export",
          },
          Engine: {
            InputOutputMap: {
              BeatGenerator: {
                $: {
                  BeatType: "Disabled",
                  BPM: "0",
                },
              },
              Universe: project.fixtures
                .map((f) => f.universe)
                .filter((u, i, arr) => arr.indexOf(u) === i) // unique universes
                .map((universe) => ({
                  $: {
                    Name: `Universe ${universe}`,
                    ID: (universe - 1).toString(), // Convert to 0-based
                  },
                })),
            },
            Fixture: project.fixtures.map((fixture, index) => {
              const lacyKey = `${fixture.manufacturer || fixture.definition.manufacturer}/${fixture.model || fixture.definition.model}`;
              const mapping = mappingMap.get(lacyKey);

              return {
                Manufacturer:
                  mapping?.qlcManufacturer ||
                  fixture.manufacturer ||
                  fixture.definition.manufacturer,
                Model:
                  mapping?.qlcModel ||
                  fixture.model ||
                  fixture.definition.model,
                Mode: mapping?.qlcMode || fixture.modeName || "Default",
                ID: index.toString(),
                Name: fixture.name,
                Universe: (fixture.universe - 1).toString(), // Convert to 0-based
                Address: (fixture.startChannel - 1).toString(), // Convert to 0-based
                Channels:
                  fixture.channelCount?.toString() ||
                  fixture.channels.length.toString(),
              };
            }),
            Function: [
              // Add scenes as Scene functions
              ...project.scenes.map((scene, index) => ({
                $: {
                  ID: index.toString(),
                  Type: "Scene",
                  Name: scene.name,
                },
                Speed: {
                  $: {
                    FadeIn: "0",
                    FadeOut: "0",
                    Duration: "0",
                  },
                },
                FixtureVal: project.fixtures.map((fixture, fixtureIndex) => {
                  const fixtureValue = scene.fixtureValues.find(
                    (fv) => fv.fixtureId === fixture.id,
                  );

                  // channelValues might be a string (from DB) or array (if middleware deserialized it)
                  let channelValues: number[] = [];
                  if (fixtureValue?.channelValues) {
                    if (typeof fixtureValue.channelValues === 'string') {
                      try {
                        channelValues = JSON.parse(fixtureValue.channelValues);
                      } catch {
                        channelValues = [];
                      }
                    } else {
                      channelValues = fixtureValue.channelValues as number[];
                    }
                  }

                  if (fixtureValue && channelValues.length > 0) {
                    // Convert channel values array to comma-separated string
                    const channelValuesStr = channelValues
                      .map((value: number, channelIndex: number) => `${channelIndex},${value}`)
                      .join(",");

                    return {
                      $: { ID: fixtureIndex.toString() },
                      _: channelValuesStr,
                    };
                  } else {
                    // Empty fixture value for unused fixtures
                    return {
                      $: { ID: fixtureIndex.toString() },
                    };
                  }
                }),
              })),
              // Add cue lists as Chaser functions
              ...project.cueLists.map((cueList, listIndex) => ({
                $: {
                  ID: (project.scenes.length + listIndex).toString(),
                  Type: "Chaser",
                  Name: cueList.name,
                },
                Speed: {
                  $: {
                    FadeIn: "0",
                    FadeOut: "0",
                    Duration: "0",
                  },
                },
                Direction: "Forward",
                RunOrder: "Loop",
                SpeedModes: {
                  $: {
                    FadeIn: "PerStep",
                    FadeOut: "PerStep",
                    Duration: "PerStep",
                  },
                },
                Step: cueList.cues.map((cue, cueIndex) => {
                  const sceneIndex = project.scenes.findIndex(
                    (scene) => scene.id === cue.sceneId,
                  );
                  const QLC_DEFAULT_HOLD_TIME = "4294967294"; // QLC+ default infinite hold time (2^32 - 2)
                  return {
                    $: {
                      Number: cueIndex.toString(),
                      FadeIn: Math.round(cue.fadeInTime * 1000).toString(), // Convert to milliseconds
                      Hold: QLC_DEFAULT_HOLD_TIME,
                      FadeOut: Math.round(cue.fadeOutTime * 1000).toString(),
                    },
                    _: sceneIndex.toString(),
                  };
                }),
              })),
            ],
          },
          VirtualConsole: {
            Frame: {
              $: { Caption: "" },
              Appearance: {
                FrameStyle: "None",
                ForegroundColor: "Default",
                BackgroundColor: "Default",
                BackgroundImage: "None",
                Font: "Default",
              },
            },
            Properties: {
              Size: {
                $: {
                  Width: "1920",
                  Height: "1080",
                },
              },
              GrandMaster: {
                $: {
                  Visible: "1",
                  ChannelMode: "Intensity",
                  ValueMode: "Reduce",
                  SliderMode: "Normal",
                },
              },
            },
          },
          SimpleDesk: {
            Engine: "",
          },
        },
      };

      // Convert to XML
      const builder = new xml2js.Builder({
        xmldec: { version: "1.0", encoding: "UTF-8" },
      });

      const xmlContent = builder.buildObject(qlcProject);

      // Add DOCTYPE declaration manually
      const xmlString = xmlContent.replace(
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE Workspace>',
      );

      return {
        projectName: project.name,
        xmlContent: xmlString,
        fixtureCount: project.fixtures.length,
        sceneCount: project.scenes.length,
        cueListCount: project.cueLists.length,
      };
    },

    importProjectFromQLC: async (
      _: any,
      {
        xmlContent,
        originalFileName,
      }: { xmlContent: string; originalFileName: string },
      { prisma }: Context,
    ) => {
      try {
        // Parse XML content with explicit attribute handling
        const parser = new xml2js.Parser({
          explicitArray: true,
          mergeAttrs: false,
          explicitCharkey: false,
          charkey: "_",
          attrkey: "$",
        });
        const result = await parser.parseStringPromise(xmlContent);

        if (!result.Workspace) {
          throw new Error("Invalid QLC+ file: Missing Workspace element");
        }

        const workspace = result.Workspace;
        const warnings: string[] = [];

        // Generate project name with timestamp, removing existing timestamps
        const baseFileName = originalFileName.replace(/\.qxw$/i, "");
        const cleanName = baseFileName.replace(
          /_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/,
          "",
        );
        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, "-")
          .slice(0, 19);
        const projectName = `${cleanName}_${timestamp}`;

        // Create new project
        const project = await prisma.project.create({
          data: {
            name: projectName,
            description: `Imported from QLC+ file: ${originalFileName}`,
          },
        });

        // Parse fixtures from QLC+ format
        const fixtures = workspace.Engine?.[0]?.Fixture || [];
        const createdFixtures: any[] = [];
        const fixtureIdMap = new Map<string, string>(); // QLC ID -> LacyLights ID

        for (const qlcFixture of fixtures) {
          const manufacturer = qlcFixture.Manufacturer?.[0] || "Unknown";
          const model = qlcFixture.Model?.[0] || "Unknown";
          const mode = qlcFixture.Mode?.[0] || "Default";
          const name = qlcFixture.Name?.[0] || `${manufacturer} ${model}`;
          const universe = parseInt(qlcFixture.Universe?.[0] || "0") + 1; // Convert from 0-based
          const startChannel = parseInt(qlcFixture.Address?.[0] || "0") + 1; // Convert from 0-based
          const channelCount = parseInt(qlcFixture.Channels?.[0] || "1");

          try {
            // Try to find existing fixture definition with exact match first
            let fixtureDefinition = await prisma.fixtureDefinition.findFirst({
              where: {
                manufacturer: manufacturer,
                model: model,
              },
              include: {
                channels: true,
                modes: true,
              },
            });

            // If no exact match, try to find a similar fixture using prioritized matching
            if (!fixtureDefinition) {
              // Get all fixture definitions to search for matches
              const allFixtures = await prisma.fixtureDefinition.findMany({
                include: {
                  channels: true,
                  modes: true,
                },
              });

              // Build an index for quick lookup by manufacturer+model (case insensitive)
              const fixtureIndex = new Map<string, (typeof allFixtures)[0]>();
              for (const fixture of allFixtures) {
                const key = `${fixture.manufacturer.toLowerCase()}${FIXTURE_INDEX_DELIMITER}${fixture.model.toLowerCase()}`;
                fixtureIndex.set(key, fixture);
              }

              // Cache word arrays for performance optimization
              const modelWordsCache = new Map<string, string[]>();
              const getModelWords = (str: string, minLength: number = 2) => {
                const cacheKey = `${str}|${minLength}`;
                if (modelWordsCache.has(cacheKey)) {
                  return modelWordsCache.get(cacheKey)!;
                }
                const words = str
                  .split(/\s+/)
                  .filter((w: string) => w.length > minLength);
                modelWordsCache.set(cacheKey, words);
                return words;
              };

              // Helper to count exact and partial matches efficiently
              const countWordMatches = (wordsA: string[], wordsB: string[]) => {
                let exact = 0,
                  partial = 0;
                const wordsBSet = new Set(wordsB);
                for (const word of wordsA) {
                  if (wordsBSet.has(word)) {
                    exact++;
                  } else if (
                    wordsB.some((fw) => fw.includes(word) || word.includes(fw))
                  ) {
                    partial++;
                  }
                }
                return { exact, partial };
              };

              const manufacturerLower = manufacturer.toLowerCase();
              const modelLower = model.toLowerCase();

              // Strategy 1: Exact manufacturer + model match (case insensitive)
              if (!fixtureDefinition) {
                const key = `${manufacturerLower}${FIXTURE_INDEX_DELIMITER}${modelLower}`;
                const exactMatch = fixtureIndex.get(key);
                const hasCompatibleMode = exactMatch?.modes.some(
                  (m) => m.channelCount === channelCount,
                );

                if (exactMatch && hasCompatibleMode) {
                  fixtureDefinition = exactMatch;
                  const compatibleMode = exactMatch.modes.find(
                    (m) => m.channelCount === channelCount,
                  );
                  warnings.push(
                    `Perfect match: "${manufacturer} ${model}" -> "${exactMatch.manufacturer} ${exactMatch.model}" (${compatibleMode?.name} mode)`,
                  );
                }
              }

              // Strategy 2: Manufacturer match + similar model with compatible channels
              if (!fixtureDefinition) {
                // Cache manufacturer variations for faster lookup
                const manufacturerVariations = new Set<
                  (typeof allFixtures)[0]
                >();
                for (const fixture of allFixtures) {
                  const fixtureManufacturerLower =
                    fixture.manufacturer.toLowerCase();
                  if (
                    fixtureManufacturerLower === manufacturerLower ||
                    fixtureManufacturerLower.includes(manufacturerLower) ||
                    manufacturerLower.includes(fixtureManufacturerLower)
                  ) {
                    manufacturerVariations.add(fixture);
                  }
                }
                const candidatesByManufacturer = Array.from(
                  manufacturerVariations,
                );

                for (const fixture of candidatesByManufacturer) {
                  const fixtureModelLower = fixture.model.toLowerCase();
                  const hasCompatibleMode = fixture.modes.some(
                    (m) => m.channelCount === channelCount,
                  );

                  if (hasCompatibleMode) {
                    // Check for model similarity - high threshold for same manufacturer
                    const modelWords = getModelWords(modelLower, 2);
                    const fixtureModelWords = getModelWords(
                      fixtureModelLower,
                      2,
                    );

                    // Use optimized word matching
                    const { exact: exactMatches, partial: partialMatches } =
                      countWordMatches(modelWords, fixtureModelWords);

                    // Require at least 50% of words to match for same manufacturer
                    const requiredMatches = Math.max(
                      1,
                      Math.ceil(modelWords.length * 0.5),
                    );
                    if (
                      exactMatches >= requiredMatches ||
                      exactMatches + partialMatches >=
                        Math.min(2, modelWords.length)
                    ) {
                      fixtureDefinition = fixture;
                      const compatibleMode = fixture.modes.find(
                        (m) => m.channelCount === channelCount,
                      );
                      warnings.push(
                        `Manufacturer match: "${manufacturer} ${model}" -> "${fixture.manufacturer} ${fixture.model}" (${compatibleMode?.name} mode)`,
                      );
                      break;
                    }
                  }
                }
              }

              // Strategy 3: Model similarity across manufacturers (stricter criteria)
              if (!fixtureDefinition) {
                for (const fixture of allFixtures) {
                  const fixtureModelLower = fixture.model.toLowerCase();
                  const hasCompatibleMode = fixture.modes.some(
                    (m) => m.channelCount === channelCount,
                  );

                  if (hasCompatibleMode) {
                    // For cross-manufacturer matching, require very high similarity
                    const modelWords = getModelWords(modelLower, 3); // Longer words only
                    const fixtureModelWords = getModelWords(
                      fixtureModelLower,
                      3,
                    );

                    // Use optimized exact matching for cross-manufacturer
                    const { exact: exactMatches } = countWordMatches(
                      modelWords,
                      fixtureModelWords,
                    );

                    // For cross-manufacturer, need at least 2 exact word matches or perfect model match
                    if (
                      exactMatches >= 2 ||
                      (modelWords.length > 0 &&
                        exactMatches === modelWords.length)
                    ) {
                      fixtureDefinition = fixture;
                      const compatibleMode = fixture.modes.find(
                        (m) => m.channelCount === channelCount,
                      );
                      warnings.push(
                        `Model similarity match: "${manufacturer} ${model}" -> "${fixture.manufacturer} ${fixture.model}" (${compatibleMode?.name} mode)`,
                      );
                      break;
                    }
                  }
                }
              }

              // Strategy 4: Last resort - any fixture with same channel count (with warning)
              if (!fixtureDefinition) {
                for (const fixture of allFixtures) {
                  const compatibleMode = fixture.modes.find(
                    (m) => m.channelCount === channelCount,
                  );
                  if (compatibleMode) {
                    fixtureDefinition = fixture;
                    warnings.push(
                      `⚠️  FALLBACK MATCH: No good match found for "${manufacturer} ${model}". Using "${fixture.manufacturer} ${fixture.model}" (${compatibleMode.name} mode) - VERIFY MANUALLY!`,
                    );
                    break;
                  }
                }
              }

              // If still no fixture found, skip this fixture
              if (!fixtureDefinition) {
                warnings.push(
                  `Could not find or match fixture "${manufacturer} ${model}" with ${channelCount} channels. Skipping fixture.`,
                );
                continue;
              }
            }

            // Find the appropriate mode for the matched fixture
            const compatibleMode =
              fixtureDefinition.modes.find(
                (m) => m.channelCount === channelCount,
              ) || fixtureDefinition.modes[0];

            // Get the channel definitions for this fixture and mode
            const fullDefinition = await prisma.fixtureDefinition.findUnique({
              where: { id: fixtureDefinition.id },
              include: {
                channels: true,
                modes: {
                  include: {
                    modeChannels: {
                      include: { channel: true },
                      orderBy: { offset: "asc" },
                    },
                  },
                },
              },
            });

            let channelsToCreate: Array<{
              offset: number;
              name: string;
              type: ChannelType;
              minValue: number;
              maxValue: number;
              defaultValue: number;
            }> = [];

            // Use mode channels if available, otherwise use definition channels
            if (compatibleMode && fullDefinition) {
              const modeData = fullDefinition.modes.find(
                (m) => m.id === compatibleMode.id,
              );
              if (
                modeData &&
                modeData.modeChannels &&
                modeData.modeChannels.length > 0
              ) {
                channelsToCreate = modeData.modeChannels.map((mc: any) => ({
                  offset: mc.offset,
                  name: mc.channel.name,
                  type: mc.channel.type,
                  minValue: mc.channel.minValue,
                  maxValue: mc.channel.maxValue,
                  defaultValue: mc.channel.defaultValue,
                }));
              } else if (fullDefinition.channels?.length > 0) {
                channelsToCreate = fullDefinition.channels
                  .sort((a: any, b: any) => a.offset - b.offset)
                  .slice(0, channelCount) // Only take the number of channels we need
                  .map((ch: any) => ({
                    offset: ch.offset,
                    name: ch.name,
                    type: ch.type,
                    minValue: ch.minValue,
                    maxValue: ch.maxValue,
                    defaultValue: ch.defaultValue,
                  }));
              }
            }

            // If still no channels, create basic intensity channels as fallback
            if (channelsToCreate.length === 0) {
              for (let i = 0; i < channelCount; i++) {
                channelsToCreate.push({
                  offset: i,
                  name: `Channel ${i + 1}`,
                  type: (i === 0 ? ChannelType.INTENSITY : ChannelType.OTHER) as ChannelType,
                  minValue: 0,
                  maxValue: 255,
                  defaultValue: 0,
                });
              }
            }

            // Create fixture instance using the matched fixture's details
            const fixtureInstance = await prisma.fixtureInstance.create({
              data: {
                name,
                description: `Imported from QLC+: ${mode} mode (mapped to ${fixtureDefinition.manufacturer} ${fixtureDefinition.model})`,
                manufacturer: fixtureDefinition.manufacturer,
                model: fixtureDefinition.model,
                type: fixtureDefinition.type, // Add the required type field
                modeName: compatibleMode.name,
                channelCount: compatibleMode.channelCount,
                definitionId: fixtureDefinition.id,
                projectId: project.id,
                universe,
                startChannel,
                tags: serializeTags(["imported"]),
                channels: {
                  create: channelsToCreate,
                },
              },
              include: {
                channels: {
                  orderBy: { offset: "asc" },
                },
              },
            });

            createdFixtures.push(fixtureInstance);

            // Handle different ways the fixture ID might be stored in the XML
            // Based on debug output, the ID is stored as an element, not an attribute
            const fixtureId =
              qlcFixture.ID?.[0] ||
              qlcFixture.id?.[0] ||
              qlcFixture.Id?.[0] ||
              (qlcFixture.$ &&
                (qlcFixture.$.ID || qlcFixture.$.id || qlcFixture.$.Id));
            if (fixtureId) {
              fixtureIdMap.set(fixtureId, fixtureInstance.id);
            } else {
              warnings.push(
                `Warning: Could not find ID for fixture ${name}, scenes may not reference this fixture correctly`,
              );
            }
          } catch (error) {
            warnings.push(`Failed to create fixture ${name}: ${error}`);
            // Log errors to warnings array instead of console
            warnings.push(`Debug: Fixture parsing error for ${name}`);
          }
        }

        // Parse scenes from QLC+ functions
        const functions = workspace.Engine?.[0]?.Function || [];
        const sceneCount = functions.filter(
          (f: any) => f.$.Type === "Scene",
        ).length;
        const cueListCount = functions.filter(
          (f: any) => f.$.Type === "Chaser",
        ).length;

        for (const func of functions) {
          if (func.$.Type === "Scene") {
            try {
              const sceneName = func.$.Name || "Imported Scene";
              const fixtureValues = func.FixtureVal || [];

              const sceneFixtureValues = [];

              for (const fv of fixtureValues) {
                // Handle different ways the fixture ID might be stored (elements vs attributes)
                const qlcFixtureId =
                  fv?.ID?.[0] ||
                  fv?.id?.[0] ||
                  fv?.Id?.[0] ||
                  (fv?.$ && (fv.$.ID || fv.$.id || fv.$.Id));
                const lacyFixtureId = qlcFixtureId
                  ? fixtureIdMap.get(qlcFixtureId)
                  : null;

                if (lacyFixtureId) {
                  const fixture = createdFixtures.find(
                    (f) => f.id === lacyFixtureId,
                  );

                  if (fixture) {
                    // Initialize channel values array with zeros - this handles fixtures with no values
                    const channelValues: number[] = new Array(
                      fixture.channelCount,
                    ).fill(0);

                    // Parse channel values from QLC+ format if they exist
                    if (fv._ && fv._.trim() !== "") {
                      const channelData = fv._.split(",");

                      // Set specific channel values from QLC+ data
                      for (let i = 0; i < channelData.length; i += 2) {
                        const channelIndex = parseInt(channelData[i] || "0");
                        const value = parseInt(channelData[i + 1] || "0");

                        // Ensure channel index is valid and value is a number
                        if (
                          !isNaN(channelIndex) &&
                          !isNaN(value) &&
                          channelIndex < fixture.channelCount
                        ) {
                          channelValues[channelIndex] = Math.max(
                            0,
                            Math.min(255, value),
                          ); // Clamp to 0-255
                        }
                      }
                    }
                    // If no channel data (fv._ is empty/undefined), channelValues remains all zeros

                    // Middleware automatically serializes channelValues array to string
                    sceneFixtureValues.push({
                      fixtureId: lacyFixtureId,
                      channelValues: channelValues as any,
                    });
                  }
                } else if (qlcFixtureId) {
                  // Log warning for fixtures that couldn't be mapped
                  warnings.push(
                    `Warning: Scene "${sceneName}" references fixture ID ${qlcFixtureId} which was not found or not imported`,
                  );
                }
              }

              // Create scene
              await prisma.scene.create({
                data: {
                  name: sceneName,
                  description: "Imported from QLC+",
                  projectId: project.id,
                  fixtureValues: {
                    create: sceneFixtureValues,
                  },
                },
              });
            } catch (error) {
              warnings.push(`Failed to import scene ${func.$.Name}: ${error}`);
            }
          }
        }

        // Parse cue lists from QLC+ Chaser functions
        for (const func of functions) {
          if (func.$.Type === "Chaser") {
            try {
              const cueListName = func.$.Name || "Imported Cue List";
              const steps = func.Step || [];

              // Create cue list
              const cueList = await prisma.cueList.create({
                data: {
                  name: cueListName,
                  description: "Imported from QLC+",
                  projectId: project.id,
                },
              });

              // Create cues from steps
              const scenes = await prisma.scene.findMany({
                where: { projectId: project.id },
                orderBy: { createdAt: "asc" },
              });

              for (const step of steps) {
                const stepNumber = parseInt(step.$.Number || "0");
                const fadeInMs = parseInt(step.$.FadeIn || "0");
                const fadeOutMs = parseInt(step.$.FadeOut || "0");
                const sceneIndex = parseInt(step._ || "0");

                if (sceneIndex < scenes.length) {
                  await prisma.cue.create({
                    data: {
                      name: `Cue ${stepNumber + 1}`,
                      cueNumber: stepNumber + 1,
                      sceneId: scenes[sceneIndex].id,
                      cueListId: cueList.id,
                      fadeInTime: fadeInMs / 1000, // Convert to seconds
                      fadeOutTime: fadeOutMs / 1000, // Convert to seconds
                      notes: "Imported from QLC+",
                    },
                  });
                }
              }
            } catch (error) {
              warnings.push(
                `Failed to import cue list ${func.$.Name}: ${error}`,
              );
            }
          }
        }

        // Fetch the complete project with all relations for return
        const completeProject = await prisma.project.findUnique({
          where: { id: project.id },
          include: {
            fixtures: true,
            scenes: {
              include: {
                fixtureValues: {
                  include: {
                    fixture: true,
                  },
                },
              },
            },
            cueLists: {
              include: {
                cues: {
                  include: {
                    scene: true,
                  },
                },
              },
            },
            users: {
              include: {
                user: true,
              },
            },
          },
        });

        return {
          project: completeProject,
          originalFileName,
          fixtureCount: createdFixtures.length,
          sceneCount,
          cueListCount,
          warnings,
        };
      } catch (error) {
        throw new Error(`Failed to import QLC+ file: ${error}`);
      }
    },
  },
};
