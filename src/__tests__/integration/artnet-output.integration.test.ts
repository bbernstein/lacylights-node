import { IntegrationTestHelper, mutations, queries } from '../../test/graphql-integration-test-helper';
import { ArtNetCapture, captureArtNetPackets } from '../../test/artnet-test-helper';
import { dmxService } from '../../services/dmx';
import type {
    DmxOutputResponse,
    StartPreviewSessionResponse,
    UpdateSettingResponse
} from '../../test/integration-types';

describe('Art-Net Output Integration Tests', () => {
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
        // Reset DMX service state
        dmxService.clearAllOverrides();
    });

    describe('Basic Art-Net Output', () => {
        it('should send Art-Net packets when setting a channel value', async () => {
            const server = helper.getTestServer();

            const packets = await captureArtNetPackets(async () => {
                // Set a channel value
                await server.executeMutation(mutations.setChannelValue, {
                    universe: 1,
                    channel: 5,
                    value: 255,
                });
            }, { timeout: 1500 });

            expect(packets.length).toBeGreaterThan(0);

            const packet = packets[packets.length - 1]; // Get latest packet

            // Validate packet structure
            ArtNetCapture.validatePacketStructure(packet);

            // Validate channel value
            expect(packet.dmxData[4]).toBe(255); // Channel 5 is index 4 (0-based)

            // Verify other channels are 0
            expect(packet.dmxData[0]).toBe(0);
            expect(packet.dmxData[1]).toBe(0);
        });

        it('should send correct Art-Net packet structure', async () => {
            const server = helper.getTestServer();

            const packets = await captureArtNetPackets(async () => {
                await server.executeMutation(mutations.setChannelValue, {
                    universe: 1,
                    channel: 1,
                    value: 128,
                });
            }, { timeout: 1500 });

            expect(packets.length).toBeGreaterThan(0);

            const packet = packets[0];
            expect(packet.header).toBe('Art-Net\0');
            expect(packet.opcode).toBe(0x5000);
            expect(packet.protocolVersion).toBe(14);
            expect(packet.dataLength).toBe(512);
            expect(packet.dmxData).toHaveLength(512);
        });

        it('should send separate packets for multiple universes', async () => {
            const server = helper.getTestServer();

            const packets = await captureArtNetPackets(async () => {
                await server.executeMutation(mutations.setChannelValue, {
                    universe: 1,
                    channel: 1,
                    value: 100,
                });

                await server.executeMutation(mutations.setChannelValue, {
                    universe: 2,
                    channel: 1,
                    value: 200,
                });

                // Wait a bit for packets
                await new Promise(resolve => setTimeout(resolve, 500));
            }, { timeout: 1500 });

            // Should have packets for both universes
            const universe1Packets = packets.filter(p => p.universe === 0); // Art-Net is 0-based
            const universe2Packets = packets.filter(p => p.universe === 1);

            expect(universe1Packets.length).toBeGreaterThan(0);
            expect(universe2Packets.length).toBeGreaterThan(0);

            // Verify values in latest packets
            const latestU1 = universe1Packets[universe1Packets.length - 1];
            const latestU2 = universe2Packets[universe2Packets.length - 1];

            expect(latestU1.dmxData[0]).toBe(100);
            expect(latestU2.dmxData[0]).toBe(200);
        });
    });

    describe('Scene Activation Art-Net Output', () => {
        it('should send Art-Net packets with scene values when setting scene live', async () => {
            const server = helper.getTestServer();

            // Create test setup
            const setup = await server.dataFactory.createCompleteTestSetup();
            const scene = setup.scenes[0]; // Scene with RGB values

            // Capture Art-Net packets while setting scene live
            const packets = await captureArtNetPackets(async () => {
                await server.executeMutation(mutations.setSceneLive, {
                    sceneId: scene.id,
                });
            }, { timeout: 2000 });

            expect(packets.length).toBeGreaterThan(0);

            // Find latest packet for universe 1
            const universe1Packets = packets.filter(p => p.universe === 0);
            expect(universe1Packets.length).toBeGreaterThan(0);

            const latestPacket = universe1Packets[universe1Packets.length - 1];

            // Verify DMX values match scene
            // Fixture 1: channels 1-3 = [255, 0, 0] (Red)
            expect(latestPacket.dmxData[0]).toBe(255); // Channel 1
            expect(latestPacket.dmxData[1]).toBe(0);   // Channel 2
            expect(latestPacket.dmxData[2]).toBe(0);   // Channel 3

            // Fixture 2: channels 4-6 = [0, 255, 0] (Green)
            expect(latestPacket.dmxData[3]).toBe(0);   // Channel 4
            expect(latestPacket.dmxData[4]).toBe(255); // Channel 5
            expect(latestPacket.dmxData[5]).toBe(0);   // Channel 6

            // Fixture 3: channels 7-9 = [0, 0, 255] (Blue)
            expect(latestPacket.dmxData[6]).toBe(0);   // Channel 7
            expect(latestPacket.dmxData[7]).toBe(0);   // Channel 8
            expect(latestPacket.dmxData[8]).toBe(255); // Channel 9
        });

        it('should verify DMX output via GraphQL query matches Art-Net packets', async () => {
            const server = helper.getTestServer();

            // Create test setup
            const setup = await server.dataFactory.createCompleteTestSetup();
            const scene = setup.scenes[0];

            // Set scene live
            await server.executeMutation(mutations.setSceneLive, {
                sceneId: scene.id,
            });

            // Small delay for DMX to update
            await new Promise(resolve => setTimeout(resolve, 300));

            // Query DMX output
            const result = await server.executeQuery<DmxOutputResponse>(queries.getDmxOutput, {
                universe: 1,
            });

            expect(result.data).toBeDefined();
            const dmxChannels = result.data.dmxOutput;

            // Capture Art-Net packet
            const packets = await captureArtNetPackets(async () => {
                // Trigger a small change to get a fresh packet
                await server.executeMutation(mutations.setChannelValue, {
                    universe: 1,
                    channel: 100,
                    value: 1,
                });
            }, { timeout: 1000 });

            const packet = packets[packets.length - 1];

            // Verify GraphQL dmxOutput matches Art-Net packet data
            for (let i = 0; i < 9; i++) {
                expect(dmxChannels[i]).toBe(packet.dmxData[i]);
            }
        });
    });

    describe('Preview Mode Art-Net Output', () => {
        it('should send Art-Net packets with preview overrides', async () => {
            const server = helper.getTestServer();

            // Create test setup
            const setup = await server.dataFactory.createCompleteTestSetup();

            // Start preview session
            const previewResult = await server.executeMutation<StartPreviewSessionResponse>(mutations.startPreviewSession, {
                projectId: setup.project.id,
            });

            const sessionId = previewResult.data.startPreviewSession.id;

            // Initialize preview with a scene
            const scene = setup.scenes[0];

            const packets = await captureArtNetPackets(async () => {
                await server.executeMutation(mutations.initializePreviewWithScene, {
                    sessionId,
                    sceneId: scene.id,
                });
            }, { timeout: 2000 });

            expect(packets.length).toBeGreaterThan(0);

            const latestPacket = packets.filter(p => p.universe === 0)[0];

            // Verify preview values in Art-Net
            expect(latestPacket.dmxData[0]).toBe(255); // Red from scene
            expect(latestPacket.dmxData[4]).toBe(255); // Green from scene
            expect(latestPacket.dmxData[8]).toBe(255); // Blue from scene
        });
    });

    describe('Broadcast Address Configuration', () => {
        it('should update Art-Net broadcast address via settings', async () => {
            const server = helper.getTestServer();

            // This test verifies the setting is stored, but actual network
            // address change validation would require network tooling
            const result = await server.executeMutation<UpdateSettingResponse>(
                `mutation UpdateSetting($input: UpdateSettingInput!) {
          updateSetting(input: $input) {
            id
            key
            value
          }
        }`,
                {
                    input: {
                        key: 'artnet_broadcast_address',
                        value: '192.168.1.255',
                    },
                }
            );

            expect(result.data).toBeDefined();
            expect(result.data.updateSetting.value).toBe('192.168.1.255');

            // Verify DMX service updated
            const broadcastAddress = dmxService.getBroadcastAddress();
            expect(broadcastAddress).toBe('192.168.1.255');
        });
    });
});
