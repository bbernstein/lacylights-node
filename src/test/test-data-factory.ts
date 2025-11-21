import { PrismaClient } from '@prisma/client';

/**
 * Test data factory for creating fixtures, scenes, cue lists, and other entities
 * with predictable IDs and data for integration tests.
 */
export class TestDataFactory {
    constructor(private prisma: PrismaClient) { }

    /**
     * Create a test project
     */
    async createTestProject(overrides: {
        name?: string;
        description?: string;
    } = {}) {
        return this.prisma.project.create({
            data: {
                name: overrides.name || `Test Project ${Date.now()}`,
                description: overrides.description || 'Test project for integration tests',
            },
        });
    }

    /**
     * Create a simple test fixture definition (simpler approach)
     */
    async createSimpleFixtureDefinition(overrides: {
        manufacturer?: string;
        model?: string;
        type?: 'LED_PAR' | 'MOVING_HEAD' | 'DIMMER' | 'STROBE' | 'OTHER';
        channelCount?: number;
    } = {}) {
        const channelCount = overrides.channelCount || 3;
        const manufacturer = overrides.manufacturer || 'Test Manufacturer';
        const model = overrides.model || `Model-${Date.now()}`;
        const type = overrides.type || 'LED_PAR';

        // Create definition first
        const definition = await this.prisma.fixtureDefinition.create({
            data: {
                manufacturer,
                model,
                type,
                isBuiltIn: false,
            },
        });

        // Create channels
        const channelTypes = ['RED', 'GREEN', 'BLUE', 'INTENSITY', 'WHITE', 'AMBER'];
        const channels = [];
        for (let i = 0; i < channelCount; i++) {
            const channel = await this.prisma.channelDefinition.create({
                data: {
                    definitionId: definition.id,
                    name: channelTypes[i % channelTypes.length],
                    type: channelTypes[i % channelTypes.length] as 'RED' | 'GREEN' | 'BLUE' | 'INTENSITY' | 'WHITE' | 'AMBER',
                    offset: i,
                    defaultValue: 0,
                    minValue: 0,
                    maxValue: 255,
                },
            });
            channels.push(channel);
        }

        // Create a mode
        const mode = await this.prisma.fixtureMode.create({
            data: {
                definitionId: definition.id,
                name: 'Standard',
                shortName: 'STD',
                channelCount: channelCount,
            },
        });

        // Link channels to mode
        for (const channel of channels) {
            await this.prisma.modeChannel.create({
                data: {
                    modeId: mode.id,
                    channelId: channel.id,
                    offset: channel.offset,
                },
            });
        }

        return this.prisma.fixtureDefinition.findUnique({
            where: { id: definition.id },
            include: {
                channels: true,
                modes: true,
            },
        });
    }

    /**
     * Create a test fixture instance
     */
    async createTestFixtureInstance(
        projectId: string,
        definitionId: string,
        modeId: string, // Kept for API compatibility but not used
        overrides: {
            name?: string;
            universe?: number;
            startChannel?: number;
            channelCount?: number;
        } = {}
    ) {
        return this.prisma.fixtureInstance.create({
            data: {
                projectId,
                definitionId,
                name: overrides.name || `Fixture ${Date.now()}`,
                universe: overrides.universe || 1,
                startChannel: overrides.startChannel || 1,
                channelCount: overrides.channelCount || 3,
                tags: '', // SQLite stores tags as text
            },
        });
    }

    /**
     * Create a test scene with fixture values
     */
    async createTestScene(
        projectId: string,
        fixtureValues: Array<{
            fixtureId: string;
            channelValues: number[];
        }>,
        overrides: {
            name?: string;
            description?: string;
        } = {}
    ) {
        const scene = await this.prisma.scene.create({
            data: {
                projectId,
                name: overrides.name || `Scene ${Date.now()}`,
                description: overrides.description || 'Test scene',
            },
        });

        // Create fixture values
        for (const fv of fixtureValues) {
            await this.prisma.fixtureValue.create({
                data: {
                    sceneId: scene.id,
                    fixtureId: fv.fixtureId,
                    channelValues: JSON.stringify(fv.channelValues),
                },
            });
        }

        return this.prisma.scene.findUnique({
            where: { id: scene.id },
            include: {
                fixtureValues: {
                    include: {
                        fixture: true,
                    },
                },
            },
        });
    }

