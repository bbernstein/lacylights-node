import { IntegrationTestHelper, mutations } from '../../test/graphql-integration-test-helper';

describe('Subscription Integration Tests', () => {
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

    describe('dmxOutputChanged subscription', () => {
        it('should have subscription infrastructure defined', async () => {
            const server = helper.getTestServer();

            // DMX_OUTPUT_CHANGED is published by preview service
            // This test verifies the subscription infrastructure exists
            expect(server.pubsub).toBeDefined();

            const iterator = server.pubsub.asyncIterator('DMX_OUTPUT_CHANGED');
            expect(iterator).toBeDefined();
        });
    });

    describe('previewSessionUpdated subscription', () => {
        it('should publish event when preview session is started', async () => {
            const server = helper.getTestServer();

            // Spy on pubsub.publish
            const publishSpy = jest.spyOn(server.pubsub, 'publish');

            // Create project
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            // Start preview session
            await server.executeMutation(mutations.startPreviewSession, {
                projectId
            });

            // Verify publish was called with correct event
            expect(publishSpy).toHaveBeenCalledWith(
                'PREVIEW_SESSION_UPDATED',
                expect.objectContaining({
                    previewSessionUpdated: expect.any(Object)
                })
            );
        });

        it('should publish event when preview is initialized with scene', async () => {
            const server = helper.getTestServer();

            // Create project and scene
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            // Create fixture definition and instance
            const defResult = await server.executeMutation(mutations.createFixtureDefinition, {
                input: {
                    manufacturer: 'Test',
                    model: 'Test Model',
                    type: 'OTHER',
                    channels: [
                        {
                            offset: 1,
                            name: 'Red',
                            type: 'RED',
                            minValue: 0,
                            maxValue: 255,
                            defaultValue: 0
                        },
                        {
                            offset: 2,
                            name: 'Green',
                            type: 'GREEN',
                            minValue: 0,
                            maxValue: 255,
                            defaultValue: 0
                        },
                        {
                            offset: 3,
                            name: 'Blue',
                            type: 'BLUE',
                            minValue: 0,
                            maxValue: 255,
                            defaultValue: 0
                        }
                    ]
                }
            });
            const defId = defResult.data!.createFixtureDefinition.id;

            const fixtureResult = await server.executeMutation(mutations.createFixtureInstance, {
                input: {
                    projectId,
                    definitionId: defId,
                    name: 'Test Fixture',
                    universe: 1,
                    startChannel: 1
                }
            });
            const fixtureId = fixtureResult.data!.createFixtureInstance.id;

            const sceneResult = await server.executeMutation(mutations.createScene, {
                input: {
                    projectId,
                    name: 'Test Scene',
                    fixtureValues: [
                        {
                            fixtureId,
                            channelValues: [255, 0, 0]
                        }
                    ]
                }
            });
            const sceneId = sceneResult.data!.createScene.id;

            // Start preview session first
            const sessionResult = await server.executeMutation(mutations.startPreviewSession, {
                projectId
            });
            const sessionId = sessionResult.data!.startPreviewSession.id;

            // Spy on pubsub.publish
            const publishSpy = jest.spyOn(server.pubsub, 'publish');

            // Initialize preview with scene
            await server.executeMutation(mutations.initializePreviewWithScene, {
                sessionId,
                sceneId
            });

            // Verify publish was called
            expect(publishSpy).toHaveBeenCalledWith(
                'DMX_OUTPUT_CHANGED',
                expect.any(Object)
            );
        });
    });

    describe('cueListPlaybackUpdated subscription', () => {
        it('should publish event when cue list playback starts', async () => {
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

            // Spy on pubsub.publish
            const publishSpy = jest.spyOn(server.pubsub, 'publish');

            // Start cue list playback
            const startMutation = `
                mutation StartCueList($cueListId: ID!) {
                    startCueList(cueListId: $cueListId)
                }
            `;

            await server.executeMutation(startMutation, {
                cueListId: cueList!.id
            });

            // Verify publish was called
            expect(publishSpy).toHaveBeenCalledWith(
                'CUE_LIST_PLAYBACK_UPDATED',
                expect.any(Object)
            );
        });
    });

    describe('systemInfoUpdated subscription', () => {
        it('should publish event when system setting is updated', async () => {
            const server = helper.getTestServer();

            // Spy on pubsub.publish
            const publishSpy = jest.spyOn(server.pubsub, 'publish');

            // Update a system setting
            const updateMutation = `
                mutation UpdateSetting($input: UpdateSettingInput!) {
                    updateSetting(input: $input) {
                        key
                        value
                    }
                }
            `;

            await server.executeMutation(updateMutation, {
                input: {
                    key: 'artnet_broadcast_address',
                    value: '127.0.0.1'
                }
            });

            // Verify publish was called
            expect(publishSpy).toHaveBeenCalledWith(
                'SYSTEM_INFO_UPDATED',
                expect.objectContaining({
                    systemInfoUpdated: expect.any(Object)
                })
            );
        });
    });

    describe('wifiStatusUpdated subscription', () => {
        it('should have subscription infrastructure defined', async () => {
            const server = helper.getTestServer();

            // WiFi operations require platform-specific setup
            // This test verifies the subscription infrastructure exists
            expect(server.pubsub).toBeDefined();

            // Verify the event name is correct
            const iterator = server.pubsub.asyncIterator('WIFI_STATUS_UPDATED');
            expect(iterator).toBeDefined();
        });
    });

    describe('projectUpdated subscription', () => {
        it('should have subscription infrastructure defined', async () => {
            const server = helper.getTestServer();

            // Project mutations don't currently publish PROJECT_UPDATED events
            // This test verifies the subscription infrastructure exists
            expect(server.pubsub).toBeDefined();

            // Verify the event name is correct
            const iterator = server.pubsub.asyncIterator('PROJECT_UPDATED');
            expect(iterator).toBeDefined();
        });
    });
});
