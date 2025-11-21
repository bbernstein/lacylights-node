import { IntegrationTestHelper, mutations } from '../../test/graphql-integration-test-helper';

describe('Project Mutations Integration Tests', () => {
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

    describe('createProject mutation', () => {
        it('should create project with valid data', async () => {
            const server = helper.getTestServer();

            const result = await server.executeMutation(mutations.createProject, {
                input: {
                    name: 'New Project',
                    description: 'Test description'
                }
            });

            expect(result.data).toBeDefined();
            expect(result.data!.createProject).toMatchObject({
                name: 'New Project',
                description: 'Test description'
            });
            expect(result.data!.createProject.id).toBeDefined();
            expect(result.data!.createProject.createdAt).toBeDefined();
            expect(result.data!.createProject.updatedAt).toBeDefined();

            // Verify in database
            const prisma = helper.getPrisma();
            const project = await prisma.project.findUnique({
                where: { id: result.data!.createProject.id }
            });
            expect(project).toBeDefined();
            expect(project!.name).toBe('New Project');
            expect(project!.description).toBe('Test description');
        });

        it('should create project with only required fields', async () => {
            const server = helper.getTestServer();

            const result = await server.executeMutation(mutations.createProject, {
                input: {
                    name: 'Minimal Project'
                }
            });

            expect(result.data).toBeDefined();
            expect(result.data!.createProject.name).toBe('Minimal Project');
            expect(result.data!.createProject.description).toBeNull();
        });

        it('should reject project with missing name', async () => {
            const server = helper.getTestServer();

            const result = await server.executeMutation(mutations.createProject, {
                input: {
                    description: 'No name provided'
                }
            });

            expect(result.errors).toBeDefined();
            expect(result.errors!.length).toBeGreaterThan(0);
        });
    });

    describe('updateProject mutation', () => {
        it('should update project name and description', async () => {
            const server = helper.getTestServer();

            // Create a project first
            const createResult = await server.executeMutation(mutations.createProject, {
                input: {
                    name: 'Original Name',
                    description: 'Original description'
                }
            });
            const projectId = createResult.data!.createProject.id;

            // Update the project
            const updateMutation = `
                mutation UpdateProject($id: ID!, $input: CreateProjectInput!) {
                    updateProject(id: $id, input: $input) {
                        id
                        name
                        description
                        updatedAt
                    }
                }
            `;

            const result = await server.executeMutation(updateMutation, {
                id: projectId,
                input: {
                    name: 'Updated Name',
                    description: 'Updated description'
                }
            });

            expect(result.data).toBeDefined();
            expect(result.data!.updateProject).toMatchObject({
                id: projectId,
                name: 'Updated Name',
                description: 'Updated description'
            });

            // Verify in database
            const prisma = helper.getPrisma();
            const project = await prisma.project.findUnique({
                where: { id: projectId }
            });
            expect(project!.name).toBe('Updated Name');
            expect(project!.description).toBe('Updated description');
        });

        it('should return error for non-existent project', async () => {
            const server = helper.getTestServer();

            const updateMutation = `
                mutation UpdateProject($id: ID!, $input: CreateProjectInput!) {
                    updateProject(id: $id, input: $input) {
                        id
                        name
                    }
                }
            `;

            const result = await server.executeMutation(updateMutation, {
                id: 'non-existent-id',
                input: {
                    name: 'Updated Name'
                }
            });

            expect(result.errors).toBeDefined();
        });
    });

    describe('deleteProject mutation', () => {
        it('should delete project', async () => {
            const server = helper.getTestServer();

            // Create a project first
            const createResult = await server.executeMutation(mutations.createProject, {
                input: {
                    name: 'Project to Delete'
                }
            });
            const projectId = createResult.data!.createProject.id;

            // Delete the project
            const deleteMutation = `
                mutation DeleteProject($id: ID!) {
                    deleteProject(id: $id)
                }
            `;

            const result = await server.executeMutation(deleteMutation, {
                id: projectId
            });

            expect(result.data).toBeDefined();
            expect(result.data!.deleteProject).toBe(true);

            // Verify deleted from database
            const prisma = helper.getPrisma();
            const project = await prisma.project.findUnique({
                where: { id: projectId }
            });
            expect(project).toBeNull();
        });

        it('should cascade delete related data', async () => {
            const server = helper.getTestServer();

            // Create project with scene
            const createResult = await server.executeMutation(mutations.createProject, {
                input: {
                    name: 'Project with Data'
                }
            });
            const projectId = createResult.data!.createProject.id;

            // Create a scene in the project
            await server.executeMutation(mutations.createScene, {
                input: {
                    projectId,
                    name: 'Test Scene',
                    fixtureValues: []
                }
            });

            const prisma = helper.getPrisma();

            // Verify scene exists
            const scenesBefore = await prisma.scene.findMany({
                where: { projectId }
            });
            expect(scenesBefore.length).toBe(1);

            // Delete the project
            const deleteMutation = `
                mutation DeleteProject($id: ID!) {
                    deleteProject(id: $id)
                }
            `;

            await server.executeMutation(deleteMutation, {
                id: projectId
            });

            // Verify scenes are also deleted (cascade)
            const scenesAfter = await prisma.scene.findMany({
                where: { projectId }
            });
            expect(scenesAfter.length).toBe(0);
        });

        it('should return error for non-existent project', async () => {
            const server = helper.getTestServer();

            const deleteMutation = `
                mutation DeleteProject($id: ID!) {
                    deleteProject(id: $id)
                }
            `;

            const result = await server.executeMutation(deleteMutation, {
                id: 'non-existent-id'
            });

            expect(result.errors).toBeDefined();
        });
    });
});
