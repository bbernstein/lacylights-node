#!/usr/bin/env tsx

/**
 * Script to preview the three lighting scenes created by create-lighting-scenes.ts
 * Each scene is held for 3 seconds, then cycles to the next one.
 * The full sequence loops 3 times total.
 */

const GRAPHQL_URL = "http://localhost:4000/graphql";

interface GraphQLResponse<T = any> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{
      line: number;
      column: number;
    }>;
    path?: string[];
  }>;
}

interface Project {
  id: string;
  name: string;
  scenes: Scene[];
}

interface Scene {
  id: string;
  name: string;
  description?: string;
}

async function graphqlRequest<T = any>(
  query: string,
  variables?: any,
): Promise<GraphQLResponse<T>> {
  try {
    const response = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("GraphQL request failed:", error);
    throw error;
  }
}

async function findScenesInProject(): Promise<Scene[]> {
  console.log("🔍 Finding scenes in SlimPAR Test Project...");

  const query = `
    query GetProjects {
      projects {
        id
        name
        scenes {
          id
          name
          description
        }
      }
    }
  `;

  const response = await graphqlRequest<{ projects: Project[] }>(query);

  if (response.errors) {
    throw new Error(
      `Failed to get projects: ${response.errors.map((e) => e.message).join(", ")}`,
    );
  }

  const projects = response.data!.projects;
  const slimParProject = projects.find((p) => p.name.includes("SlimPAR"));

  if (!slimParProject) {
    throw new Error(
      "SlimPAR Test Project not found. Please run the create-lighting-scenes script first.",
    );
  }

  const scenes = slimParProject.scenes;
  if (scenes.length === 0) {
    throw new Error(
      "No scenes found in SlimPAR project. Please run the create-lighting-scenes script first.",
    );
  }

  // Sort scenes by name to ensure consistent order
  const sortedScenes = scenes.sort((a, b) => a.name.localeCompare(b.name));

  console.log(
    `✅ Found ${scenes.length} scenes in project: ${slimParProject.name}`,
  );
  scenes.forEach((scene, index) => {
    console.log(`   ${index + 1}. ${scene.name}: ${scene.description}`);
  });

  return sortedScenes;
}

async function setSceneLive(sceneId: string): Promise<boolean> {
  const query = `
    mutation SetSceneLive($sceneId: ID!) {
      setSceneLive(sceneId: $sceneId)
    }
  `;

  const response = await graphqlRequest<{ setSceneLive: boolean }>(query, {
    sceneId,
  });

  if (response.errors) {
    throw new Error(
      `Failed to set scene live: ${response.errors.map((e) => e.message).join(", ")}`,
    );
  }

  return response.data!.setSceneLive;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function previewScene(scene: Scene, holdTime: number): Promise<void> {
  console.log(`🎭 Activating scene: ${scene.name}`);
  console.log(`   Description: ${scene.description}`);

  try {
    await setSceneLive(scene.id);
    console.log(`   ✅ Scene activated - DMX output live`);

    // Hold the scene for the specified time
    console.log(`   ⏱️  Holding for ${holdTime / 1000} seconds...`);
    await sleep(holdTime);
  } catch (error) {
    console.error(`   ❌ Failed to activate scene: ${error}`);
    throw error;
  }
}

async function runPreviewSequence(
  scenes: Scene[],
  holdTime: number,
  loops: number,
): Promise<void> {
  console.log(`\n🎬 Starting scene preview sequence:`);
  console.log(`   - ${scenes.length} scenes`);
  console.log(`   - ${holdTime / 1000} seconds per scene`);
  console.log(`   - ${loops} loops total`);
  console.log(
    `   - Total duration: ${(scenes.length * holdTime * loops) / 1000} seconds\n`,
  );

  for (let loop = 1; loop <= loops; loop++) {
    console.log(`🔄 Loop ${loop} of ${loops}`);
    console.log("─".repeat(50));

    for (const scene of scenes) {
      await previewScene(scene, holdTime);
    }

    if (loop < loops) {
      console.log(`\n   ✅ Loop ${loop} completed\n`);
    }
  }
}

async function main() {
  try {
    console.log("🚀 Starting scene preview script\n");

    // Configuration
    const HOLD_TIME_MS = 1000; // 3 seconds per scene
    const TOTAL_LOOPS = 3; // Loop 3 times

    // Step 1: Find the scenes to preview
    const scenes = await findScenesInProject();
    console.log("");

    // Step 2: Run the preview sequence
    await runPreviewSequence(scenes, HOLD_TIME_MS, TOTAL_LOOPS);

    console.log("\n🎆 Scene preview completed successfully!");
    console.log(`\n📊 Summary:`);
    console.log(`   - Previewed ${scenes.length} scenes`);
    console.log(`   - ${TOTAL_LOOPS} complete loops`);
    console.log(`   - ${scenes.length * TOTAL_LOOPS} total scene activations`);
    console.log(`   - DMX output was live for each scene`);
  } catch (error) {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  }
}

// Check if this script is being run directly
if (require.main === module) {
  main();
}

export { main as previewScenes };
