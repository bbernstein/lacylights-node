import { IntegrationTestHelper, mutations } from '../../test/graphql-integration-test-helper';

describe('Cue Mutations Integration Tests', () => {
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

    describe('createCueList mutation', () => {
        it('should create cue list', async () => {
            const server = helper.getTestServer();

            // Create project
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            const createMutation = `
                mutation CreateCueList($input: CreateCueListInput!) {
                    createCueList(input: $input) {
                        id
                        name
                        description
                        loop
                    }
                }
            `;

            const result = await server.executeMutation(createMutation, {
                input: {
                    projectId,
                    name: 'Test Cue List',
                    description: 'Test description',
                    loop: false
                }
            });

            expect(result.data).toBeDefined();
            expect(result.data!.createCueList).toMatchObject({
                name: 'Test Cue List',
                description: 'Test description',
                loop: false
            });

            // Verify in database
            const prisma = helper.getPrisma();
            const cueList = await prisma.cueList.findUnique({
                where: { id: result.data!.createCueList.id }
            });
            expect(cueList).toBeDefined();
            expect(cueList!.name).toBe('Test Cue List');
        });
    });

    describe('updateCueList mutation', () => {
        it('should update cue list properties', async () => {
            const server = helper.getTestServer();

            // Create project and cue list
            const projectResult = await server.executeMutation(mutations.createProject, {
                input: { name: 'Test Project' }
            });
            const projectId = projectResult.data!.createProject.id;

            const cueList = await server.dataFactory.createTestCueList(projectId, [], {
                name: 'Original Name',
                description: 'Original description'
            });

            const updateMutation = `
                mutation UpdateCueList($id: ID!, $input: CreateCueListInput!) {
                    updateCueList(id: $id, input: $input) {
                        id
                        name
                        description
                        loop
                    }
                }
            `;

            const result = await server.executeMutation(updateMutation, {
                id: cueList!.id,
                input: {
                    projectId,
                    name: 'Updated Name',
                    description: 'Updated description',
                    loop: true
                }
            });

            expect(result.data).toBeDefined();
            expect(result.data!.updateCueList).toMatchObject({
                name: 'Updated Name',
                description: 'Updated description',
                loop: true
            });

            // Verify in database
            const prisma = helper.getPrisma();
            const updated = await prisma.cueList.findUnique({
                where: { id: cueList!.id }
            });
            expect(updated!.name).toBe('Updated Name');
            expect(updated!.loop).toBe(true);
        });
    });

    describe('deleteCueList mutation', () => {
        it('should delete cue list and cascade delete cues', async () => {
            const server = helper.getTestServer();

            // Create project, scene, and cue list with cues
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
                    fadeOutTime: 3,
                    name: 'Cue 1'
                }
            ]);

            const prisma = helper.getPrisma();

            // Verify cue exists
            const cuesBefore = await prisma.cue.findMany({
                where: { cueListId: cueList!.id }
            });
            expect(cuesBefore.length).toBe(1);

            // Delete cue list
            const deleteMutation = `
                mutation DeleteCueList($id: ID!) {
                    deleteCueList(id: $id)
                }
            `;

            const result = await server.executeMutation(deleteMutation, {
                id: cueList!.id
            });

            expect(result.data).toBeDefined();
            expect(result.data!.deleteCueList).toBe(true);

            // Verify cue list deleted
            const deleted = await prisma.cueList.findUnique({
                where: { id: cueList!.id }
            });
            expect(deleted).toBeNull();

            // Verify cues also deleted (cascade)
            const cuesAfter = await prisma.cue.findMany({
                where: { cueListId: cueList!.id }
            });
            expect(cuesAfter.length).toBe(0);
        });
    });

    describe('createCue mutation', () => {
        it('should create cue in cue list', async () => {
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

            const cueList = await server.dataFactory.createTestCueList(projectId, []);

            const createMutation = `
                mutation CreateCue($input: CreateCueInput!) {
                    createCue(input: $input) {
                        id
                        name
                        cueNumber
                        fadeInTime
                        fadeOutTime
                    }
                }
            `;

            const result = await server.executeMutation(createMutation, {
                input: {
                    cueListId: cueList!.id,
                    sceneId,
                    name: 'Test Cue',
                    cueNumber: 1.0,
                    fadeInTime: 3.0,
                    fadeOutTime: 3.0
                }
            });

            expect(result.data).toBeDefined();
            expect(result.data!.createCue).toMatchObject({
                name: 'Test Cue',
                cueNumber: 1.0,
                fadeInTime: 3.0,
                fadeOutTime: 3.0
            });

            // Verify in database
            const prisma = helper.getPrisma();
            const cue = await prisma.cue.findUnique({
                where: { id: result.data!.createCue.id }
            });
            expect(cue).toBeDefined();
            expect(cue!.name).toBe('Test Cue');
        });
    });

    describe('updateCue mutation', () => {
        it('should update cue properties', async () => {
            const server = helper.getTestServer();

            // Create project, scene, and cue list with cue
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
                    fadeOutTime: 3,
                    name: 'Original Cue'
                }
            ]);

            const cueId = cueList!.cues![0].id;

            const updateMutation = `
                mutation UpdateCue($id: ID!, $input: CreateCueInput!) {
                    updateCue(id: $id, input: $input) {
                        id
                        name
                        fadeInTime
                        fadeOutTime
                    }
                }
            `;

            const result = await server.executeMutation(updateMutation, {
                id: cueId,
                input: {
                    cueListId: cueList!.id,
                    sceneId,
                    name: 'Updated Cue',
                    cueNumber: 1.0,
                    fadeInTime: 5.0,
                    fadeOutTime: 5.0
                }
            });

            expect(result.data).toBeDefined();
            expect(result.data!.updateCue).toMatchObject({
                name: 'Updated Cue',
                fadeInTime: 5.0,
                fadeOutTime: 5.0
            });

            // Verify in database
            const prisma = helper.getPrisma();
            const updated = await prisma.cue.findUnique({
                where: { id: cueId }
            });
            expect(updated!.name).toBe('Updated Cue');
            expect(updated!.fadeInTime).toBe(5.0);
        });
    });

    describe('deleteCue mutation', () => {
        it('should delete cue', async () => {
            const server = helper.getTestServer();

            // Create project, scene, and cue list with cue
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

            const cueId = cueList!.cues![0].id;

            const deleteMutation = `
                mutation DeleteCue($id: ID!) {
                    deleteCue(id: $id)
                }
            `;

            const result = await server.executeMutation(deleteMutation, {
                id: cueId
            });

            expect(result.data).toBeDefined();
            expect(result.data!.deleteCue).toBe(true);

            // Verify deleted from database
            const prisma = helper.getPrisma();
            const deleted = await prisma.cue.findUnique({
                where: { id: cueId }
            });
            expect(deleted).toBeNull();
        });
    });
});
