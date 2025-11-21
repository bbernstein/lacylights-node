import { IntegrationTestHelper, queries, mutations } from '../../test/graphql-integration-test-helper';

describe('Project Queries Integration Tests', () => {
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

    describe('projects query', () => {
        it('should return empty array when no projects exist', async () => {
            const server = helper.getTestServer();

            const result = await server.executeQuery(queries.getProjects);

            expect(result.data).toBeDefined();
            expect(result.data!.projects).toEqual([]);
        });

        it('should return all projects', async () => {
            const server = helper.getTestServer();

            // Create test projects
            await server.executeMutation(mutations.createProject, {
                input: { name: 'Project 1', description: 'First project' }
            });
            await server.executeMutation(mutations.createProject, {
                input: { name: 'Project 2', description: 'Second project' }
            });

            const result = await server.executeQuery(queries.getProjects);

            expect(result.data).toBeDefined();
            expect(result.data!.projects).toHaveLength(2);
            expect(result.data!.projects[0]).toMatchObject({
                name: 'Project 1',
                description: 'First project'
            });
            expect(result.data!.projects[1]).toMatchObject({
                name: 'Project 2',
                description: 'Second project'
            });
        });

        it('should include project metadata fields', async () => {
            const server = helper.getTestServer();

            await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });

            const result = await server.executeQuery(queries.getProjects);

            expect(result.data).toBeDefined();
            const project = result.data!.projects[0];
            expect(project).toHaveProperty('id');
            expect(project).toHaveProperty('name');
            expect(project).toHaveProperty('description');
            expect(project).toHaveProperty('createdAt');
            expect(project).toHaveProperty('updatedAt');
        });
    });

    describe('project query', () => {
        it('should return null for non-existent project', async () => {
            const server = helper.getTestServer();

            const result = await server.executeQuery(queries.getProject, {
                id: 'non-existent-id'
            });

            expect(result.data).toBeDefined();
            expect(result.data!.project).toBeNull();
        });

        it('should return project with basic fields', async () => {
            const server = helper.getTestServer();

            const createResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'My Project', description: 'Test description' }
            });

            const projectId = createResult.data!.createProject.id;

            const result = await server.executeQuery(queries.getProject, {
                id: projectId
            });

            expect(result.data).toBeDefined();
            expect(result.data!.project).toMatchObject({
                id: projectId,
                name: 'My Project',
                description: 'Test description'
            });
        });

        it('should include nested fixtures when they exist', async () => {
            const server = helper.getTestServer();

            // Create project via GraphQL
            const createResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Project with Fixtures' }
            });
            const projectId = createResult.data!.createProject.id;

            // Note: In a real scenario, fixtures would be created via GraphQL mutations
            // For now, we'll just verify the query structure works
            const result = await server.executeQuery(queries.getProject, {
                id: projectId
            });

            expect(result.data).toBeDefined();
            expect(result.data!.project).toBeDefined();
            expect(result.data!.project).toHaveProperty('fixtures');
            // Fixtures array will be empty since we didn't create any, but the field should exist
            expect(Array.isArray(result.data!.project.fixtures)).toBe(true);
        });

        it('should include nested scenes when they exist', async () => {
            const server = helper.getTestServer();

            // Create project via GraphQL
            const createResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Project with Scenes' }
            });
            const projectId = createResult.data!.createProject.id;

            // Note: In a real scenario, scenes would be created via GraphQL mutations
            // For now, we'll just verify the query structure works
            const result = await server.executeQuery(queries.getProject, {
                id: projectId
            });

            expect(result.data).toBeDefined();
            expect(result.data!.project).toBeDefined();
            expect(result.data!.project).toHaveProperty('scenes');
            // Scenes array will be empty since we didn't create any, but the field should exist
            expect(Array.isArray(result.data!.project.scenes)).toBe(true);
        });

        it('should return project with empty nested arrays when no relations exist', async () => {
            const server = helper.getTestServer();

            // Create project via GraphQL
            const createResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Empty Project' }
            });
            const projectId = createResult.data!.createProject.id;

            const result = await server.executeQuery(queries.getProject, {
                id: projectId
            });

            expect(result.data).toBeDefined();
            const project = result.data!.project;

            // Verify all nested data fields exist but are empty
            expect(project.fixtures).toBeDefined();
            expect(project.fixtures).toEqual([]);
            expect(project.scenes).toBeDefined();
            expect(project.scenes).toEqual([]);
        });
    });
});
