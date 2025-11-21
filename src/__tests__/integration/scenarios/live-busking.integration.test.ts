import { IntegrationTestHelper, mutations } from '../../../test/graphql-integration-test-helper';
import { captureArtNetPackets } from '../../../test/artnet-test-helper';

describe('Live Busking with Scene Board Scenario', () => {
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

    test('should allow scene board activation while cue list is running', async () => {
        const server = helper.getTestServer();
        const port = parseInt(process.env.ARTNET_PORT || '6454', 10);

        // 1. Setup: Create Project
        const projectResult = await server.executeMutation(mutations.createProject, {
            input: { name: 'Live Busking Test' }
        });
        const projectId = projectResult.data.createProject.id;

        // 2. Create Fixture Definition (RGB Par)
        const defResult = await server.executeMutation(mutations.createFixtureDefinition, {
            input: {
                manufacturer: 'Generic',
                model: 'RGB Par',
                type: 'LED_PAR',
                channels: [
                    { offset: 1, name: 'Red', type: 'RED', minValue: 0, maxValue: 255, defaultValue: 0 },
                    { offset: 2, name: 'Green', type: 'GREEN', minValue: 0, maxValue: 255, defaultValue: 0 },
                    { offset: 3, name: 'Blue', type: 'BLUE', minValue: 0, maxValue: 255, defaultValue: 0 }
                ]
            }
        });
        if (defResult.errors) {
            console.error("CreateFixtureDefinition Errors:", JSON.stringify(defResult.errors));
        }
        const defId = defResult.data.createFixtureDefinition.id;

        // 3. Create Fixture Instances
        const fix1Result = await server.executeMutation(mutations.createFixtureInstance, {
            input: {
                projectId,
                definitionId: defId,
                name: 'Par 1',
                universe: 1,
                startChannel: 1
            }
        });
        const fix1Id = fix1Result.data.createFixtureInstance.id;

        const fix2Result = await server.executeMutation(mutations.createFixtureInstance, {
            input: {
                projectId,
                definitionId: defId,
                name: 'Par 2',
                universe: 1,
                startChannel: 10
            }
        });
        const fix2Id = fix2Result.data.createFixtureInstance.id;

        // 4. Create Scenes
        // Base Scene: Blue
        const sceneBlueResult = await server.executeMutation(mutations.createScene, {
            input: {
                projectId,
                name: 'Base Blue',
                fixtureValues: [
                    { fixtureId: fix1Id, channelValues: [0, 0, 255] },
                    { fixtureId: fix2Id, channelValues: [0, 0, 255] }
                ]
            }
        });
        const sceneBlueId = sceneBlueResult.data.createScene.id;

        // Flash Scene: Red
        const sceneRedResult = await server.executeMutation(mutations.createScene, {
            input: {
                projectId,
                name: 'Flash Red',
                fixtureValues: [
                    { fixtureId: fix1Id, channelValues: [255, 0, 0] },
                    { fixtureId: fix2Id, channelValues: [255, 0, 0] }
                ]
            }
        });
        const sceneRedId = sceneRedResult.data.createScene.id;

        // 5. Create Cue List with Base Scene
        const cueListResult = await server.executeMutation(mutations.createCueList, {
            input: {
                projectId,
                name: 'Base Look'
            }
        });
        const cueListId = cueListResult.data.createCueList.id;

        await server.executeMutation(mutations.createCue, {
            input: {
                cueListId,
                sceneId: sceneBlueId,
                cueNumber: 1,
                name: 'Blue Base',
                fadeInTime: 0,
                fadeOutTime: 0
            }
        });

        // 6. Create Scene Board with Flash Scene
        const boardResult = await server.executeMutation(mutations.createSceneBoard, {
            input: {
                projectId,
                name: 'Flash Board',
                defaultFadeTime: 0.5
            }
        });
        const boardId = boardResult.data.createSceneBoard.id;

        await server.executeMutation(mutations.addSceneToBoard, {
            input: {
                sceneBoardId: boardId,
                sceneId: sceneRedId,
                layoutX: 0,
                layoutY: 0
            }
        });

        // 7. Test: Start Base Playback
        console.log('Starting Base Cue List (Expect Blue)...');
        const basePackets = await captureArtNetPackets(async () => {
            await server.executeMutation(mutations.startCueList, { cueListId });
        }, { port, filterUniverse: 1 });

        // Verify Blue Output
        const basePacket = basePackets[basePackets.length - 1];
        expect(basePacket).toBeDefined();
        expect(basePacket.universe).toBe(0); // Art-Net is 0-based
        // Fixture 1 (Addr 1): R=0, G=0, B=255
        expect(basePacket.dmxData[0]).toBe(0);
        expect(basePacket.dmxData[1]).toBe(0);
        expect(basePacket.dmxData[2]).toBe(255);
        // Fixture 2 (Addr 10): R=0, G=0, B=255
        expect(basePacket.dmxData[9]).toBe(0);
        expect(basePacket.dmxData[10]).toBe(0);
        expect(basePacket.dmxData[11]).toBe(255);

        // 8. Test: Activate Flash from Scene Board
        console.log('Activating Flash Scene from Board (Expect Red)...');
        const flashPackets = await captureArtNetPackets(async () => {
            await server.executeMutation(mutations.activateSceneFromBoard, {
                sceneBoardId: boardId,
                sceneId: sceneRedId,
                fadeTimeOverride: 0
            });
        }, { port, filterUniverse: 1, timeout: 1500 });

        // Verify Red Output (Flash overrides Base)
        const flashPacket = flashPackets[flashPackets.length - 1];
        expect(flashPacket).toBeDefined();
        expect(flashPacket.universe).toBe(0);
        // Fixture 1 (Addr 1): R=255, G=0, B=0
        expect(flashPacket.dmxData[0]).toBe(255);
        expect(flashPacket.dmxData[1]).toBe(0);
        expect(flashPacket.dmxData[2]).toBe(0);
        // Fixture 2 (Addr 10): R=255, G=0, B=0
        expect(flashPacket.dmxData[9]).toBe(255);
        expect(flashPacket.dmxData[10]).toBe(0);
        expect(flashPacket.dmxData[11]).toBe(0);

        // Cleanup: Stop cue list
        await server.executeMutation(mutations.stopCueList, { cueListId });
    });
});
