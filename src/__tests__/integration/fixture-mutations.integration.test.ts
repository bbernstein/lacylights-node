import { IntegrationTestHelper, mutations } from '../../test/graphql-integration-test-helper';

describe('Fixture Mutations Integration Tests', () => {
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

    describe('createFixtureInstance mutation', () => {
        it('should create fixture instance', async () => {
            const server = helper.getTestServer();

            // Create project and fixture definition
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            const definition = await server.dataFactory.createSimpleFixtureDefinition({
                manufacturer: 'Test',
                model: 'RGB Par',
                type: 'LED_PAR',
                channelCount: 3
            });

            const createMutation = `
                mutation CreateFixtureInstance($input: CreateFixtureInstanceInput!) {
                    createFixtureInstance(input: $input) {
                        id
                        name
                        universe
                        startChannel
                        channelCount
                    }
                }
            `;

            const result = await server.executeMutation(createMutation, {
                input: {
                    projectId,
                    definitionId: definition!.id,
                    name: 'Test Fixture',
                    universe: 1,
                    startChannel: 1
                }
            });

            expect(result.data).toBeDefined();
            expect(result.data!.createFixtureInstance).toMatchObject({
                name: 'Test Fixture',
                universe: 1,
                startChannel: 1,
                channelCount: 3
            });

            // Verify in database
            const prisma = helper.getPrisma();
            const fixture = await prisma.fixtureInstance.findUnique({
                where: { id: result.data!.createFixtureInstance.id }
            });
            expect(fixture).toBeDefined();
            expect(fixture!.name).toBe('Test Fixture');
        });
    });

    describe('updateFixtureInstance mutation', () => {
        it('should update fixture properties', async () => {
            const server = helper.getTestServer();

            // Create project, definition, and fixture
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            const definition = await server.dataFactory.createSimpleFixtureDefinition();
            const fixture = await server.dataFactory.createTestFixtureInstance(
                projectId,
                definition!.id,
                definition!.modes![0].id,
                { name: 'Original Name', universe: 1, startChannel: 1 }
            );

            const updateMutation = `
                mutation UpdateFixtureInstance($id: ID!, $input: UpdateFixtureInstanceInput!) {
                    updateFixtureInstance(id: $id, input: $input) {
                        id
                        name
                        universe
                        startChannel
                    }
                }
            `;

            const result = await server.executeMutation(updateMutation, {
                id: fixture.id,
                input: {
                    name: 'Updated Name',
                    universe: 2,
                    startChannel: 10
                }
            });

            expect(result.data).toBeDefined();
            expect(result.data!.updateFixtureInstance).toMatchObject({
                id: fixture.id,
                name: 'Updated Name',
                universe: 2,
                startChannel: 10
            });

            // Verify in database
            const prisma = helper.getPrisma();
            const updated = await prisma.fixtureInstance.findUnique({
                where: { id: fixture.id }
            });
            expect(updated!.name).toBe('Updated Name');
            expect(updated!.universe).toBe(2);
        });
    });

    describe('deleteFixtureInstance mutation', () => {
        it('should delete fixture', async () => {
            const server = helper.getTestServer();

            // Create project, definition, and fixture
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            const definition = await server.dataFactory.createSimpleFixtureDefinition();
            const fixture = await server.dataFactory.createTestFixtureInstance(
                projectId,
                definition!.id,
                definition!.modes![0].id
            );

            const deleteMutation = `
                mutation DeleteFixtureInstance($id: ID!) {
                    deleteFixtureInstance(id: $id)
                }
            `;

            const result = await server.executeMutation(deleteMutation, {
                id: fixture.id
            });

            expect(result.data).toBeDefined();
            expect(result.data!.deleteFixtureInstance).toBe(true);

            // Verify deleted from database
            const prisma = helper.getPrisma();
            const deleted = await prisma.fixtureInstance.findUnique({
                where: { id: fixture.id }
            });
            expect(deleted).toBeNull();
        });
    });

    describe('bulkCreateFixtures mutation', () => {
        it('should create multiple fixtures', async () => {
            const server = helper.getTestServer();

            // Create project and definition
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            const definition = await server.dataFactory.createSimpleFixtureDefinition();

            const bulkCreateMutation = `
                mutation BulkCreateFixtures($input: BulkFixtureCreateInput!) {
                    bulkCreateFixtures(input: $input) {
                        id
                        name
                        universe
                        startChannel
                    }
                }
            `;

            const result = await server.executeMutation(bulkCreateMutation, {
                input: {
                    fixtures: [
                        {
                            projectId,
                            definitionId: definition!.id,
                            name: 'Fixture 1',
                            universe: 1,
                            startChannel: 1
                        },
                        {
                            projectId,
                            definitionId: definition!.id,
                            name: 'Fixture 2',
                            universe: 1,
                            startChannel: 10
                        },
                        {
                            projectId,
                            definitionId: definition!.id,
                            name: 'Fixture 3',
                            universe: 1,
                            startChannel: 20
                        }
                    ]
                }
            });

            expect(result.data).toBeDefined();
            expect(result.data!.bulkCreateFixtures.length).toBe(3);
            expect(result.data!.bulkCreateFixtures[0].name).toBe('Fixture 1');
            expect(result.data!.bulkCreateFixtures[1].name).toBe('Fixture 2');
            expect(result.data!.bulkCreateFixtures[2].name).toBe('Fixture 3');

            // Verify in database
            const prisma = helper.getPrisma();
            const fixtures = await prisma.fixtureInstance.findMany({
                where: { projectId }
            });
            expect(fixtures.length).toBe(3);
        });
    });
});
