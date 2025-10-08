/**
 * Integration tests for QLC+ import/export functionality
 *
 * These tests use a real SQLite database and the actual test QLC+ file
 * to verify that import and export work correctly end-to-end.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { qlcExportResolvers } from '../qlcExport';
import * as xml2js from 'xml2js';

describe('QLC+ Import/Export Integration Tests', () => {
  let prisma: PrismaClient;
  let context: { prisma: PrismaClient };
  const testDbPath = path.join(__dirname, '../../../../test-integration.db');

  beforeAll(async () => {
    // Set the database URL for this test run
    const testDbUrl = `file:${testDbPath}`;
    process.env.DATABASE_URL = testDbUrl;

    // Only run migrations if database doesn't exist or is empty
    const needsMigration = !fs.existsSync(testDbPath);

    if (needsMigration) {
      // Remove any leftover journal files
      if (fs.existsSync(`${testDbPath}-journal`)) {
        fs.unlinkSync(`${testDbPath}-journal`);
      }

      // Run migrations to set up the schema
      try {
        execSync('npx prisma migrate deploy', {
          stdio: 'pipe',
          env: { ...process.env, DATABASE_URL: testDbUrl },
        });
      } catch (error) {
        throw new Error(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Create a new Prisma client with test database
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: testDbUrl,
        },
      },
    });

    // Apply the middleware to handle channelValues serialization/deserialization
    prisma.$use(async (params, next) => {
      const serializeChannelValues = (item: any) => {
        if (item && item.channelValues && Array.isArray(item.channelValues)) {
          item.channelValues = JSON.stringify(item.channelValues);
        }
      };

      const serializeFixtureValues = (data: any) => {
        if (!data) { return; }

        // Handle direct FixtureValue operations
        if (params.model === 'FixtureValue') {
          if (Array.isArray(data)) {
            data.forEach(serializeChannelValues);
          } else {
            serializeChannelValues(data);
          }
        }

        // Handle nested FixtureValue in Scene operations
        if (params.model === 'Scene' && data.fixtureValues) {
          if (data.fixtureValues.create) {
            const creates = Array.isArray(data.fixtureValues.create) ? data.fixtureValues.create : [data.fixtureValues.create];
            creates.forEach(serializeChannelValues);
          }
          if (data.fixtureValues.update) {
            const updates = Array.isArray(data.fixtureValues.update) ? data.fixtureValues.update : [data.fixtureValues.update];
            updates.forEach((u: any) => serializeChannelValues(u.data || u));
          }
        }
      };

      // Serialize before write operations
      if (params.action === 'create' || params.action === 'update' || params.action === 'createMany' || params.action === 'updateMany') {
        serializeFixtureValues(params.args.data);
      }

      const result = await next(params);

      // Deserialize after read operations
      const deserialize = (item: any) => {
        if (item && item.channelValues && typeof item.channelValues === 'string') {
          try {
            item.channelValues = JSON.parse(item.channelValues);
          } catch {
            item.channelValues = [];
          }
        }
        return item;
      };

      const deserializeResult = (result: any) => {
        if (!result) { return result; }

        // Handle FixtureValue results
        if (params.model === 'FixtureValue') {
          if (Array.isArray(result)) {
            result.forEach(deserialize);
          } else {
            deserialize(result);
          }
        }

        // Handle Scene results with nested fixtureValues
        if (params.model === 'Scene') {
          if (Array.isArray(result)) {
            result.forEach((scene: any) => {
              if (scene.fixtureValues) {
                scene.fixtureValues.forEach(deserialize);
              }
            });
          } else if (result.fixtureValues) {
            result.fixtureValues.forEach(deserialize);
          }
        }

        return result;
      };

      return deserializeResult(result);
    });

    await prisma.$connect();
    context = { prisma };
  });

  afterAll(async () => {
    await prisma.$disconnect();

    // Keep test database file to avoid re-running migrations on next test run
    // The beforeEach hook cleans all data, so this is safe
    // Note: If you need to force a fresh migration, manually delete test-integration.db
  });

  beforeEach(async () => {
    // Clean database before each test
    await prisma.fixtureValue.deleteMany();
    await prisma.cue.deleteMany();
    await prisma.scene.deleteMany();
    await prisma.cueList.deleteMany();
    await prisma.instanceChannel.deleteMany();
    await prisma.fixtureInstance.deleteMany();
    await prisma.modeChannel.deleteMany();
    await prisma.fixtureMode.deleteMany();
    await prisma.channelDefinition.deleteMany();
    await prisma.fixtureDefinition.deleteMany();
    await prisma.projectUser.deleteMany();
    await prisma.project.deleteMany();
  });

  describe('Import QLC+ File', () => {
    it('should import test-qlc-export.qxw successfully', async () => {
      // Read the test QLC+ file
      const testQlcPath = path.join(__dirname, '../../../../resources/test-qlc-export.qxw');
      const xmlContent = fs.readFileSync(testQlcPath, 'utf-8');

      // Create fixture definitions that match the QLC+ file
      // Based on test-qlc-export.qxw, we need:
      // - Chauvet SlimPAR Pro Q USB with 4-channel and 5-channel modes
      // - ETC ColorSource PAR with 3-channel and 5-channel modes
      // - ETC ColorSource Spot with 5-channel mode

      // Create fixture definitions that the QLC+ file expects to exist
      await prisma.fixtureDefinition.create({
        data: {
          manufacturer: 'Chauvet',
          model: 'SlimPAR Pro Q USB',
          type: 'LED_PAR',
          modes: {
            create: [
              {
                name: '4 Channel',
                channelCount: 4,
              },
              {
                name: '5 Channel',
                channelCount: 5,
              },
            ],
          },
        },
      });

      await prisma.fixtureDefinition.create({
        data: {
          manufacturer: 'ETC',
          model: 'ColorSource PAR',
          type: 'LED_PAR',
          modes: {
            create: [
              {
                name: '3-channel (RGB)',
                channelCount: 3,
              },
              {
                name: '5-channel',
                channelCount: 5,
              },
            ],
          },
        },
      });

      await prisma.fixtureDefinition.create({
        data: {
          manufacturer: 'ETC',
          model: 'ColorSource Spot',
          type: 'MOVING_HEAD',
          modes: {
            create: [
              {
                name: '5-Channel',
                channelCount: 5,
              },
            ],
          },
        },
      });

      // Import the QLC+ file
      const result = await qlcExportResolvers.Mutation.importProjectFromQLC(
        {},
        { xmlContent, originalFileName: 'test-qlc-export.qxw' },
        context as any,
      );

      // Verify import results
      expect(result.fixtureCount).toBe(6);
      expect(result.sceneCount).toBe(2);
      expect(result.cueListCount).toBe(1);

      // Fetch the project from database
      const project = await prisma.project.findUnique({
        where: { id: result.project!.id },
        include: {
          fixtures: {
            include: {
              channels: {
                orderBy: { offset: 'asc' },
              },
            },
            orderBy: [
              { universe: 'asc' },
              { startChannel: 'asc' },
            ],
          },
          scenes: {
            include: {
              fixtureValues: {
                include: {
                  fixture: true,
                },
                orderBy: [{ sceneOrder: 'asc' }, { id: 'asc' }],
              },
            },
            orderBy: { createdAt: 'asc' },
          },
          cueLists: {
            include: {
              cues: {
                include: {
                  scene: true,
                },
                orderBy: { cueNumber: 'asc' },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      expect(project).not.toBeNull();

      // Verify fixtures
      expect(project!.fixtures).toHaveLength(6);

      // Fixture 0: par-4chan (Chauvet SlimPAR Pro Q USB, 4 Channel, Universe 1, Channel 1)
      const fixture0 = project!.fixtures.find(f => f.name === 'par-4chan');
      expect(fixture0).toBeDefined();
      expect(fixture0!.manufacturer).toBe('Chauvet');
      expect(fixture0!.model).toBe('SlimPAR Pro Q USB');
      expect(fixture0!.universe).toBe(1); // QLC+ uses 0-based, we use 1-based
      expect(fixture0!.startChannel).toBe(1); // QLC+ uses 0-based, we use 1-based
      expect(fixture0!.channelCount).toBe(4);

      // Fixture 1: par-5chan (Chauvet SlimPAR Pro Q USB, 5 Channel, Universe 1, Channel 5)
      const fixture1 = project!.fixtures.find(f => f.name === 'par-5chan');
      expect(fixture1).toBeDefined();
      expect(fixture1!.manufacturer).toBe('Chauvet');
      expect(fixture1!.model).toBe('SlimPAR Pro Q USB');
      expect(fixture1!.universe).toBe(1);
      expect(fixture1!.startChannel).toBe(5); // QLC+ address 4 + 1
      expect(fixture1!.channelCount).toBe(5);

      // Fixture 2: etc-par-3chan (ETC ColorSource PAR, 3-channel, Universe 1, Channel 10)
      const fixture2 = project!.fixtures.find(f => f.name === 'etc-par-3chan');
      expect(fixture2).toBeDefined();
      expect(fixture2!.manufacturer).toBe('ETC');
      expect(fixture2!.model).toBe('ColorSource PAR');
      expect(fixture2!.universe).toBe(1);
      expect(fixture2!.startChannel).toBe(10); // QLC+ address 9 + 1
      expect(fixture2!.channelCount).toBe(3);

      // Fixture 3: etc-par5chan (ETC ColorSource PAR, 5-channel, Universe 1, Channel 13)
      const fixture3 = project!.fixtures.find(f => f.name === 'etc-par5chan');
      expect(fixture3).toBeDefined();
      expect(fixture3!.manufacturer).toBe('ETC');
      expect(fixture3!.model).toBe('ColorSource PAR');
      expect(fixture3!.universe).toBe(1);
      expect(fixture3!.startChannel).toBe(13); // QLC+ address 12 + 1
      expect(fixture3!.channelCount).toBe(5);

      // Fixture 4: par-u2-4chan (Chauvet SlimPAR Pro Q USB, 4 Channel, Universe 2, Channel 1)
      const fixture4 = project!.fixtures.find(f => f.name === 'par-u2-4chan');
      expect(fixture4).toBeDefined();
      expect(fixture4!.manufacturer).toBe('Chauvet');
      expect(fixture4!.model).toBe('SlimPAR Pro Q USB');
      expect(fixture4!.universe).toBe(2); // QLC+ universe 1 + 1
      expect(fixture4!.startChannel).toBe(1);
      expect(fixture4!.channelCount).toBe(4);

      // Fixture 5: etc-spot-u2-5chan (ETC ColorSource Spot, 5-Channel, Universe 2, Channel 5)
      const fixture5 = project!.fixtures.find(f => f.name === 'etc-spot-u2-5chan');
      expect(fixture5).toBeDefined();
      expect(fixture5!.manufacturer).toBe('ETC');
      expect(fixture5!.model).toBe('ColorSource Spot');
      expect(fixture5!.universe).toBe(2);
      expect(fixture5!.startChannel).toBe(5); // QLC+ address 4 + 1
      expect(fixture5!.channelCount).toBe(5);

      // Verify scenes
      expect(project!.scenes).toHaveLength(2);

      // Scene 0: "first scene"
      const firstScene = project!.scenes.find(s => s.name === 'first scene');
      expect(firstScene).toBeDefined();
      expect(firstScene!.fixtureValues).toHaveLength(6);

      // Verify fixture values for "first scene"
      // From QLC+:
      // Fixture ID 2 (etc-par-3chan): "0,232,1,237,2,229" => [232, 237, 229]
      const fv2 = firstScene!.fixtureValues.find(fv => fv.fixture.name === 'etc-par-3chan');
      expect(fv2).toBeDefined();
      const channelValues2 = JSON.parse(fv2!.channelValues as string);
      expect(channelValues2).toEqual([232, 237, 229]);

      // Fixture ID 3 (etc-par5chan): "0,239,1,228,2,240,3,223" => [239, 228, 240, 223, 0]
      const fv3 = firstScene!.fixtureValues.find(fv => fv.fixture.name === 'etc-par5chan');
      expect(fv3).toBeDefined();
      const channelValues3 = JSON.parse(fv3!.channelValues as string);
      expect(channelValues3).toEqual([239, 228, 240, 223, 0]);

      // Fixture ID 0 (par-4chan): "0,246,1,241,2,239,3,232" => [246, 241, 239, 232]
      const fv0 = firstScene!.fixtureValues.find(fv => fv.fixture.name === 'par-4chan');
      expect(fv0).toBeDefined();
      const channelValues0 = JSON.parse(fv0!.channelValues as string);
      expect(channelValues0).toEqual([246, 241, 239, 232]);

      // Fixture ID 1 (par-5chan): "0,200,1,200,2,200,3,200,4,200" => [200, 200, 200, 200, 200]
      const fv1 = firstScene!.fixtureValues.find(fv => fv.fixture.name === 'par-5chan');
      expect(fv1).toBeDefined();
      const channelValues1 = JSON.parse(fv1!.channelValues as string);
      expect(channelValues1).toEqual([200, 200, 200, 200, 200]);

      // Fixture ID 5 (etc-spot-u2-5chan): "0,206,1,218,2,232,3,244" => [206, 218, 232, 244, 0]
      const fv5 = firstScene!.fixtureValues.find(fv => fv.fixture.name === 'etc-spot-u2-5chan');
      expect(fv5).toBeDefined();
      const channelValues5 = JSON.parse(fv5!.channelValues as string);
      expect(channelValues5).toEqual([206, 218, 232, 244, 0]);

      // Fixture ID 4 (par-u2-4chan): "0,228,1,246,2,230,3,248" => [228, 246, 230, 248]
      const fv4 = firstScene!.fixtureValues.find(fv => fv.fixture.name === 'par-u2-4chan');
      expect(fv4).toBeDefined();
      const channelValues4 = JSON.parse(fv4!.channelValues as string);
      expect(channelValues4).toEqual([228, 246, 230, 248]);

      // Scene 1: "blackout"
      const blackoutScene = project!.scenes.find(s => s.name === 'blackout');
      expect(blackoutScene).toBeDefined();
      expect(blackoutScene!.fixtureValues).toHaveLength(6);

      // Verify all fixtures in blackout are set to 0
      for (const fv of blackoutScene!.fixtureValues) {
        const values = JSON.parse(fv.channelValues as string);
        expect(values.every((v: number) => v === 0)).toBe(true);
      }

      // Verify cue list
      expect(project!.cueLists).toHaveLength(1);
      const cueList = project!.cueLists[0];
      expect(cueList.name).toBe('Full Show Cuelist');
      expect(cueList.cues).toHaveLength(4);

      // Verify cue timing (QLC+ stores in milliseconds, we store in seconds)
      // Step 0: FadeIn="1000", FadeOut="500"
      expect(cueList.cues[0].fadeInTime).toBe(1.0);
      expect(cueList.cues[0].fadeOutTime).toBe(0.5);

      // Step 1: FadeIn="1000", FadeOut="500"
      expect(cueList.cues[1].fadeInTime).toBe(1.0);
      expect(cueList.cues[1].fadeOutTime).toBe(0.5);
    });
  });

  describe('Export QLC+ File', () => {
    it('should export project to QLC+ format with correct channel values', async () => {
      // Create a simple project with fixtures and scenes
      const project = await prisma.project.create({
        data: {
          name: 'Test Export Project',
          description: 'Test project for QLC+ export',
        },
      });

      // Create fixture definition
      const fixtureDef = await prisma.fixtureDefinition.create({
        data: {
          manufacturer: 'Chauvet',
          model: 'SlimPAR Pro Q USB',
          type: 'LED_PAR',
          modes: {
            create: {
              name: '4 Channel',
              channelCount: 4,
            },
          },
        },
      });

      // Create fixture instance
      const fixture = await prisma.fixtureInstance.create({
        data: {
          name: 'Test Light',
          manufacturer: 'Chauvet',
          model: 'SlimPAR Pro Q USB',
          type: 'LED_PAR',
          modeName: '4 Channel',
          channelCount: 4,
          definitionId: fixtureDef.id,
          projectId: project.id,
          universe: 1,
          startChannel: 1,
          channels: {
            create: [
              { offset: 0, name: 'Red', type: 'RED', minValue: 0, maxValue: 255, defaultValue: 0 },
              { offset: 1, name: 'Green', type: 'GREEN', minValue: 0, maxValue: 255, defaultValue: 0 },
              { offset: 2, name: 'Blue', type: 'BLUE', minValue: 0, maxValue: 255, defaultValue: 0 },
              { offset: 3, name: 'Amber', type: 'AMBER', minValue: 0, maxValue: 255, defaultValue: 0 },
            ],
          },
        },
      });

      // Create scene with specific channel values
      await prisma.scene.create({
        data: {
          name: 'Test Scene',
          description: 'Test scene',
          projectId: project.id,
          fixtureValues: {
            create: {
              fixtureId: fixture.id,
              channelValues: JSON.stringify([255, 128, 64, 32]),
            },
          },
        },
      });

      // Export the project
      const exportResult = await qlcExportResolvers.Mutation.exportProjectToQLC(
        {},
        { projectId: project.id },
        context as any,
      );

      expect(exportResult.projectName).toBe('Test Export Project');
      expect(exportResult.fixtureCount).toBe(1);
      expect(exportResult.sceneCount).toBe(1);

      // Parse the exported XML
      const parser = new xml2js.Parser();
      const parsedXml = await parser.parseStringPromise(exportResult.xmlContent);

      const workspace = parsedXml.Workspace;
      expect(workspace).toBeDefined();

      // Verify fixture in export
      const fixtures = workspace.Engine[0].Fixture;
      expect(fixtures).toHaveLength(1);
      expect(fixtures[0].Manufacturer[0]).toBe('Chauvet');
      expect(fixtures[0].Model[0]).toBe('SlimPAR Pro Q USB');
      expect(fixtures[0].Universe[0]).toBe('0'); // 0-based in QLC+
      expect(fixtures[0].Address[0]).toBe('0'); // 0-based in QLC+
      expect(fixtures[0].Channels[0]).toBe('4');

      // Verify scene in export
      const functions = workspace.Engine[0].Function;
      const sceneFunction = functions.find((f: any) => f.$.Type === 'Scene');
      expect(sceneFunction).toBeDefined();
      expect(sceneFunction.$.Name).toBe('Test Scene');

      // Verify channel values are exported correctly
      const fixtureVal = sceneFunction.FixtureVal[0];
      expect(fixtureVal.$.ID).toBe('0');
      expect(fixtureVal._).toBe('0,255,1,128,2,64,3,32');
    });

    it('should export and re-import with consistent channel values', async () => {
      // Create project with fixtures and scenes
      const project = await prisma.project.create({
        data: {
          name: 'Round Trip Test',
          description: 'Test round-trip import/export',
        },
      });

      const fixtureDef = await prisma.fixtureDefinition.create({
        data: {
          manufacturer: 'ETC',
          model: 'ColorSource PAR',
          type: 'LED_PAR',
          modes: {
            create: {
              name: '3-channel (RGB)',
              channelCount: 3,
            },
          },
        },
      });

      const fixture = await prisma.fixtureInstance.create({
        data: {
          name: 'Test PAR',
          manufacturer: 'ETC',
          model: 'ColorSource PAR',
          type: 'LED_PAR',
          modeName: '3-channel (RGB)',
          channelCount: 3,
          definitionId: fixtureDef.id,
          projectId: project.id,
          universe: 1,
          startChannel: 1,
          channels: {
            create: [
              { offset: 0, name: 'Red', type: 'RED', minValue: 0, maxValue: 255, defaultValue: 0 },
              { offset: 1, name: 'Green', type: 'GREEN', minValue: 0, maxValue: 255, defaultValue: 0 },
              { offset: 2, name: 'Blue', type: 'BLUE', minValue: 0, maxValue: 255, defaultValue: 0 },
            ],
          },
        },
      });

      const originalChannelValues = [100, 150, 200];
      await prisma.scene.create({
        data: {
          name: 'Original Scene',
          description: 'Original scene',
          projectId: project.id,
          fixtureValues: {
            create: {
              fixtureId: fixture.id,
              channelValues: JSON.stringify(originalChannelValues),
            },
          },
        },
      });

      // Export the project
      const exportResult = await qlcExportResolvers.Mutation.exportProjectToQLC(
        {},
        { projectId: project.id },
        context as any,
      );

      // Re-import the exported content
      const importResult = await qlcExportResolvers.Mutation.importProjectFromQLC(
        {},
        { xmlContent: exportResult.xmlContent, originalFileName: 'round-trip-test.qxw' },
        context as any,
      );

      // Fetch the imported project
      const importedProject = await prisma.project.findUnique({
        where: { id: importResult.project!.id },
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
        },
      });

      expect(importedProject).not.toBeNull();
      expect(importedProject!.scenes).toHaveLength(1);
      expect(importedProject!.scenes[0].fixtureValues).toHaveLength(1);

      const importedChannelValues = JSON.parse(
        importedProject!.scenes[0].fixtureValues[0].channelValues as string,
      );
      expect(importedChannelValues).toEqual(originalChannelValues);
    });
  });
});
