import { Context } from "../../context";

/**
 * Relationship resolvers for finding where fixtures and scenes are used
 * and comparing scenes.
 */

/**
 * Helper function to parse channelValues from database
 * Handles both string (JSON) and array formats
 */
function parseChannelValues(
  channelValues: unknown,
): number[] {
  if (typeof channelValues === "string") {
    try {
      return JSON.parse(channelValues);
    } catch {
      return [];
    }
  }
  return channelValues as unknown as number[];
}

/**
 * Find where a fixture is used across scenes and cues
 */
async function fixtureUsage(
  _parent: unknown,
  args: { fixtureId: string },
  context: Context,
) {
  const { fixtureId } = args;
  const { prisma } = context;

  // Get the fixture to verify it exists and get its name
  const fixture = await prisma.fixtureInstance.findUnique({
    where: { id: fixtureId },
    select: { id: true, name: true },
  });

  if (!fixture) {
    throw new Error(`Fixture with id ${fixtureId} not found`);
  }

  // Find all scenes that use this fixture
  // Use JOIN to get scene info efficiently
  const fixtureValues = await prisma.fixtureValue.findMany({
    where: { fixtureId },
    select: {
      scene: {
        select: {
          id: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { fixtureValues: true },
          },
        },
      },
    },
    distinct: ["sceneId"],
  });

  // Build SceneSummary array
  const scenes = fixtureValues.map((fv) => ({
    id: fv.scene.id,
    name: fv.scene.name,
    description: fv.scene.description,
    fixtureCount: fv.scene._count.fixtureValues,
    createdAt: fv.scene.createdAt.toISOString(),
    updatedAt: fv.scene.updatedAt.toISOString(),
  }));

  // Get the scene IDs to find cues
  const sceneIds = scenes.map((s) => s.id);

  // Find all cues that reference these scenes
  // Use JOIN to get cue list info efficiently
  const cues =
    sceneIds.length > 0
      ? await prisma.cue.findMany({
          where: {
            sceneId: { in: sceneIds },
          },
          select: {
            id: true,
            name: true,
            cueNumber: true,
            cueList: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: [{ cueList: { name: "asc" } }, { cueNumber: "asc" }],
        })
      : [];

  // Build CueUsageSummary array
  const cueUsageSummaries = cues.map((cue) => ({
    cueId: cue.id,
    cueNumber: cue.cueNumber,
    cueName: cue.name,
    cueListId: cue.cueList.id,
    cueListName: cue.cueList.name,
  }));

  return {
    fixtureId: fixture.id,
    fixtureName: fixture.name,
    scenes,
    cues: cueUsageSummaries,
  };
}

/**
 * Find where a scene is used in cue lists
 */
async function sceneUsage(
  _parent: unknown,
  args: { sceneId: string },
  context: Context,
) {
  const { sceneId } = args;
  const { prisma } = context;

  // Get the scene to verify it exists and get its name
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    select: { id: true, name: true },
  });

  if (!scene) {
    throw new Error(`Scene with id ${sceneId} not found`);
  }

  // Find all cues that reference this scene
  // Use JOIN to get cue list info efficiently
  const cues = await prisma.cue.findMany({
    where: { sceneId },
    select: {
      id: true,
      name: true,
      cueNumber: true,
      cueList: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ cueList: { name: "asc" } }, { cueNumber: "asc" }],
  });

  // Build CueUsageSummary array
  const cueUsageSummaries = cues.map((cue) => ({
    cueId: cue.id,
    cueNumber: cue.cueNumber,
    cueName: cue.name,
    cueListId: cue.cueList.id,
    cueListName: cue.cueList.name,
  }));

  return {
    sceneId: scene.id,
    sceneName: scene.name,
    cues: cueUsageSummaries,
  };
}

/**
 * Compare two scenes to identify differences
 */
