import { IntegrationTestHelper, mutations } from '../../test/graphql-integration-test-helper';
import { captureArtNetPackets } from '../../test/artnet-test-helper';

describe('DMX Control Mutations Integration Tests', () => {
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

    describe('setChannelValue mutation', () => {
        it('should set channel value and verify Art-Net packet', async () => {
            const server = helper.getTestServer();

            const packets = await captureArtNetPackets(async () => {
                const result = await server.executeMutation(mutations.setChannelValue, {
                    universe: 1,
                    channel: 5,
                    value: 255
                });

                expect(result.data).toBeDefined();
                expect(result.data!.setChannelValue).toBe(true);
            }, { timeout: 1500 });

            // Verify Art-Net packets were sent
            expect(packets.length).toBeGreaterThan(0);

            // Get latest packet for universe 1 (Art-Net uses 0-based universe)
            const universe1Packets = packets.filter(p => p.universe === 0);
            expect(universe1Packets.length).toBeGreaterThan(0);

            const latestPacket = universe1Packets[universe1Packets.length - 1];

            // Verify channel 5 (index 4, 0-based) has value 255
            expect(latestPacket.dmxData[4]).toBe(255);
        });

        it('should set multiple channels sequentially', async () => {
            const server = helper.getTestServer();

            const packets = await captureArtNetPackets(async () => {
                // Set channel 1 to 100
                await server.executeMutation(mutations.setChannelValue, {
                    universe: 1,
                    channel: 1,
                    value: 100
                });

                // Set channel 2 to 200
                await server.executeMutation(mutations.setChannelValue, {
                    universe: 1,
                    channel: 2,
                    value: 200
                });
            }, { timeout: 2000 });

            expect(packets.length).toBeGreaterThan(0);

            const universe1Packets = packets.filter(p => p.universe === 0);
            const latestPacket = universe1Packets[universe1Packets.length - 1];

            // Verify both channels are set
            expect(latestPacket.dmxData[0]).toBe(100); // Channel 1
            expect(latestPacket.dmxData[1]).toBe(200); // Channel 2
        });

        it('should verify DMX output query matches Art-Net packets', async () => {
            const server = helper.getTestServer();

            // Set a channel value
            await server.executeMutation(mutations.setChannelValue, {
                universe: 1,
                channel: 10,
                value: 128
            });

            // Wait a bit for DMX to update
            await new Promise(resolve => setTimeout(resolve, 100));

            // Query DMX output
            const query = `
                query GetDmxOutput($universe: Int!) {
                    dmxOutput(universe: $universe)
                }
            `;

            const result = await server.executeQuery(query, {
                universe: 1
            });

            expect(result.data).toBeDefined();
            expect(result.data!.dmxOutput[9]).toBe(128); // Channel 10 is index 9
        });
    });

    describe('fadeToBlack mutation', () => {
        it('should fade all channels to zero and verify Art-Net', async () => {
            const server = helper.getTestServer();

            // First set some channels to non-zero values
            await server.executeMutation(mutations.setChannelValue, {
                universe: 1,
                channel: 1,
                value: 255
            });
            await server.executeMutation(mutations.setChannelValue, {
                universe: 1,
                channel: 2,
                value: 200
            });

            // Wait a bit
            await new Promise(resolve => setTimeout(resolve, 100));

            // Now fade to black
            const packets = await captureArtNetPackets(async () => {
                const fadeMutation = `
                    mutation FadeToBlack($fadeOutTime: Float!) {
                        fadeToBlack(fadeOutTime: $fadeOutTime)
                    }
                `;

                const result = await server.executeMutation(fadeMutation, {
                    fadeOutTime: 0.5 // 0.5 seconds
                });

                expect(result.data).toBeDefined();
                expect(result.data!.fadeToBlack).toBe(true);

                // Wait for fade to complete
                await new Promise(resolve => setTimeout(resolve, 600));
            }, { timeout: 1500 });

            expect(packets.length).toBeGreaterThan(0);

            // Get the latest packet
            const latestPacket = packets[packets.length - 1];

            // Verify all channels are at 0 (or very close due to fade)
            // Check first few channels that we set
            expect(latestPacket.dmxData[0]).toBeLessThanOrEqual(5); // Allow small tolerance
            expect(latestPacket.dmxData[1]).toBeLessThanOrEqual(5);
        });

        it('should verify DMX output shows zeros after fade to black', async () => {
            const server = helper.getTestServer();

            // Set some channels
            await server.executeMutation(mutations.setChannelValue, {
                universe: 1,
                channel: 5,
                value: 255
            });

            // Fade to black
            const fadeMutation = `
                mutation FadeToBlack($fadeOutTime: Float!) {
                    fadeToBlack(fadeOutTime: $fadeOutTime)
                }
            `;

            await server.executeMutation(fadeMutation, {
                fadeOutTime: 0.1
            });

            // Wait for fade to complete
            await new Promise(resolve => setTimeout(resolve, 200));

            // Query DMX output
            const query = `
                query GetDmxOutput($universe: Int!) {
                    dmxOutput(universe: $universe)
                }
            `;

            const result = await server.executeQuery(query, {
                universe: 1
            });

            expect(result.data).toBeDefined();
            // All channels should be 0
            expect(result.data!.dmxOutput[4]).toBe(0); // Channel 5
        });
    });
});
