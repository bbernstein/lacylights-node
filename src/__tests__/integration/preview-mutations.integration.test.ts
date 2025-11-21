import { IntegrationTestHelper, mutations } from '../../test/graphql-integration-test-helper';
import { captureArtNetPackets } from '../../test/artnet-test-helper';

describe('Preview Mutations Integration Tests', () => {
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

    describe('startPreviewSession mutation', () => {
        it('should start preview session', async () => {
            const server = helper.getTestServer();

            // Create project
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            const result = await server.executeMutation(mutations.startPreviewSession, {
                projectId
            });

            expect(result.data).toBeDefined();
            expect(result.data!.startPreviewSession).toBeDefined();
            expect(result.data!.startPreviewSession.id).toBeDefined();
            expect(result.data!.startPreviewSession.isActive).toBe(true);
            expect(result.data!.startPreviewSession.project.id).toBe(projectId);
        });
    });

    describe('initializePreviewWithScene mutation', () => {
        it('should initialize preview with scene and verify Art-Net', async () => {
            const server = helper.getTestServer();

            // Create project
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            // Create scene
            const sceneResult = await server.executeMutation(mutations.createScene, {
                input: {
                    projectId,
                    name: 'Preview Scene',
                    fixtureValues: []
                }
            });
            const sceneId = sceneResult.data!.createScene.id;

            // Start preview session
            const sessionResult = await server.executeMutation(mutations.startPreviewSession, {
                projectId
            });
            const sessionId = sessionResult.data!.startPreviewSession.id;

            // Initialize preview with scene and capture Art-Net
            const packets = await captureArtNetPackets(async () => {
                const result = await server.executeMutation(mutations.initializePreviewWithScene, {
                    sessionId,
                    sceneId
                });

                expect(result.data).toBeDefined();
                expect(result.data!.initializePreviewWithScene).toBe(true);
            }, { timeout: 1500 });

            // Verify Art-Net packets were sent
            expect(packets.length).toBeGreaterThan(0);
        });
    });

    describe('commitPreviewSession mutation', () => {
        it('should commit preview session', async () => {
            const server = helper.getTestServer();

            // Create project and start preview
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            const sessionResult = await server.executeMutation(mutations.startPreviewSession, {
                projectId
            });
            const sessionId = sessionResult.data!.startPreviewSession.id;

            // Commit preview
            const commitMutation = `
                mutation CommitPreviewSession($sessionId: ID!) {
                    commitPreviewSession(sessionId: $sessionId)
                }
            `;

            const result = await server.executeMutation(commitMutation, {
                sessionId
            });

            expect(result.data).toBeDefined();
            expect(result.data!.commitPreviewSession).toBe(true);
        });
    });

    describe('cancelPreviewSession mutation', () => {
        it('should cancel preview session and verify Art-Net reverts', async () => {
            const server = helper.getTestServer();

            // Create project and start preview
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            const sessionResult = await server.executeMutation(mutations.startPreviewSession, {
                projectId
            });
            const sessionId = sessionResult.data!.startPreviewSession.id;

            // Cancel preview and capture Art-Net
            const packets = await captureArtNetPackets(async () => {
                const cancelMutation = `
                    mutation CancelPreviewSession($sessionId: ID!) {
                        cancelPreviewSession(sessionId: $sessionId)
                    }
                `;

                const result = await server.executeMutation(cancelMutation, {
                    sessionId
                });

                expect(result.data).toBeDefined();
                expect(result.data!.cancelPreviewSession).toBe(true);
            }, { timeout: 1500 });

            // Verify Art-Net packets were sent (showing revert to base state)
            expect(packets.length).toBeGreaterThan(0);
        });
    });
});
