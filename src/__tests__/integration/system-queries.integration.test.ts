import { IntegrationTestHelper, mutations } from '../../test/graphql-integration-test-helper';

describe('System Queries Integration Tests', () => {
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

    describe('systemInfo query', () => {
        it('should return system information', async () => {
            const server = helper.getTestServer();

            const query = `
                query GetSystemInfo {
                    systemInfo {
                        artnetEnabled
                        artnetBroadcastAddress
                    }
                }
            `;

            const result = await server.executeQuery(query);

            // Check for errors first
            if (result.errors) {
                console.error('GraphQL errors:', result.errors);
            }

            expect(result.errors).toBeUndefined();
            expect(result.data).toBeDefined();
            expect(result.data!.systemInfo).toBeDefined();
            expect(result.data!.systemInfo).toHaveProperty('artnetEnabled');
            expect(result.data!.systemInfo).toHaveProperty('artnetBroadcastAddress');
        });
    });

    describe('settings queries', () => {
        it('should return all settings', async () => {
            const server = helper.getTestServer();

            const query = `
                query GetSettings {
                    settings {
                        key
                        value
                    }
                }
            `;

            const result = await server.executeQuery(query);

            expect(result.data).toBeDefined();
            expect(result.data!.settings).toBeDefined();
            expect(Array.isArray(result.data!.settings)).toBe(true);
        });

        it('should return specific setting by key', async () => {
            const server = helper.getTestServer();

            const query = `
                query GetSetting($key: String!) {
                    setting(key: $key) {
                        key
                        value
                    }
                }
            `;

            const result = await server.executeQuery(query, {
                key: 'artnet_broadcast_address'
            });

            expect(result.data).toBeDefined();
            // Setting might not exist, so it could be null
            if (result.data!.setting) {
                expect(result.data!.setting.key).toBe('artnet_broadcast_address');
                expect(result.data!.setting).toHaveProperty('value');
            }
        });
    });

    describe('previewSession query', () => {
        it('should return null for non-existent preview session', async () => {
            const server = helper.getTestServer();

            const query = `
                query GetPreviewSession($sessionId: ID!) {
                    previewSession(sessionId: $sessionId) {
                        id
                        isActive
                    }
                }
            `;

            const result = await server.executeQuery(query, {
                sessionId: 'non-existent-id'
            });

            expect(result.data).toBeDefined();
            expect(result.data!.previewSession).toBeNull();
        });

        it('should return preview session details', async () => {
            const server = helper.getTestServer();

            // Create project and start preview session
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            const sessionResult = await server.executeMutation(mutations.startPreviewSession, {
                projectId
            });
            const sessionId = sessionResult.data!.startPreviewSession.id;

            const query = `
                query GetPreviewSession($sessionId: ID!) {
                    previewSession(sessionId: $sessionId) {
                        id
                        isActive
                        project {
                            id
                            name
                        }
                    }
                }
            `;

            const result = await server.executeQuery(query, {
                sessionId
            });

            expect(result.data).toBeDefined();
            expect(result.data!.previewSession).toBeDefined();
            expect(result.data!.previewSession.id).toBe(sessionId);
            expect(result.data!.previewSession.isActive).toBe(true);
            expect(result.data!.previewSession.project.id).toBe(projectId);
        });
    });
});
