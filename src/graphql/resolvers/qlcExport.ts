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
                  const QLC_DEFAULT_HOLD_TIME = '4294967294'; // QLC+ default infinite hold time (2^32 - 2)
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

    importProjectFromQLC: async (
      _: any, 
      { xmlContent, originalFileName }: { xmlContent: string; originalFileName: string }, 
      { prisma }: Context
    ) => {
      try {
        // Parse XML content with explicit attribute handling
        const parser = new xml2js.Parser({
          explicitArray: true,
          mergeAttrs: false,
          explicitCharkey: false,
          charkey: '_',
          attrkey: '$'
        });
        const result = await parser.parseStringPromise(xmlContent);
        
        if (!result.Workspace) {
          throw new Error('Invalid QLC+ file: Missing Workspace element');
        }

        const workspace = result.Workspace;
        const warnings: string[] = [];

        // Generate project name with timestamp, removing existing timestamps
        const baseFileName = originalFileName.replace(/\.qxw$/i, '');
        const cleanName = baseFileName.replace(/_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/, '');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
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
          
          const manufacturer = qlcFixture.Manufacturer?.[0] || 'Unknown';
          const model = qlcFixture.Model?.[0] || 'Unknown';
          const mode = qlcFixture.Mode?.[0] || 'Default';
          const name = qlcFixture.Name?.[0] || `${manufacturer} ${model}`;
          const universe = parseInt(qlcFixture.Universe?.[0] || '0') + 1; // Convert from 0-based
          const startChannel = parseInt(qlcFixture.Address?.[0] || '0') + 1; // Convert from 0-based
          const channelCount = parseInt(qlcFixture.Channels?.[0] || '1');

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

            // If no exact match, try to find a similar fixture
            if (!fixtureDefinition) {
              // Get all fixture definitions to search for matches
              const allFixtures = await prisma.fixtureDefinition.findMany({
                include: {
                  channels: true,
                  modes: true,
                },
              });

              // Try various matching strategies with more sophisticated term extraction
              const searchTerms = [
                model.toLowerCase(),
                manufacturer.toLowerCase(),
                `${manufacturer} ${model}`.toLowerCase(),
                // Extract key terms from model names (removing common words)
                ...model.toLowerCase().split(/\s+/).filter((word: string) => word.length > 2),
                ...manufacturer.toLowerCase().split(/\s+/).filter((word: string) => word.length > 2),
              ];

              // Look for fixtures that match any of the search terms
              for (const fixture of allFixtures) {
                const fixtureSearchString = `${fixture.manufacturer} ${fixture.model}`.toLowerCase();
                
                for (const term of searchTerms) {
                  let isMatch = false;
                  
                  // Direct substring match
                  if (fixtureSearchString.includes(term) || term.includes(fixture.model.toLowerCase())) {
                    isMatch = true;
                  }
                  
                  // Special handling for manufacturer variations (e.g., "Chauvet" -> "Chauvet DJ")
                  if (!isMatch && manufacturer.toLowerCase() === 'chauvet' && fixture.manufacturer.toLowerCase().includes('chauvet')) {
                    // Check if model names are similar
                    const modelWords = model.toLowerCase().split(/\s+/);
                    const fixtureModelWords = fixture.model.toLowerCase().split(/\s+/);
                    const commonWords = modelWords.filter((word: string) => fixtureModelWords.some((fw: string) => fw.includes(word) || word.includes(fw)));
                    if (commonWords.length >= Math.min(2, modelWords.length / 2)) {
                      isMatch = true;
                    }
                  }
                  
                  if (isMatch) {
                    // Check if channel count is compatible
                    const compatibleMode = fixture.modes.find(m => m.channelCount === channelCount);
                    if (compatibleMode) {
                      fixtureDefinition = fixture;
                      warnings.push(`Mapped QLC+ fixture "${manufacturer} ${model}" to existing fixture "${fixture.manufacturer} ${fixture.model}" (${compatibleMode.name} mode)`);
                      break;
                    }
                  }
                }
                if (fixtureDefinition) {break;}
              }

              // If still no match, try to find any fixture with the same channel count
              if (!fixtureDefinition) {
                for (const fixture of allFixtures) {
                  const compatibleMode = fixture.modes.find(m => m.channelCount === channelCount);
                  if (compatibleMode) {
                    fixtureDefinition = fixture;
                    warnings.push(`No direct match found for "${manufacturer} ${model}". Using "${fixture.manufacturer} ${fixture.model}" (${compatibleMode.name} mode) with ${channelCount} channels`);
                    break;
                  }
                }
              }

              // If still no fixture found, skip this fixture
              if (!fixtureDefinition) {
                warnings.push(`Could not find or match fixture "${manufacturer} ${model}" with ${channelCount} channels. Skipping fixture.`);
                continue;
              }
            }

            // Find the appropriate mode for the matched fixture
            const compatibleMode = fixtureDefinition.modes.find(m => m.channelCount === channelCount) || fixtureDefinition.modes[0];
            
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
                tags: ['imported'],
              },
            });

            createdFixtures.push(fixtureInstance);
            
            // Handle different ways the fixture ID might be stored in the XML
            // Based on debug output, the ID is stored as an element, not an attribute
            const fixtureId = qlcFixture.ID?.[0] || qlcFixture.id?.[0] || qlcFixture.Id?.[0] || 
                             (qlcFixture.$ && (qlcFixture.$.ID || qlcFixture.$.id || qlcFixture.$.Id));
            if (fixtureId) {
              fixtureIdMap.set(fixtureId, fixtureInstance.id);
            } else {
              warnings.push(`Warning: Could not find ID for fixture ${name}, scenes may not reference this fixture correctly`);
            }

          } catch (error) {
            warnings.push(`Failed to create fixture ${name}: ${error}`);
            console.error('Fixture parsing error details:', error);
            console.error('Fixture XML structure:', JSON.stringify(qlcFixture, null, 2));
          }
        }

        // Parse scenes from QLC+ functions
        const functions = workspace.Engine?.[0]?.Function || [];
        const sceneCount = functions.filter((f: any) => f.$.Type === 'Scene').length;
        const cueListCount = functions.filter((f: any) => f.$.Type === 'Chaser').length;

        for (const func of functions) {
          if (func.$.Type === 'Scene') {
            try {
              const sceneName = func.$.Name || 'Imported Scene';
              const fixtureValues = func.FixtureVal || [];

              const sceneFixtureValues = [];

              for (const fv of fixtureValues) {
                // Handle different ways the fixture ID might be stored (elements vs attributes)
                const qlcFixtureId = fv?.ID?.[0] || fv?.id?.[0] || fv?.Id?.[0] ||
                                   (fv?.$ && (fv.$.ID || fv.$.id || fv.$.Id));
                const lacyFixtureId = qlcFixtureId ? fixtureIdMap.get(qlcFixtureId) : null;
                
                if (lacyFixtureId && fv._) {
                  // Parse channel values from QLC+ format
                  const channelData = fv._.split(',');
                  const fixture = createdFixtures.find(f => f.id === lacyFixtureId);
                  
                  if (fixture) {
                    // Initialize channel values array with zeros to prevent undefined values
                    const channelValues: number[] = new Array(fixture.channelCount).fill(0);
                    
                    // Set specific channel values from QLC+ data
                    for (let i = 0; i < channelData.length; i += 2) {
                      const channelIndex = parseInt(channelData[i] || '0');
                      const value = parseInt(channelData[i + 1] || '0');
                      
                      // Ensure channel index is valid and value is a number
                      if (!isNaN(channelIndex) && !isNaN(value) && channelIndex < fixture.channelCount) {
                        channelValues[channelIndex] = Math.max(0, Math.min(255, value)); // Clamp to 0-255
                      }
                    }
                    
                    sceneFixtureValues.push({
                      fixtureId: lacyFixtureId,
                      channelValues: channelValues,
                    });
                  }
                }
              }

              // Create scene
              await prisma.scene.create({
                data: {
                  name: sceneName,
                  description: 'Imported from QLC+',
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
          if (func.$.Type === 'Chaser') {
            try {
              const cueListName = func.$.Name || 'Imported Cue List';
              const steps = func.Step || [];

              // Create cue list
              const cueList = await prisma.cueList.create({
                data: {
                  name: cueListName,
                  description: 'Imported from QLC+',
                  projectId: project.id,
                },
              });

              // Create cues from steps
              const scenes = await prisma.scene.findMany({
                where: { projectId: project.id },
                orderBy: { createdAt: 'asc' },
              });

              for (const step of steps) {
                const stepNumber = parseInt(step.$.Number || '0');
                const fadeInMs = parseInt(step.$.FadeIn || '0');
                const fadeOutMs = parseInt(step.$.FadeOut || '0');
                const sceneIndex = parseInt(step._ || '0');

                if (sceneIndex < scenes.length) {
                  await prisma.cue.create({
                    data: {
                      name: `Cue ${stepNumber + 1}`,
                      cueNumber: stepNumber + 1,
                      sceneId: scenes[sceneIndex].id,
                      cueListId: cueList.id,
                      fadeInTime: fadeInMs / 1000, // Convert to seconds
                      fadeOutTime: fadeOutMs / 1000, // Convert to seconds
                      notes: 'Imported from QLC+',
                    },
                  });
                }
              }

            } catch (error) {
              warnings.push(`Failed to import cue list ${func.$.Name}: ${error}`);
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