async function compareScenes(
  _parent: unknown,
  args: { sceneId1: string; sceneId2: string },
  context: Context,
) {
  const { sceneId1, sceneId2 } = args;
  const { prisma } = context;

  // Fetch both scenes with their fixture values
  const [scene1, scene2] = await Promise.all([
    prisma.scene.findUnique({
      where: { id: sceneId1 },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        fixtureValues: {
          select: {
            fixtureId: true,
            channelValues: true,
            fixture: {
              select: {
                name: true,
              },
            },
          },
        },
        _count: {
          select: { fixtureValues: true },
        },
      },
    }),
    prisma.scene.findUnique({
      where: { id: sceneId2 },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        fixtureValues: {
          select: {
            fixtureId: true,
            channelValues: true,
            fixture: {
              select: {
                name: true,
              },
            },
          },
        },
        _count: {
          select: { fixtureValues: true },
        },
      },
    }),
  ]);

  if (!scene1) {
    throw new Error(`Scene with id ${sceneId1} not found`);
  }

  if (!scene2) {
    throw new Error(`Scene with id ${sceneId2} not found`);
  }

  // Create maps for O(1) lookup
  const scene1Map = new Map(
    scene1.fixtureValues.map((fv) => [
      fv.fixtureId,
      {
        fixtureName: fv.fixture.name,
        channelValues: parseChannelValues(fv.channelValues),
      },
    ]),
  );

  const scene2Map = new Map(
    scene2.fixtureValues.map((fv) => [
      fv.fixtureId,
      {
        fixtureName: fv.fixture.name,
        channelValues: parseChannelValues(fv.channelValues),
      },
    ]),
  );

  // Build differences array
  const differences: Array<{
    fixtureId: string;
    fixtureName: string;
    scene1Values: number[];
    scene2Values: number[];
    differenceType: "VALUES_CHANGED" | "ONLY_IN_SCENE1" | "ONLY_IN_SCENE2";
  }> = [];

  let identicalCount = 0;
  let differentCount = 0;

  // Check fixtures in scene1
  for (const [fixtureId, scene1Data] of scene1Map.entries()) {
    const scene2Data = scene2Map.get(fixtureId);

    if (!scene2Data) {
      // Fixture only in scene1
      differences.push({
        fixtureId,
        fixtureName: scene1Data.fixtureName,
        scene1Values: scene1Data.channelValues,
        scene2Values: [],
        differenceType: "ONLY_IN_SCENE1",
      });
      differentCount++;
    } else {
      // Fixture in both scenes - compare values
      const valuesMatch = arraysEqual(
        scene1Data.channelValues,
        scene2Data.channelValues,
      );

      if (valuesMatch) {
        identicalCount++;
      } else {
        differences.push({
          fixtureId,
          fixtureName: scene1Data.fixtureName,
          scene1Values: scene1Data.channelValues,
          scene2Values: scene2Data.channelValues,
          differenceType: "VALUES_CHANGED",
        });
        differentCount++;
      }
    }
  }

  // Check for fixtures only in scene2
  for (const [fixtureId, scene2Data] of scene2Map.entries()) {
    if (!scene1Map.has(fixtureId)) {
      differences.push({
        fixtureId,
        fixtureName: scene2Data.fixtureName,
        scene1Values: [],
        scene2Values: scene2Data.channelValues,
        differenceType: "ONLY_IN_SCENE2",
      });
      differentCount++;
    }
  }

  // Build SceneSummary objects
  const scene1Summary = {
    id: scene1.id,
    name: scene1.name,
    description: scene1.description,
    fixtureCount: scene1._count.fixtureValues,
    createdAt: scene1.createdAt.toISOString(),
    updatedAt: scene1.updatedAt.toISOString(),
  };

  const scene2Summary = {
    id: scene2.id,
    name: scene2.name,
    description: scene2.description,
    fixtureCount: scene2._count.fixtureValues,
    createdAt: scene2.createdAt.toISOString(),
    updatedAt: scene2.updatedAt.toISOString(),
  };

  return {
    scene1: scene1Summary,
    scene2: scene2Summary,
    differences,
    identicalFixtureCount: identicalCount,
    differentFixtureCount: differentCount,
  };
}

/**
 * Helper function to compare two arrays for equality
 */
function arraysEqual(arr1: number[], arr2: number[]): boolean {
  if (arr1.length !== arr2.length) {
    return false;
  }

  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) {
      return false;
    }
  }

  return true;
}

export const relationshipResolvers = {
  Query: {
    fixtureUsage,
    sceneUsage,
    compareScenes,
  },
};
