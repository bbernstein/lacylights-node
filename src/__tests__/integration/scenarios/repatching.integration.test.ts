import { IntegrationTestHelper, mutations } from '../../../test/graphql-integration-test-helper';
import { captureArtNetPackets } from '../../../test/artnet-test-helper';

describe('Fixture Repatching Scenario', () => {
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

    test('should update DMX output when fixture address is changed', async () => {
        const server = helper.getTestServer();
        const port = parseInt(process.env.ARTNET_PORT || '6454', 10);

        // 1. Setup: Create Project
        const projectResult = await server.executeMutation(mutations.createProject, {
            input: { name: 'Repatching Test' }
        });
        const projectId = projectResult.data.createProject.id;

        // 2. Create Fixture Definition (Single Channel Dimmer)
        const defResult = await server.executeMutation(mutations.createFixtureDefinition, {
            input: {
                manufacturer: 'Generic',
                model: 'Dimmer',
                type: 'DIMMER',
                channels: [
                    { offset: 1, name: 'Intensity', type: 'INTENSITY', minValue: 0, maxValue: 255, defaultValue: 0 }
                ]
            }
        });
        const defId = defResult.data.createFixtureDefinition.id;

        // 3. Initial Patch: Fixture A at Address 1
        const fixtureResult = await server.executeMutation(mutations.createFixtureInstance, {
            input: {
                projectId,
                definitionId: defId,
                name: 'Fixture A',
                universe: 1,
                startChannel: 1
            }
        });
        const fixtureId = fixtureResult.data.createFixtureInstance.id;

        // 4. Create Scene setting Fixture A to 255
        const sceneResult = await server.executeMutation(mutations.createScene, {
            input: {
                projectId,
                name: 'Full Intensity',
                fixtureValues: [
                    { fixtureId, channelValues: [255] }
                ]
            }
        });
        const sceneId = sceneResult.data.createScene.id;

        // 5. Play Scene - Verify Channel 1 is 255
        console.log('Playing Scene (Expect Channel 1 = 255)...');
        const initialPackets = await captureArtNetPackets(async () => {
            await server.executeMutation(mutations.setSceneLive, { sceneId });
        }, { port, filterUniverse: 1 });

        const initialPacket = initialPackets[initialPackets.length - 1];
        expect(initialPacket).toBeDefined();
        expect(initialPacket.universe).toBe(0);
        expect(initialPacket.dmxData[0]).toBe(255); // Channel 1 (index 0)

        // 6. Repatch: Update Fixture A to Address 10
        console.log('Repatching Fixture A to Address 10...');
        await server.executeMutation(mutations.updateFixtureInstance, {
            id: fixtureId,
            input: {
                startChannel: 10
            }
        });

        // 7. Clear DMX output and Play Scene Again - Verify Channel 1 is 0, Channel 10 is 255
        console.log('Clearing DMX and Playing Scene Again (Expect Channel 1 = 0, Channel 10 = 255)...');
        const repatchedPackets = await captureArtNetPackets(async () => {
            // First clear all channels by setting them to 0
            for (let i = 1; i <= 12; i++) {
                await server.executeMutation(mutations.setChannelValue, {
                    universe: 1,
                    channel: i,
                    value: 0
                });
            }
            // Then re-apply the scene to trigger DMX update with new address
            await server.executeMutation(mutations.setSceneLive, { sceneId });
        }, { port, filterUniverse: 1, timeout: 1500 });

        const repatchedPacket = repatchedPackets[repatchedPackets.length - 1];
        expect(repatchedPacket).toBeDefined();
        expect(repatchedPacket.universe).toBe(0);
        expect(repatchedPacket.dmxData[0]).toBe(0);   // Channel 1 should be 0 now
        expect(repatchedPacket.dmxData[9]).toBe(255); // Channel 10 (index 9) should be 255
    });
});
