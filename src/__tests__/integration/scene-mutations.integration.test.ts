import { IntegrationTestHelper, mutations } from '../../test/graphql-integration-test-helper';
import { captureArtNetPackets } from '../../test/artnet-test-helper';

describe('Scene Mutations Integration Tests', () => {
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

    describe('createScene mutation', () => {
        it('should create scene with empty fixture values', async () => {
            const server = helper.getTestServer();

            // Create project first
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            const result = await server.executeMutation(mutations.createScene, {
                input: {
                    projectId,
                    name: 'Empty Scene',
                    description: 'Scene with no fixtures',
                    fixtureValues: []
                }
            });

            expect(result.data).toBeDefined();
            expect(result.data!.createScene).toMatchObject({
                name: 'Empty Scene',
                description: 'Scene with no fixtures'
            });
            expect(result.data!.createScene.id).toBeDefined();

            // Verify in database
            const prisma = helper.getPrisma();
            const scene = await prisma.scene.findUnique({
                where: { id: result.data!.createScene.id }
            });
            expect(scene).toBeDefined();
            expect(scene!.name).toBe('Empty Scene');
        });
    });

    describe('updateScene mutation', () => {
        it('should update scene name and description', async () => {
            const server = helper.getTestServer();

            // Create project and scene
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            const sceneResult = await server.executeMutation(mutations.createScene, {
                input: {
                    projectId,
                    name: 'Original Scene',
                    fixtureValues: []
                }
            });
            const sceneId = sceneResult.data!.createScene.id;

            // Update scene
            const updateMutation = `
                mutation UpdateScene($id: ID!, $input: UpdateSceneInput!) {
                    updateScene(id: $id, input: $input) {
                        id
                        name
                        description
                    }
                }
            `;

            const result = await server.executeMutation(updateMutation, {
                id: sceneId,
                input: {
                    name: 'Updated Scene',
                    description: 'Updated description'
                }
            });

            expect(result.data).toBeDefined();
            expect(result.data!.updateScene).toMatchObject({
                id: sceneId,
                name: 'Updated Scene',
                description: 'Updated description'
            });

            // Verify in database
            const prisma = helper.getPrisma();
            const scene = await prisma.scene.findUnique({
                where: { id: sceneId }
            });
            expect(scene!.name).toBe('Updated Scene');
        });
    });

    describe('deleteScene mutation', () => {
        it('should delete scene', async () => {
            const server = helper.getTestServer();

            // Create project and scene
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            const sceneResult = await server.executeMutation(mutations.createScene, {
                input: {
                    projectId,
                    name: 'Scene to Delete',
                    fixtureValues: []
                }
            });
            const sceneId = sceneResult.data!.createScene.id;

            // Delete scene
            const deleteMutation = `
                mutation DeleteScene($id: ID!) {
                    deleteScene(id: $id)
                }
            `;

            const result = await server.executeMutation(deleteMutation, {
                id: sceneId
            });

            expect(result.data).toBeDefined();
            expect(result.data!.deleteScene).toBe(true);

            // Verify deleted from database
            const prisma = helper.getPrisma();
            const scene = await prisma.scene.findUnique({
                where: { id: sceneId }
            });
            expect(scene).toBeNull();
        });
    });

    describe('setSceneLive mutation', () => {
        it('should activate scene and verify Art-Net packets', async () => {
            const server = helper.getTestServer();

            // Create project and scene
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            const sceneResult = await server.executeMutation(mutations.createScene, {
                input: {
                    projectId,
                    name: 'Live Scene',
                    fixtureValues: []
                }
            });
            const sceneId = sceneResult.data!.createScene.id;

            // Set scene live and capture Art-Net packets
            const packets = await captureArtNetPackets(async () => {
                const result = await server.executeMutation(mutations.setSceneLive, {
                    sceneId
                });

                expect(result.data).toBeDefined();
                expect(result.data!.setSceneLive).toBe(true);
            }, { timeout: 1500 });

            // Verify Art-Net packets were sent
            expect(packets.length).toBeGreaterThan(0);
        });
    });

    describe('cloneScene mutation', () => {
        it('should clone scene with new name', async () => {
            const server = helper.getTestServer();

            // Create project and scene
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            const sceneResult = await server.executeMutation(mutations.createScene, {
                input: {
                    projectId,
                    name: 'Original Scene',
                    description: 'Original description',
                    fixtureValues: []
                }
            });
            const originalSceneId = sceneResult.data!.createScene.id;

            // Clone scene
            const cloneMutation = `
                mutation CloneScene($sceneId: ID!, $newName: String!) {
                    cloneScene(sceneId: $sceneId, newName: $newName) {
                        id
                        name
                        description
                    }
                }
            `;

            const result = await server.executeMutation(cloneMutation, {
                sceneId: originalSceneId,
                newName: 'Cloned Scene'
            });

            expect(result.data).toBeDefined();
            expect(result.data!.cloneScene.name).toBe('Cloned Scene');
            expect(result.data!.cloneScene.id).not.toBe(originalSceneId);
            expect(result.data!.cloneScene.description).toBe('Original description');

            // Verify both scenes exist in database
            const prisma = helper.getPrisma();
            const scenes = await prisma.scene.findMany({
                where: { projectId }
            });
            expect(scenes.length).toBe(2);
        });
    });
});
