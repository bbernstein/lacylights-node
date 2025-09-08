#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';
import * as xml2js from 'xml2js';
import fs from 'fs';
import { QLCFixtureLibrary } from '../src/services/qlcFixtureLibrary';

const prisma = new PrismaClient();

async function testQLCExport() {
  try {
    console.log('🎭 Testing QLC+ Export...\n');

    // Find the FunHome project
    const projects = await prisma.project.findMany({
      where: {
        name: {
          contains: 'FunHome',
          mode: 'insensitive',
        },
      },
    });

    if (projects.length === 0) {
      console.error('❌ No FunHome project found');
      return;
    }

    const project = projects[0];
    console.log(`📁 Found project: ${project.name}`);
    console.log(`   ID: ${project.id}`);
    console.log(`   Description: ${project.description}\n`);

    // Fetch project with all related data (same as in resolver)
    const fullProject = await prisma.project.findUnique({
      where: { id: project.id },
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

    if (!fullProject) {
      console.error('❌ Could not fetch full project data');
      return;
    }

    console.log(`🔧 Fixtures: ${fullProject.fixtures.length}`);
    console.log(`🎬 Scenes: ${fullProject.scenes.length}`);
    console.log(`📋 Cue Lists: ${fullProject.cueLists.length}\n`);

    // Create mapping lookup for fixture definitions
    const qlcLibrary = new QLCFixtureLibrary();
    const mappingMap = new Map<string, import('../src/services/qlcFixtureLibrary').FixtureMapping>();
    
    // Use default mappings
    const defaultMappings = qlcLibrary.getDefaultMappings();
    
    for (const mapping of defaultMappings) {
      mappingMap.set(mapping.lacyLightsKey, mapping);
    }

    console.log('🔗 Using fixture mappings:');
    mappingMap.forEach((mapping, key) => {
      console.log(`   ${key} → ${mapping.qlcManufacturer}/${mapping.qlcModel} (${mapping.qlcMode})`);
    });
    console.log();

    // Build QLC+ XML structure (simplified version of resolver logic)
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
            Universe: fullProject.fixtures
              .map((f) => f.universe)
              .filter((u, i, arr) => arr.indexOf(u) === i) // unique universes
              .map((universe) => ({
                $: {
                  Name: `Universe ${universe}`,
                  ID: (universe - 1).toString(), // Convert to 0-based
                },
              })),
          },
          Fixture: fullProject.fixtures.map((fixture, index) => {
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
            ...fullProject.scenes.map((scene, index) => ({
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
              FixtureVal: fullProject.fixtures.map((fixture, fixtureIndex) => {
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
            ...fullProject.cueLists.map((cueList, listIndex) => ({
              $: {
                ID: (fullProject.scenes.length + listIndex).toString(),
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
                const sceneIndex = fullProject.scenes.findIndex(
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

    // Write to file with sanitized filename
    const path = require('path');
    const sanitizedName = project.name.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-');
    const filename = path.join('../qlcplus', `${sanitizedName}-export.qxw`);
    fs.writeFileSync(filename, xmlString);

    console.log(`✅ Export successful!`);
    console.log(`📄 File saved: ${filename}`);
    console.log(`📊 Export stats:`);
    console.log(`   - Fixtures: ${fullProject.fixtures.length}`);
    console.log(`   - Scenes: ${fullProject.scenes.length}`);
    console.log(`   - Cue Lists: ${fullProject.cueLists.length}`);
    console.log(`   - Total Cues: ${fullProject.cueLists.reduce((sum, cl) => sum + cl.cues.length, 0)}`);

    // Show first few lines of output
    const lines = xmlString.split('\n');
    console.log(`\n📝 First 10 lines of generated XML:`);
    lines.slice(0, 10).forEach((line, i) => {
      console.log(`   ${i + 1}: ${line}`);
    });

  } catch (error) {
    console.error('❌ Export failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testQLCExport();