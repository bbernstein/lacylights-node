import { Context } from '../../context';
import * as xml2js from 'xml2js';
import { QLCFixtureLibrary, FixtureMapping } from '../../services/qlcFixtureLibrary';

export const qlcExportResolvers = {
  Query: {
    getQLCFixtureMappingSuggestions: async (_: any, { projectId }: { projectId: string }, { prisma }: Context) => {
      // Get all unique fixtures in the project
      const fixtures = await prisma.fixtureInstance.findMany({
        where: { projectId },
        include: { definition: true },
        distinct: ['definitionId'],
      });

      // Load QLC+ fixture library
      const qlcLibrary = new QLCFixtureLibrary();
      await qlcLibrary.loadFixtureLibrary();

      // Get unique fixture types
      const uniqueFixtures = fixtures.map(f => ({
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

    exportProjectToQLC: async (
      _: any, 
      { projectId, fixtureMappings }: { projectId: string; fixtureMappings?: FixtureMapping[] }, 
      { prisma }: Context
    ) => {
      // Fetch project with all related data
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          fixtures: {
            include: {
              definition: true,
              channels: {
                orderBy: { offset: 'asc' },
              },
            },
            orderBy: [{ universe: 'asc' }, { startChannel: 'asc' }],
          },
          scenes: {
            include: {
              fixtureValues: {
                include: {
                  fixture: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
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
                orderBy: { cueNumber: 'asc' },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!project) {
        throw new Error('Project not found');
      }

      // Create mapping lookup for fixture definitions
      const mappingMap = new Map<string, FixtureMapping>();
      
      // Use provided mappings or defaults
      const mappingsToUse = fixtureMappings || (new QLCFixtureLibrary()).getDefaultMappings();
      
      for (const mapping of mappingsToUse) {
        mappingMap.set(mapping.lacyLightsKey, mapping);
      }

      // Build QLC+ XML structure
      const qlcProject = {
        Workspace: {
          $: {
            xmlns: 'http://www.qlcplus.org/Workspace',
            CurrentWindow: 'FunctionManager',
          },
          Creator: {
            Name: 'Q Light Controller Plus',
            Version: '4.14.3',
            Author: 'LacyLights Export',
          },
          Engine: {
            InputOutputMap: {
              BeatGenerator: {
                $: {
                  BeatType: 'Disabled',
                  BPM: '0',
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
                Manufacturer: mapping?.qlcManufacturer || fixture.manufacturer || fixture.definition.manufacturer,
                Model: mapping?.qlcModel || fixture.model || fixture.definition.model,
                Mode: mapping?.qlcMode || fixture.modeName || 'Default',
                ID: index.toString(),
                Name: fixture.name,
                Universe: (fixture.universe - 1).toString(), // Convert to 0-based
                Address: (fixture.startChannel - 1).toString(), // Convert to 0-based
                Channels: fixture.channelCount?.toString() || fixture.channels.length.toString(),
              };
            }),
            Function: [
              // Add scenes as Scene functions
              ...project.scenes.map((scene, index) => ({
                $: {
                  ID: index.toString(),
                  Type: 'Scene',
                  Name: scene.name,
                },
                Speed: {
                  $: {
                    FadeIn: '0',
                    FadeOut: '0',
                    Duration: '0',
                  },
                },
                FixtureVal: project.fixtures.map((fixture, fixtureIndex) => {
                  const fixtureValue = scene.fixtureValues.find(
                    (fv) => fv.fixtureId === fixture.id
                  );
                  
                  if (fixtureValue && fixtureValue.channelValues.length > 0) {
                    // Convert channel values array to comma-separated string
                    const channelValuesStr = fixtureValue.channelValues
                      .map((value, channelIndex) => `${channelIndex},${value}`)
                      .join(',');
                    
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
                  Type: 'Chaser',
                  Name: cueList.name,
                },
                Speed: {
                  $: {
                    FadeIn: '0',
                    FadeOut: '0',
                    Duration: '0',
                  },
                },
                Direction: 'Forward',
                RunOrder: 'Loop',
                SpeedModes: {
                  $: {
                    FadeIn: 'PerStep',
                    FadeOut: 'PerStep',
                    Duration: 'PerStep',
                  },
                },
                Step: cueList.cues.map((cue, cueIndex) => {
                  const sceneIndex = project.scenes.findIndex(
                    (scene) => scene.id === cue.sceneId
                  );
                  return {
                    $: {
                      Number: cueIndex.toString(),
                      FadeIn: Math.round(cue.fadeInTime * 1000).toString(), // Convert to milliseconds
                      Hold: '4294967294', // QLC+ default hold time
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
              $: { Caption: '' },
              Appearance: {
                FrameStyle: 'None',
                ForegroundColor: 'Default',
                BackgroundColor: 'Default',
                BackgroundImage: 'None',
                Font: 'Default',
              },
            },
            Properties: {
              Size: {
                $: {
                  Width: '1920',
                  Height: '1080',
                },
              },
              GrandMaster: {
                $: {
                  Visible: '1',
                  ChannelMode: 'Intensity',
                  ValueMode: 'Reduce',
                  SliderMode: 'Normal',
                },
              },
            },
          },
          SimpleDesk: {
            Engine: '',
          },
        },
      };

      // Convert to XML
      const builder = new xml2js.Builder({
        xmldec: { version: '1.0', encoding: 'UTF-8' },
      });
      
      const xmlContent = builder.buildObject(qlcProject);
      
      // Add DOCTYPE declaration manually
      const xmlString = xmlContent.replace(
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE Workspace>'
      );

      return {
        projectName: project.name,
        xmlContent: xmlString,
        fixtureCount: project.fixtures.length,
        sceneCount: project.scenes.length,
        cueListCount: project.cueLists.length,
      };
    },
  },
};