import { IntegrationTestHelper, mutations } from '../../../test/graphql-integration-test-helper';
import { captureArtNetPackets } from '../../../test/artnet-test-helper';
import type {
    CreateProjectResponse,
    CreateFixtureDefinitionResponse,
    CreateFixtureInstanceResponse,
    CreateSceneResponse,
    CreateCueListResponse,
    CreateCueResponse,
    StartCueListResponse
} from '../../../test/integration-types';

describe('End-to-End Show Workflow Scenario', () => {
    let helper: IntegrationTestHelper;

    beforeAll(async () => {
        helper = new IntegrationTestHelper();
        await helper.setup();
    });

    afterAll(async () => {
        await helper.teardown();
    });

    beforeEach(async () => {
        await helper.resetDatabase();
    });

    test('should execute a complete show workflow from patching to playback', async () => {
        const server = helper.getTestServer();
        const port = parseInt(process.env.ARTNET_PORT || "6454");

        // 1. Setup: Create Project
        const projectResult = await server.executeMutation<CreateProjectResponse>(mutations.createProject, {
            input: { name: 'E2E Show Project' }
        });
        const projectId = projectResult.data!.createProject.id;

        // 2. Patching: Create Fixture Definitions and Instances
        // Create LED PAR Definition (3 channels: R, G, B)
        const parDefResult = await server.executeMutation<CreateFixtureDefinitionResponse>(mutations.createFixtureDefinition, {
            input: {
                manufacturer: 'Generic',
                model: 'LED PAR',
                type: 'LED_PAR',
                channels: [
                    { offset: 1, name: 'Red', type: 'RED', minValue: 0, maxValue: 255, defaultValue: 0 },
                    { offset: 2, name: 'Green', type: 'GREEN', minValue: 0, maxValue: 255, defaultValue: 0 },
                    { offset: 3, name: 'Blue', type: 'BLUE', minValue: 0, maxValue: 255, defaultValue: 0 }
                ]
            }
        });
        if (parDefResult.errors) {
            console.error("DEBUG: createFixtureDefinition errors:", JSON.stringify(parDefResult.errors, null, 2));
        }
        const parDefId = parDefResult.data!.createFixtureDefinition.id;

        // Patch 2 Fixtures
        // Fixture 1: Universe 1, Address 1
        const fix1Result = await server.executeMutation<CreateFixtureInstanceResponse>(mutations.createFixtureInstance, {
            input: {
                projectId,
                definitionId: parDefId,
                name: 'Par 1',
                universe: 1,
                startChannel: 1
            }
        });
        const fix1Id = fix1Result.data!.createFixtureInstance.id;

        // Fixture 2: Universe 1, Address 10
        const fix2Result = await server.executeMutation<CreateFixtureInstanceResponse>(mutations.createFixtureInstance, {
            input: {
                projectId,
                definitionId: parDefId,
                name: 'Par 2',
                universe: 1,
                startChannel: 10
            }
        });
        const fix2Id = fix2Result.data!.createFixtureInstance.id;

        // 3. Programming: Create Scenes
        // Scene 1: Red Look
        const sceneRedResult = await server.executeMutation<CreateSceneResponse>(mutations.createScene, {
            input: {
                projectId,
                name: 'Red Look',
                fixtureValues: [
                    { fixtureId: fix1Id, channelValues: [255, 0, 0] },
                    { fixtureId: fix2Id, channelValues: [255, 0, 0] }
                ]
            }
        });
        const sceneRedId = sceneRedResult.data!.createScene.id;

        // Scene 2: Blue Look
        const sceneBlueResult = await server.executeMutation<CreateSceneResponse>(mutations.createScene, {
            input: {
                projectId,
                name: 'Blue Look',
                fixtureValues: [
                    { fixtureId: fix1Id, channelValues: [0, 0, 255] },
                    { fixtureId: fix2Id, channelValues: [0, 0, 255] }
                ]
            }
        });
        const sceneBlueId = sceneBlueResult.data!.createScene.id;

        // 4. Cuelist: Create Cue List and Cues
        const cueListResult = await server.executeMutation<CreateCueListResponse>(mutations.createCueList, {
            input: { projectId, name: 'Main Show' }
        });
        const cueListId = cueListResult.data!.createCueList.id;

        // Create Cue 1 (Red)
        const cue1Result = await server.executeMutation<CreateCueResponse>(mutations.createCue, {
            input: {
                cueListId,
                sceneId: sceneRedId,
                cueNumber: 1,
                name: 'Red Cue',
                fadeInTime: 0,
                fadeOutTime: 0
            }
        });
        if (cue1Result.errors) {console.error("CreateCue 1 Errors:", JSON.stringify(cue1Result.errors));}

        // Create Cue 2 (Blue)
        const cue2Result = await server.executeMutation<CreateCueResponse>(mutations.createCue, {
            input: {
                cueListId,
                sceneId: sceneBlueId,
                cueNumber: 2,
                name: 'Blue Cue',
                fadeInTime: 0,
                fadeOutTime: 0
            }
        });
        if (cue2Result.errors) {console.error("CreateCue 2 Errors:", JSON.stringify(cue2Result.errors));}

        // 5. Playback Verification

        // Start Cue List (Should trigger Cue 1 - Red)
        console.log('Starting Cue List (Expect Red)...');
        const startPackets = await captureArtNetPackets(async () => {
            const result = await server.executeMutation<StartCueListResponse>(mutations.startCueList, { cueListId });
            if (result.errors) {console.error("StartCueList Errors:", JSON.stringify(result.errors));}
        }, { port, filterUniverse: 1 });

        // Verify Red Output (Universe 1, Channels 1-3 and 10-12)
        console.log(`Captured ${startPackets.length} packets`);
        startPackets.forEach((p, i) => {
            console.log(`Packet ${i}: Universe ${p.universe}, Data[0-2]: ${p.dmxData.slice(0, 3)}, Data[9-11]: ${p.dmxData.slice(9, 12)}`);
        });

        const packet1 = startPackets[startPackets.length - 1];
        expect(packet1.universe).toBe(0); // Art-Net is 0-based
        // Fixture 1 (Addr 1): R=255, G=0, B=0
        expect(packet1.dmxData[0]).toBe(255);
        expect(packet1.dmxData[1]).toBe(0);
        expect(packet1.dmxData[2]).toBe(0);
        // Fixture 2 (Addr 10): R=255, G=0, B=0
        expect(packet1.dmxData[9]).toBe(255);
        expect(packet1.dmxData[10]).toBe(0);
        expect(packet1.dmxData[11]).toBe(0);

        // Go to Next Cue (Should trigger Cue 2 - Blue)
        console.log('Going to Next Cue (Expect Blue)...');
        const nextPackets = await captureArtNetPackets(async () => {
            await server.executeMutation(mutations.nextCue, { cueListId });
        }, { port, filterUniverse: 1 });

        // Verify Blue Output
        const packet2 = nextPackets[nextPackets.length - 1];
        expect(packet2.universe).toBe(0); // Art-Net is 0-based
        // Fixture 1: R=0, G=0, B=255
        expect(packet2.dmxData[0]).toBe(0);
        expect(packet2.dmxData[1]).toBe(0);
        expect(packet2.dmxData[2]).toBe(255);
        // Fixture 2: R=0, G=0, B=255
        expect(packet2.dmxData[9]).toBe(0);
        expect(packet2.dmxData[10]).toBe(0);
        expect(packet2.dmxData[11]).toBe(255);

        // Stop Cue List (Should Blackout)
        console.log('Stopping Cue List (Expect Blackout)...');
        const stopPackets = await captureArtNetPackets(async () => {
            await server.executeMutation(mutations.stopCueList, { cueListId });
        }, { port, filterUniverse: 1, timeout: 2000 });

        // Verify Blackout
        const packet3 = stopPackets[stopPackets.length - 1];
        expect(packet3.universe).toBe(0); // Art-Net is 0-based
        expect(packet3.dmxData[0]).toBe(0);
        expect(packet3.dmxData[2]).toBe(0);
        expect(packet3.dmxData[9]).toBe(0);
        expect(packet3.dmxData[11]).toBe(0);
    });
});
