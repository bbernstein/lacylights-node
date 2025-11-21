import { IntegrationTestHelper, mutations } from '../../test/graphql-integration-test-helper';

describe('Cue Queries Integration Tests', () => {
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

    describe('cueLists query', () => {
        it('should return empty array when no cue lists exist', async () => {
            const server = helper.getTestServer();

            // Create a project first
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            const query = `
                query GetCueLists($projectId: ID!) {
                    cueLists(projectId: $projectId) {
                        id
                        name
                    }
                }
            `;

            const result = await server.executeQuery(query, {
                projectId
            });

            expect(result.data).toBeDefined();
            expect(result.data!.cueLists).toEqual([]);
        });

        it('should return all cue lists for a project', async () => {
            const server = helper.getTestServer();

            // Create project
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            // Create cue lists via data factory
            await server.dataFactory.createTestCueList(projectId, [], {
                name: 'Cue List 1'
            });
            await server.dataFactory.createTestCueList(projectId, [], {
                name: 'Cue List 2'
            });

            const query = `
                query GetCueLists($projectId: ID!) {
                    cueLists(projectId: $projectId) {
                        id
                        name
                        description
                    }
                }
            `;

            const result = await server.executeQuery(query, {
                projectId
            });

            expect(result.data).toBeDefined();
            expect(result.data!.cueLists.length).toBe(2);
            expect(result.data!.cueLists[0].name).toBe('Cue List 1');
            expect(result.data!.cueLists[1].name).toBe('Cue List 2');
        });
    });

    describe('cueList query', () => {
        it('should return null for non-existent cue list', async () => {
            const server = helper.getTestServer();

            const query = `
                query GetCueList($id: ID!) {
                    cueList(id: $id) {
                        id
                        name
                    }
                }
            `;

            const result = await server.executeQuery(query, {
                id: 'non-existent-id'
            });

            expect(result.data).toBeDefined();
            expect(result.data!.cueList).toBeNull();
        });

        it('should return cue list with basic fields', async () => {
            const server = helper.getTestServer();

            // Create project and cue list
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            const cueList = await server.dataFactory.createTestCueList(projectId, [], {
                name: 'Test Cue List',
                description: 'Test description'
            });

            const query = `
                query GetCueList($id: ID!) {
                    cueList(id: $id) {
                        id
                        name
                        description
                        loop
                    }
                }
            `;

            const result = await server.executeQuery(query, {
                id: cueList!.id
            });

            expect(result.data).toBeDefined();
            expect(result.data!.cueList).toMatchObject({
                id: cueList!.id,
                name: 'Test Cue List',
                description: 'Test description'
            });
        });
    });

    describe('cueListPlaybackStatus query', () => {
        it('should return playback status for cue list', async () => {
            const server = helper.getTestServer();

            // Create project and cue list
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            const cueList = await server.dataFactory.createTestCueList(projectId, [], {
                name: 'Test Cue List'
            });

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
            expect(result.data!.cueListPlaybackStatus).toBeDefined();
            expect(result.data!.cueListPlaybackStatus.cueListId).toBe(cueList!.id);
            expect(result.data!.cueListPlaybackStatus.isPlaying).toBe(false);
        });
    });
});
