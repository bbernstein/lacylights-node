import { IntegrationTestHelper, mutations } from '../../test/graphql-integration-test-helper';

describe('Scene Queries Integration Tests', () => {
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

    describe('scenes query', () => {
        it('should return empty page when no scenes exist', async () => {
            const server = helper.getTestServer();

            // Create a project first
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            const query = `
                query GetScenes($projectId: ID!, $page: Int, $perPage: Int) {
                    scenes(projectId: $projectId, page: $page, perPage: $perPage) {
                        scenes {
                            id
                            name
                        }
                        pagination {
                            total
                            page
                            perPage
                            totalPages
                            hasMore
                        }
                    }
                }
            `;

            const result = await server.executeQuery(query, {
                projectId,
                page: 1,
                perPage: 50
            });

            expect(result.data).toBeDefined();
            expect(result.data!.scenes.scenes).toEqual([]);
            expect(result.data!.scenes.pagination.total).toBe(0);
            expect(result.data!.scenes.pagination.hasMore).toBe(false);
        });

        it('should return paginated scenes', async () => {
            const server = helper.getTestServer();

            // Create project and scenes
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            // Create multiple scenes
            for (let i = 1; i <= 3; i++) {
                await server.executeMutation(mutations.createScene, {
                    input: {
                        projectId,
                        name: `Scene ${i}`,
                        fixtureValues: []
                    }
                });
            }

            const query = `
                query GetScenes($projectId: ID!, $page: Int, $perPage: Int) {
                    scenes(projectId: $projectId, page: $page, perPage: $perPage) {
                        scenes {
                            id
                            name
                        }
                        pagination {
                            total
                            page
                            perPage
                            totalPages
                            hasMore
                        }
                    }
                }
            `;

            const result = await server.executeQuery(query, {
                projectId,
                page: 1,
                perPage: 50
            });

            expect(result.data).toBeDefined();
            expect(result.data!.scenes.scenes.length).toBe(3);
            expect(result.data!.scenes.pagination.total).toBe(3);
            expect(result.data!.scenes.pagination.totalPages).toBe(1);
        });
    });

    describe('scene query', () => {
        it('should return null for non-existent scene', async () => {
            const server = helper.getTestServer();

            const query = `
                query GetScene($id: ID!) {
                    scene(id: $id) {
                        id
                        name
                    }
                }
            `;

            const result = await server.executeQuery(query, {
                id: 'non-existent-id'
            });

            expect(result.data).toBeDefined();
            expect(result.data!.scene).toBeNull();
        });

        it('should return scene with basic fields', async () => {
            const server = helper.getTestServer();

            // Create project and scene
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            const sceneResult = await server.executeMutation(mutations.createScene, {
                input: {
                    projectId,
                    name: 'Test Scene',
                    description: 'Test description',
                    fixtureValues: []
                }
            });
            const sceneId = sceneResult.data!.createScene.id;

            const query = `
                query GetScene($id: ID!) {
                    scene(id: $id) {
                        id
                        name
                        description
                        createdAt
                        updatedAt
                    }
                }
            `;

            const result = await server.executeQuery(query, {
                id: sceneId
            });

            expect(result.data).toBeDefined();
            expect(result.data!.scene).toMatchObject({
                id: sceneId,
                name: 'Test Scene',
                description: 'Test description'
            });
            expect(result.data!.scene.createdAt).toBeDefined();
            expect(result.data!.scene.updatedAt).toBeDefined();
        });

        it('should include fixture values when requested', async () => {
            const server = helper.getTestServer();

            // Create project and scene
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

            const query = `
                query GetScene($id: ID!, $includeFixtureValues: Boolean) {
                    scene(id: $id, includeFixtureValues: $includeFixtureValues) {
                        id
                        name
                        fixtureValues {
                            id
                            channelValues
                        }
                    }
                }
            `;

            const result = await server.executeQuery(query, {
                id: sceneId,
                includeFixtureValues: true
            });

            expect(result.data).toBeDefined();
            expect(result.data!.scene).toBeDefined();
            expect(result.data!.scene.fixtureValues).toBeDefined();
            expect(Array.isArray(result.data!.scene.fixtureValues)).toBe(true);
        });
    });

    describe('currentActiveScene query', () => {
        it('should return null when no scene is active', async () => {
            const server = helper.getTestServer();

            const query = `
                query GetCurrentActiveScene {
                    currentActiveScene {
                        id
                        name
                    }
                }
            `;

            const result = await server.executeQuery(query);

            expect(result.data).toBeDefined();
            expect(result.data!.currentActiveScene).toBeNull();
        });

        it('should return active scene after setting scene live', async () => {
            const server = helper.getTestServer();

            // Create project and scene
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            const sceneResult = await server.executeMutation(mutations.createScene, {
                input: {
                    projectId,
                    name: 'Active Scene',
                    fixtureValues: []
                }
            });
            const sceneId = sceneResult.data!.createScene.id;

            // Set scene live
            await server.executeMutation(mutations.setSceneLive, {
                sceneId
            });

            const query = `
                query GetCurrentActiveScene {
                    currentActiveScene {
                        id
                        name
                    }
                }
            `;

            const result = await server.executeQuery(query);

            expect(result.data).toBeDefined();
            expect(result.data!.currentActiveScene).toBeDefined();
            expect(result.data!.currentActiveScene.id).toBe(sceneId);
            expect(result.data!.currentActiveScene.name).toBe('Active Scene');
        });
    });

    describe('searchScenes query', () => {
        it('should search scenes by name', async () => {
            const server = helper.getTestServer();

            // Create project and scenes
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            await server.executeMutation(mutations.createScene, {
                input: { projectId, name: 'Red Scene', fixtureValues: [] }
            });
            await server.executeMutation(mutations.createScene, {
                input: { projectId, name: 'Blue Scene', fixtureValues: [] }
            });
            await server.executeMutation(mutations.createScene, {
                input: { projectId, name: 'Red and Blue', fixtureValues: [] }
            });

            const query = `
                query SearchScenes($projectId: ID!, $query: String!) {
                    searchScenes(projectId: $projectId, query: $query) {
                        scenes {
                            id
                            name
                        }
                        pagination {
                            total
                        }
                    }
                }
            `;

            const result = await server.executeQuery(query, {
                projectId,
                query: 'Red'
            });

            expect(result.data).toBeDefined();
            expect(result.data!.searchScenes.scenes.length).toBe(2);
            expect(result.data!.searchScenes.pagination.total).toBe(2);

            // Verify both scenes contain "Red" in the name
            result.data!.searchScenes.scenes.forEach((scene: any) => {
                expect(scene.name).toContain('Red');
            });
        });
    });
});