    /**
     * Create a test cue list with cues
     */
    async createTestCueList(
        projectId: string,
        cues: Array<{
            sceneId: string;
            cueNumber: number;
            fadeInTime: number;
            fadeOutTime: number;
            name?: string;
        }>,
        overrides: {
            name?: string;
            description?: string;
            loop?: boolean;
        } = {}
    ) {
        const cueList = await this.prisma.cueList.create({
            data: {
                projectId,
                name: overrides.name || `CueList ${Date.now()}`,
                description: overrides.description || 'Test cue list',
                loop: overrides.loop || false,
            },
        });

        // Create cues
        for (const cueData of cues) {
            await this.prisma.cue.create({
                data: {
                    cueListId: cueList.id,
                    sceneId: cueData.sceneId,
                    cueNumber: cueData.cueNumber,
                    fadeInTime: cueData.fadeInTime,
                    fadeOutTime: cueData.fadeOutTime,
                    name: cueData.name || `Cue ${cueData.cueNumber}`,
                },
            });
        }

        return this.prisma.cueList.findUnique({
            where: { id: cueList.id },
            include: {
                cues: {
                    orderBy: { cueNumber: 'asc' },
                    include: {
                        scene: true,
                    },
                },
            },
        });
    }

    /**
     * Create a complete test setup with project, fixtures, and scenes
     */
    async createCompleteTestSetup() {
        // Create project
        const project = await this.createTestProject({
            name: 'Integration Test Project',
        });

        // Create fixture definition
        const definition = await this.createSimpleFixtureDefinition({
            manufacturer: 'Test',
            model: 'RGB Par',
            type: 'LED_PAR',
            channelCount: 3,
        });

        if (!definition) {
            throw new Error('Failed to create fixture definition');
        }

        const mode = definition.modes![0];

        // Create 3 fixture instances
        const fixture1 = await this.createTestFixtureInstance(
            project.id,
            definition.id,
            mode.id,
            {
                name: 'Fixture 1',
                universe: 1,
                startChannel: 1,
                channelCount: 3,
            }
        );

        const fixture2 = await this.createTestFixtureInstance(
            project.id,
            definition.id,
            mode.id,
            {
                name: 'Fixture 2',
                universe: 1,
                startChannel: 4,
                channelCount: 3,
            }
        );

        const fixture3 = await this.createTestFixtureInstance(
            project.id,
            definition.id,
            mode.id,
            {
                name: 'Fixture 3',
                universe: 1,
                startChannel: 7,
                channelCount: 3,
            }
        );

        // Create scenes
        const scene1 = await this.createTestScene(
            project.id,
            [
                { fixtureId: fixture1.id, channelValues: [255, 0, 0] }, // Red
                { fixtureId: fixture2.id, channelValues: [0, 255, 0] }, // Green
                { fixtureId: fixture3.id, channelValues: [0, 0, 255] }, // Blue
            ],
            { name: 'Scene 1 - RGB' }
        );

        const scene2 = await this.createTestScene(
            project.id,
            [
                { fixtureId: fixture1.id, channelValues: [255, 255, 255] }, // White
                { fixtureId: fixture2.id, channelValues: [128, 128, 128] }, // Gray
                { fixtureId: fixture3.id, channelValues: [0, 0, 0] }, // Black
            ],
            { name: 'Scene 2 - White/Gray/Black' }
        );

        return {
            project,
            definition,
            mode,
            fixtures: [fixture1, fixture2, fixture3],
            scenes: [scene1!, scene2!],
        };
    }

    /**
     * Clean up: delete a project and all related data
     */
    async deleteProject(projectId: string) {
        // Prisma cascades should handle this, but we can be explicit
        await this.prisma.project.delete({
            where: { id: projectId },
        });
    }

    /**
     * Clean up all test data (use with caution!)
     */
    async cleanupAllTestData() {
        // Delete in correct order to respect foreign key constraints
        await this.prisma.fixtureValue.deleteMany({});
        await this.prisma.cue.deleteMany({});
        await this.prisma.cueList.deleteMany({});
        await this.prisma.scene.deleteMany({});
        await this.prisma.fixtureInstance.deleteMany({});
        await this.prisma.modeChannel.deleteMany({});
        await this.prisma.fixtureMode.deleteMany({});
        await this.prisma.channelDefinition.deleteMany({});
        await this.prisma.fixtureDefinition.deleteMany({ where: { isBuiltIn: false } });
        await this.prisma.project.deleteMany({});
    }
}
