import { IntegrationTestHelper, mutations } from '../../test/graphql-integration-test-helper';
import { captureArtNetPackets } from '../../test/artnet-test-helper';

describe('Playback Mutations Integration Tests', () => {
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

    describe('startCueList mutation', () => {
        it('should start cue list playback and verify Art-Net', async () => {
            const server = helper.getTestServer();

            // Create project, scene, and cue list
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            const sceneResult = await server.executeMutation(mutations.createScene, {
                input: {
                    projectId,
                    name: 'Test Scene',
                    fixtureValues: []
                }
            });
            const sceneId = sceneResult.data!.createScene.id;

            const cueList = await server.dataFactory.createTestCueList(projectId, [
                {
                    sceneId,
                    cueNumber: 1,
                    fadeInTime: 0.5,
                    fadeOutTime: 0.5,
                    name: 'Cue 1'
                }
            ]);

            // Start cue list and capture Art-Net
            const packets = await captureArtNetPackets(async () => {
                const startMutation = `
                    mutation StartCueList($cueListId: ID!) {
                        startCueList(cueListId: $cueListId)
                    }
                `;

                const result = await server.executeMutation(startMutation, {
                    cueListId: cueList!.id
                });

                expect(result.data).toBeDefined();
                expect(result.data!.startCueList).toBe(true);

                // Wait for playback to start
                await new Promise(resolve => setTimeout(resolve, 200));
            }, { timeout: 1500 });

            // Verify Art-Net packets were sent
            expect(packets.length).toBeGreaterThan(0);
        });

        it('should verify playback status after starting', async () => {
            const server = helper.getTestServer();

            // Create project, scene, and cue list
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            const sceneResult = await server.executeMutation(mutations.createScene, {
                input: {
                    projectId,
                    name: 'Test Scene',
                    fixtureValues: []
                }
            });
            const sceneId = sceneResult.data!.createScene.id;

            const cueList = await server.dataFactory.createTestCueList(projectId, [
                {
                    sceneId,
                    cueNumber: 1,
                    fadeInTime: 3,
                    fadeOutTime: 3
                }
            ]);

            // Start cue list
            const startMutation = `
                mutation StartCueList($cueListId: ID!) {
                    startCueList(cueListId: $cueListId)
                }
            `;

            await server.executeMutation(startMutation, {
                cueListId: cueList!.id
            });

            // Query playback status
            const query = `
                query GetCueListPlaybackStatus($cueListId: ID!) {
                    cueListPlaybackStatus(cueListId: $cueListId) {
                        cueListId
                        isPlaying
                        currentCueIndex
                    }
                }
            `;

            const result = await server.executeQuery(query, {
                cueListId: cueList!.id
            });

            expect(result.data).toBeDefined();
            expect(result.data!.cueListPlaybackStatus.isPlaying).toBe(true);
            expect(result.data!.cueListPlaybackStatus.currentCueIndex).toBe(0);
        });
    });

    describe('stopCueList mutation', () => {
        it('should stop cue list playback', async () => {
            const server = helper.getTestServer();

            // Create project, scene, and cue list
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            const sceneResult = await server.executeMutation(mutations.createScene, {
                input: {
                    projectId,
                    name: 'Test Scene',
                    fixtureValues: []
                }
            });
            const sceneId = sceneResult.data!.createScene.id;

            const cueList = await server.dataFactory.createTestCueList(projectId, [
                {
                    sceneId,
                    cueNumber: 1,
                    fadeInTime: 3,
                    fadeOutTime: 3
                }
            ]);

            // Start cue list
            const startMutation = `
                mutation StartCueList($cueListId: ID!) {
                    startCueList(cueListId: $cueListId)
                }
            `;

            await server.executeMutation(startMutation, {
                cueListId: cueList!.id
            });

            // Stop cue list
            const stopMutation = `
                mutation StopCueList($cueListId: ID!) {
                    stopCueList(cueListId: $cueListId)
                }
            `;

            const result = await server.executeMutation(stopMutation, {
                cueListId: cueList!.id
            });

            expect(result.data).toBeDefined();
            expect(result.data!.stopCueList).toBe(true);

            // Verify playback status
            const query = `
                query GetCueListPlaybackStatus($cueListId: ID!) {
                    cueListPlaybackStatus(cueListId: $cueListId) {
                        isPlaying
                    }
                }
            `;

            const statusResult = await server.executeQuery(query, {
                cueListId: cueList!.id
            });

            expect(statusResult.data!.cueListPlaybackStatus.isPlaying).toBe(false);
        });
    });

    describe('playCue mutation', () => {
        it('should play single cue and verify Art-Net', async () => {
            const server = helper.getTestServer();

            // Create project, scene, and cue list
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            const sceneResult = await server.executeMutation(mutations.createScene, {
                input: {
                    projectId,
                    name: 'Test Scene',
                    fixtureValues: []
                }
            });
            const sceneId = sceneResult.data!.createScene.id;

            const cueList = await server.dataFactory.createTestCueList(projectId, [
                {
                    sceneId,
                    cueNumber: 1,
                    fadeInTime: 0.5,
                    fadeOutTime: 0.5
                }
            ]);

            const cueId = cueList!.cues![0].id;

            // Play cue and capture Art-Net
            const packets = await captureArtNetPackets(async () => {
                const playMutation = `
                    mutation PlayCue($cueId: ID!, $fadeInTime: Float) {
                        playCue(cueId: $cueId, fadeInTime: $fadeInTime)
                    }
                `;

                const result = await server.executeMutation(playMutation, {
                    cueId,
                    fadeInTime: 0.5
                });

                expect(result.data).toBeDefined();
                expect(result.data!.playCue).toBe(true);

                // Wait for playback
                await new Promise(resolve => setTimeout(resolve, 200));
            }, { timeout: 1500 });

            // Verify Art-Net packets were sent
            expect(packets.length).toBeGreaterThan(0);
        });
    });
});
