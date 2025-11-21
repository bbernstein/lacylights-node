import { IntegrationTestHelper } from '../../test/graphql-integration-test-helper';

describe('Fixture Queries Integration Tests', () => {
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

    describe('fixtureDefinitions query', () => {
        it('should return empty array when no fixture definitions exist', async () => {
            const server = helper.getTestServer();

            const query = `
                query GetFixtureDefinitions {
                    fixtureDefinitions {
                        id
                        manufacturer
                        model
                        type
                        isBuiltIn
                    }
                }
            `;

            const result = await server.executeQuery(query);

            expect(result.data).toBeDefined();
            expect(result.data!.fixtureDefinitions).toBeDefined();
            expect(Array.isArray(result.data!.fixtureDefinitions)).toBe(true);
            // Database is clean, so should be empty
            expect(result.data!.fixtureDefinitions.length).toBe(0);
        });

        it('should filter by manufacturer', async () => {
            const server = helper.getTestServer();

            const query = `
                query GetFixtureDefinitions($filter: FixtureDefinitionFilter) {
                    fixtureDefinitions(filter: $filter) {
                        id
                        manufacturer
                        model
                    }
                }
            `;

            const result = await server.executeQuery(query, {
                filter: { manufacturer: 'Chauvet' }
            });

            expect(result.data).toBeDefined();
            expect(result.data!.fixtureDefinitions).toBeDefined();
            // All results should be from Chauvet
            result.data!.fixtureDefinitions.forEach((fixture: any) => {
                expect(fixture.manufacturer).toBe('Chauvet');
            });
        });

        it('should filter by type', async () => {
            const server = helper.getTestServer();

            const query = `
                query GetFixtureDefinitions($filter: FixtureDefinitionFilter) {
                    fixtureDefinitions(filter: $filter) {
                        id
                        type
                    }
                }
            `;

            const result = await server.executeQuery(query, {
                filter: { type: 'LED_PAR' }
            });

            expect(result.data).toBeDefined();
            expect(result.data!.fixtureDefinitions).toBeDefined();
            // All results should be LED_PAR type
            result.data!.fixtureDefinitions.forEach((fixture: any) => {
                expect(fixture.type).toBe('LED_PAR');
            });
        });

        it('should filter by isBuiltIn', async () => {
            const server = helper.getTestServer();

            const query = `
                query GetFixtureDefinitions($filter: FixtureDefinitionFilter) {
                    fixtureDefinitions(filter: $filter) {
                        id
                        isBuiltIn
                    }
                }
            `;

            const result = await server.executeQuery(query, {
                filter: { isBuiltIn: true }
            });

            expect(result.data).toBeDefined();
            expect(result.data!.fixtureDefinitions).toBeDefined();
            // All results should be built-in
            result.data!.fixtureDefinitions.forEach((fixture: any) => {
                expect(fixture.isBuiltIn).toBe(true);
            });
        });
    });

    describe('fixtureDefinition query', () => {
        it('should return null for non-existent definition', async () => {
            const server = helper.getTestServer();

            const query = `
                query GetFixtureDefinition($id: ID!) {
                    fixtureDefinition(id: $id) {
                        id
                    }
                }
            `;

            const result = await server.executeQuery(query, {
                id: 'non-existent-id'
            });

            expect(result.data).toBeDefined();
            expect(result.data!.fixtureDefinition).toBeNull();
        });

        it('should return definition with channels and modes', async () => {
            const server = helper.getTestServer();

            // Create a fixture definition via data factory
            const definition = await server.dataFactory.createSimpleFixtureDefinition({
                manufacturer: 'Test Manufacturer',
                model: 'Test Model',
                type: 'LED_PAR',
                channelCount: 3
            });

            const query = `
                query GetFixtureDefinition($id: ID!) {
                    fixtureDefinition(id: $id) {
                        id
                        manufacturer
                        model
                        type
                        channels {
                            id
                            name
                            type
                            offset
                        }
                        modes {
                            id
                            name
                            channelCount
                        }
                    }
                }
            `;

            const result = await server.executeQuery(query, {
                id: definition!.id
            });

            expect(result.data).toBeDefined();
            expect(result.data!.fixtureDefinition).toBeDefined();
            expect(result.data!.fixtureDefinition.manufacturer).toBe('Test Manufacturer');
            expect(result.data!.fixtureDefinition.channels).toBeDefined();
            expect(result.data!.fixtureDefinition.modes).toBeDefined();
            expect(Array.isArray(result.data!.fixtureDefinition.channels)).toBe(true);
            expect(Array.isArray(result.data!.fixtureDefinition.modes)).toBe(true);
            expect(result.data!.fixtureDefinition.channels.length).toBe(3);
            expect(result.data!.fixtureDefinition.modes.length).toBeGreaterThan(0);
        });
    });

    describe('dmxOutput queries', () => {
        it('should return DMX output for specific universe', async () => {
            const server = helper.getTestServer();

            const query = `
                query GetDmxOutput($universe: Int!) {
                    dmxOutput(universe: $universe)
                }
            `;

            const result = await server.executeQuery(query, {
                universe: 1
            });

            expect(result.data).toBeDefined();
            expect(result.data!.dmxOutput).toBeDefined();
            expect(Array.isArray(result.data!.dmxOutput)).toBe(true);
            expect(result.data!.dmxOutput.length).toBe(512); // DMX universe has 512 channels
        });

        it('should return all DMX outputs', async () => {
            const server = helper.getTestServer();

            const query = `
                query GetAllDmxOutput {
                    allDmxOutput {
                        universe
                        channels
                    }
                }
            `;

            const result = await server.executeQuery(query);

            expect(result.data).toBeDefined();
            expect(result.data!.allDmxOutput).toBeDefined();
            expect(Array.isArray(result.data!.allDmxOutput)).toBe(true);
            expect(result.data!.allDmxOutput.length).toBeGreaterThan(0);

            // Verify structure
            const universeOutput = result.data!.allDmxOutput[0];
            expect(universeOutput).toHaveProperty('universe');
            expect(universeOutput).toHaveProperty('channels');
            expect(Array.isArray(universeOutput.channels)).toBe(true);
            expect(universeOutput.channels.length).toBe(512);
        });
    });
});
