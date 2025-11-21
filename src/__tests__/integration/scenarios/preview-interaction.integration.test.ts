import { IntegrationTestHelper, mutations } from '../../../test/graphql-integration-test-helper';
import { captureArtNetPackets } from '../../../test/artnet-test-helper';

describe('Preview Mode Interaction Scenario', () => {
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

    test('should allow previewing scenes and applying changes to live output', async () => {
        const server = helper.getTestServer();
        const port = parseInt(process.env.ARTNET_PORT || '6454', 10);

        // 1. Setup: Create Project
        const projectResult = await server.executeMutation(mutations.createProject, {
            input: { name: 'Preview Test' }
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
        const defId = defResult.data.createFixtureDefinition.id;

        // 3. Create Fixture Instance
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

        // 4. Create Scenes
        // Green Scene
        const sceneGreenResult = await server.executeMutation(mutations.createScene, {
            input: {
                projectId,
                name: 'Green Look',
                fixtureValues: [
                    { fixtureId: fix1Id, channelValues: [0, 255, 0] }
                ]
            }
        });
        const sceneGreenId = sceneGreenResult.data.createScene.id;

        // Red Scene
        const sceneRedResult = await server.executeMutation(mutations.createScene, {
            input: {
                projectId,
                name: 'Red Look',
                fixtureValues: [
                    { fixtureId: fix1Id, channelValues: [255, 0, 0] }
                ]
            }
        });
        const sceneRedId = sceneRedResult.data.createScene.id;

        // 5. Set Green Scene Live (baseline)
        console.log('Setting Green Scene Live...');
        const greenPackets = await captureArtNetPackets(async () => {
            await server.executeMutation(mutations.setSceneLive, { sceneId: sceneGreenId });
        }, { port, filterUniverse: 1 });

        // Verify Green Output
        const greenPacket = greenPackets[greenPackets.length - 1];
        expect(greenPacket).toBeDefined();
        expect(greenPacket.universe).toBe(0);
        expect(greenPacket.dmxData[0]).toBe(0);   // R
        expect(greenPacket.dmxData[1]).toBe(255); // G
        expect(greenPacket.dmxData[2]).toBe(0);   // B

        // 6. Start Preview Session
        console.log('Starting Preview Session...');
        const previewResult = await server.executeMutation(mutations.startPreviewSession, {
            projectId
        });
        const sessionId = previewResult.data.startPreviewSession.id;
        expect(sessionId).toBeDefined();

        // 7. Initialize Preview with Red Scene
        // In this system, preview changes ARE immediately visible in DMX output
        console.log('Initializing Preview with Red Scene (should affect live output)...');
        const redPackets = await captureArtNetPackets(async () => {
            await server.executeMutation(mutations.initializePreviewWithScene, {
                sessionId,
                sceneId: sceneRedId
            });
        }, { port, filterUniverse: 1, timeout: 1500 });

        // Verify Red Output (Preview is live)
        const redPacket = redPackets[redPackets.length - 1];
        expect(redPacket).toBeDefined();
        expect(redPacket.universe).toBe(0);
        expect(redPacket.dmxData[0]).toBe(255); // R
        expect(redPacket.dmxData[1]).toBe(0);   // G
        expect(redPacket.dmxData[2]).toBe(0);   // B

        // 8. Commit Preview Session (just cleans up the session)
        console.log('Committing Preview Session...');
        await server.executeMutation(mutations.commitPreviewSession, { sessionId });

        // Verify the session is no longer active by trying to query it
        // (This would require a query mutation, but for now we just verify the commit succeeded)
    });
});
