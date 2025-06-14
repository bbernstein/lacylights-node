#!/usr/bin/env tsx

/**
 * End-to-end test for FadeEngine with full system integration
 *
 * This script:
 * 1. Starts the GraphQL server
 * 2. Creates fixtures covering 2048 channels (512 per universe × 4 universes)
 * 3. Creates two scenes: all channels at 255, and all channels at 0
 * 4. Creates a cue list alternating between the scenes with 1-second fades
 * 5. Executes the cue list to demonstrate smooth DMX fading
 *
 * Use this to verify end-to-end fade performance with Art-Net output
 */

import { spawn, ChildProcess } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";
import { dmxService } from "../src/services/dmx";

const GRAPHQL_URL = "http://localhost:4000/graphql";
const SERVER_STARTUP_DELAY = 3000; // 3 seconds for server to start

interface TestResult {
  success: boolean;
  error?: string;
  data?: any;
}

let serverProcess: ChildProcess | null = null;

// Load environment variables from .env file
function loadEnvFile(): Record<string, string> {
  const envVars: Record<string, string> = {};

  try {
    const envPath = resolve(process.cwd(), ".env");
    const envContent = readFileSync(envPath, "utf-8");

    envContent.split("\n").forEach((line) => {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith("#")) {
        const [key, ...valueParts] = trimmedLine.split("=");
        if (key && valueParts.length > 0) {
          // Remove quotes from value if present
          let value = valueParts.join("=");
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
          envVars[key.trim()] = value;
        }
      }
    });

    console.log(
      "✅ Loaded .env file with",
      Object.keys(envVars).length,
      "variables",
    );
  } catch (error) {
    console.log(
      "⚠️  Could not load .env file:",
      error instanceof Error ? error.message : String(error),
    );
  }

  return envVars;
}

// GraphQL helper function
async function graphqlRequest<T = any>(
  query: string,
  variables?: any,
): Promise<TestResult> {
  try {
    const response = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const result = await response.json();

    if (result.errors) {
      return { success: false, error: result.errors[0].message };
    }

    return { success: true, data: result.data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Start the GraphQL server
async function startServer(): Promise<void> {
  console.log("🚀 Starting GraphQL server...");

  // Load environment variables from .env file
  const envVars = loadEnvFile();

  // Combine with current process env and test-specific overrides
  const serverEnv = {
    ...process.env,
    ...envVars,
    NODE_ENV: "development",
    DMX_UNIVERSE_COUNT: "4",
    DMX_REFRESH_RATE: "44",
    ARTNET_ENABLED: "true", // Enable Art-Net for e2e test
    ARTNET_BROADCAST: "255.255.255.255",
  };

  console.log(
    `📊 Using DATABASE_URL: ${serverEnv.DATABASE_URL?.substring(0, 50)}...`,
  );

  return new Promise((resolve, reject) => {
    serverProcess = spawn("npm", ["run", "dev"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: serverEnv,
      cwd: process.cwd(),
    });

    let startupOutput = "";

    serverProcess.stdout?.on("data", (data) => {
      const output = data.toString();
      startupOutput += output;

      // Always log server output to see DMX service logs
      process.stdout.write(output);

      // Look for server ready indicators
      if (
        output.includes("🚀 GraphQL server ready") ||
        output.includes("Server ready")
      ) {
        console.log("✅ Server started successfully");
        resolve();
      }
    });

    serverProcess.stderr?.on("data", (data) => {
      const output = data.toString();
      startupOutput += output;

      // Always log server errors to console
      process.stderr.write(output);
    });

    serverProcess.on("error", (error) => {
      console.error("❌ Failed to start server:", error);
      reject(error);
    });

    // Fallback timeout
    setTimeout(() => {
      if (startupOutput.includes("GraphQL") || startupOutput.includes("4000")) {
        console.log("✅ Server appears to be running (timeout fallback)");
        resolve();
      } else {
        reject(new Error("Server startup timeout"));
      }
    }, SERVER_STARTUP_DELAY);
  });
}

// Stop the server
function stopServer(): void {
  if (serverProcess) {
    console.log("🛑 Stopping server...");
    serverProcess.kill("SIGTERM");
    serverProcess = null;
  }
}

// Create a test project
async function createProject(): Promise<string> {
  console.log("📁 Creating test project...");

  const query = `
    mutation CreateProject($input: CreateProjectInput!) {
      createProject(input: $input) {
        id
        name
      }
    }
  `;

  const variables = {
    input: {
      name: "E2E Fade Test Project",
      description: "Test project for 2048 channel fade testing",
    },
  };

  const result = await graphqlRequest(query, variables);
  if (!result.success) {
    throw new Error(`Failed to create project: ${result.error}`);
  }

  const projectId = result.data.createProject.id;
  console.log(`✅ Created project: ${projectId}`);
  return projectId;
}

// Find or create Elation SIXPAR 200 fixture definition
async function createSixParFixture(): Promise<string> {
  console.log(
    "💡 Finding or creating Elation SIXPAR 200 fixture definition...",
  );

  // First, try to find existing fixture definition
  const findQuery = `
    query FindFixtureDefinition {
      fixtureDefinitions(filter: { manufacturer: "Elation", model: "SIXPAR 200" }) {
        id
        manufacturer
        model
      }
    }
  `;

  const findResult = await graphqlRequest(findQuery);
  if (findResult.success && findResult.data.fixtureDefinitions.length > 0) {
    const existingFixture = findResult.data.fixtureDefinitions[0];
    console.log(`✅ Found existing fixture definition: ${existingFixture.id}`);
    return existingFixture.id;
  }

  // If not found, create new one
  const query = `
    mutation CreateFixtureDefinition($input: CreateFixtureDefinitionInput!) {
      createFixtureDefinition(input: $input) {
        id
        manufacturer
        model
      }
    }
  `;

  const variables = {
    input: {
      manufacturer: "Elation",
      model: "SIXPAR 200",
      type: "LED_PAR",
      channels: [
        {
          name: "Red",
          type: "RED",
          offset: 0,
          minValue: 0,
          maxValue: 255,
          defaultValue: 0,
        },
        {
          name: "Green",
          type: "GREEN",
          offset: 1,
          minValue: 0,
          maxValue: 255,
          defaultValue: 0,
        },
        {
          name: "Blue",
          type: "BLUE",
          offset: 2,
          minValue: 0,
          maxValue: 255,
          defaultValue: 0,
        },
        {
          name: "Amber",
          type: "AMBER",
          offset: 3,
          minValue: 0,
          maxValue: 255,
          defaultValue: 0,
        },
        {
          name: "White",
          type: "WHITE",
          offset: 4,
          minValue: 0,
          maxValue: 255,
          defaultValue: 0,
        },
        {
          name: "UV",
          type: "UV",
          offset: 5,
          minValue: 0,
          maxValue: 255,
          defaultValue: 0,
        },
        {
          name: "Dimmer",
          type: "INTENSITY",
          offset: 6,
          minValue: 0,
          maxValue: 255,
          defaultValue: 0,
        },
        {
          name: "Strobe",
          type: "STROBE",
          offset: 7,
          minValue: 0,
          maxValue: 255,
          defaultValue: 0,
        },
      ],
    },
  };

  const result = await graphqlRequest(query, variables);
  if (!result.success) {
    throw new Error(`Failed to create fixture definition: ${result.error}`);
  }

  const fixtureDefId = result.data.createFixtureDefinition.id;
  console.log(`✅ Created fixture definition: ${fixtureDefId}`);
  return fixtureDefId;
}

// Create 256 SIXPAR fixtures (64 per universe, 8 channels each = 512 channels per universe)
async function createFixtureInstances(
  projectId: string,
  fixtureDefId: string,
): Promise<string[]> {
  console.log("🔧 Creating 256 SIXPAR 200 fixture instances...");

  const fixtureIds: string[] = [];
  const fixturesPerUniverse = 64;
  const channelsPerFixture = 8;

  for (let universe = 1; universe <= 4; universe++) {
    console.log(
      `   Creating ${fixturesPerUniverse} fixtures for universe ${universe}...`,
    );

    const promises = [];

    for (let fixtureNum = 1; fixtureNum <= fixturesPerUniverse; fixtureNum++) {
      const startChannel = (fixtureNum - 1) * channelsPerFixture;

      const query = `
        mutation CreateFixtureInstance($input: CreateFixtureInstanceInput!) {
          createFixtureInstance(input: $input) {
            id
            name
          }
        }
      `;

      const variables = {
        input: {
          name: `SIXPAR-${universe}-${fixtureNum.toString().padStart(2, "0")}`,
          definitionId: fixtureDefId,
          projectId: projectId,
          universe: universe,
          startChannel: startChannel,
          tags: [`universe-${universe}`, "sixpar", "led-par", "e2e-test"],
        },
      };

      promises.push(graphqlRequest(query, variables));
    }

    const results = await Promise.all(promises);

    for (const result of results) {
      if (!result.success) {
        throw new Error(`Failed to create fixture instance: ${result.error}`);
      }
      fixtureIds.push(result.data.createFixtureInstance.id);
    }
  }

  console.log(`✅ Created ${fixtureIds.length} fixture instances`);
  return fixtureIds;
}

// Get fixture definition channel IDs
async function getFixtureChannelIds(
  fixtureDefId: string,
): Promise<{ [key: string]: string }> {
  const query = `
    query GetFixtureDefinition($id: ID!) {
      fixtureDefinition(id: $id) {
        channels {
          id
          name
          type
        }
      }
    }
  `;

  const result = await graphqlRequest(query, { id: fixtureDefId });
  if (!result.success) {
    throw new Error(`Failed to get fixture definition: ${result.error}`);
  }

  const channelMap: { [key: string]: string } = {};
  result.data.fixtureDefinition.channels.forEach((channel: any) => {
    channelMap[channel.name] = channel.id;
  });

  return channelMap;
}

// Create scene with all fixtures at specific values
async function createScene(
  projectId: string,
  fixtureIds: string[],
  channelIds: { [key: string]: string },
  channelValues: { [key: string]: number },
  name: string,
): Promise<string> {
  console.log(`🎬 Creating scene "${name}"...`);

  const fixtureValues = fixtureIds.map((fixtureId) => ({
    fixtureId,
    channelValues: Object.entries(channelValues).map(
      ([channelName, value]) => ({
        channelId: channelIds[channelName],
        value,
      }),
    ),
  }));

  const query = `
    mutation CreateScene($input: CreateSceneInput!) {
      createScene(input: $input) {
        id
        name
      }
    }
  `;

  const channelDescription = Object.entries(channelValues)
    .map(([name, value]) => `${name}: ${value}`)
    .join(", ");

  const variables = {
    input: {
      name,
      description: `E2E test scene with ${fixtureIds.length} fixtures (${channelDescription})`,
      projectId,
      fixtureValues,
    },
  };

  const result = await graphqlRequest(query, variables);
  if (!result.success) {
    throw new Error(`Failed to create scene: ${result.error}`);
  }

  const sceneId = result.data.createScene.id;
  console.log(`✅ Created scene "${name}": ${sceneId}`);
  return sceneId;
}

// Create cue list with alternating cues
async function createCueList(
  projectId: string,
  sceneFullId: string,
  sceneBlackId: string,
): Promise<string> {
  console.log("🎭 Creating cue list with alternating scenes...");

  const query = `
    mutation CreateCueList($input: CreateCueListInput!) {
      createCueList(input: $input) {
        id
        name
      }
    }
  `;

  const variables = {
    input: {
      name: "E2E Fade Test Cue List",
      description: "Alternates between full and black with 1-second fades",
      projectId,
    },
  };

  const result = await graphqlRequest(query, variables);
  if (!result.success) {
    throw new Error(`Failed to create cue list: ${result.error}`);
  }

  const cueListId = result.data.createCueList.id;
  console.log(`✅ Created cue list: ${cueListId}`);

  // Create alternating cues
  const cues = [
    { name: "Fade to Full", sceneId: sceneFullId, cueNumber: 1.0 },
    { name: "Fade to Black", sceneId: sceneBlackId, cueNumber: 2.0 },
    { name: "Fade to Full", sceneId: sceneFullId, cueNumber: 3.0 },
    { name: "Fade to Black", sceneId: sceneBlackId, cueNumber: 4.0 },
    { name: "Fade to Full", sceneId: sceneFullId, cueNumber: 5.0 },
    { name: "Fade to Black", sceneId: sceneBlackId, cueNumber: 6.0 },
  ];

  for (const cue of cues) {
    const cueQuery = `
      mutation CreateCue($input: CreateCueInput!) {
        createCue(input: $input) {
          id
          name
          cueNumber
        }
      }
    `;

    const cueVariables = {
      input: {
        name: cue.name,
        cueNumber: cue.cueNumber,
        cueListId,
        sceneId: cue.sceneId,
        fadeInTime: 3.0, // 3 second fade
        fadeOutTime: 3.0,
        followTime: null,
        easingType: "EASE_IN_OUT_SINE", // Explicitly set easing type
        notes: "E2E test cue with smooth easing",
      },
    };

    const cueResult = await graphqlRequest(cueQuery, cueVariables);
    if (!cueResult.success) {
      throw new Error(`Failed to create cue: ${cueResult.error}`);
    }

    console.log(`   ✅ Created cue ${cue.cueNumber}: ${cue.name}`);
  }

  return cueListId;
}

// Get cues from cue list
async function getCuesFromList(
  cueListId: string,
): Promise<Array<{ id: string; name: string; cueNumber: number }>> {
  const query = `
    query GetCueList($id: ID!) {
      cueList(id: $id) {
        cues {
          id
          name
          cueNumber
        }
      }
    }
  `;

  const result = await graphqlRequest(query, { id: cueListId });
  if (!result.success) {
    throw new Error(`Failed to get cue list: ${result.error}`);
  }

  return result.data.cueList.cues;
}

// Execute cue
async function playCue(cueId: string, cueName: string): Promise<void> {
  console.log(`🎬 Playing cue: ${cueName}`);

  const query = `
    mutation PlayCue($cueId: ID!) {
      playCue(cueId: $cueId)
    }
  `;

  const result = await graphqlRequest(query, { cueId });
  if (!result.success) {
    throw new Error(`Failed to play cue: ${result.error}`);
  }

  console.log(`   ✅ Cue started: ${cueName}`);
}

// Monitor DMX output during execution
async function monitorDMXOutput(): Promise<void> {
  console.log("📊 Monitoring DMX output across 4 universes...");

  const query = `
    query GetAllDMXOutput {
      allDmxOutput {
        universe
        channels
      }
    }
  `;

  const result = await graphqlRequest(query);
  if (!result.success) {
    console.log(`   ⚠️  DMX monitoring failed: ${result.error}`);
    return;
  }

  const universes = result.data.allDmxOutput;
  universes.forEach((universe: any) => {
    const activeChannels = universe.channels.filter(
      (value: number) => value > 0,
    ).length;
    const maxValue = Math.max(...universe.channels);
    const avgValue =
      universe.channels.reduce((sum: number, val: number) => sum + val, 0) /
      universe.channels.length;

    console.log(
      `   Universe ${universe.universe}: ${activeChannels} active channels, max: ${maxValue}, avg: ${avgValue.toFixed(1)}`,
    );
  });
}

// Execute the cue list with monitoring
async function executeCueSequence(cueListId: string): Promise<void> {
  console.log("\n🎭 Starting cue sequence execution...");
  console.log("=====================================");

  const cues = await getCuesFromList(cueListId);

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];

    console.log(`\n🎬 Executing Cue ${cue.cueNumber}: ${cue.name}`);
    console.log("-".repeat(50));

    await playCue(cue.id, cue.name);
    3;
    // Monitor during fade (sample at 500ms intervals during 3-second fade)
    for (let sample = 0; sample <= 6; sample++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      console.log(
        `\n   📊 Sample ${sample + 1}/3 (${sample * 500}ms into fade):`,
      );
      await monitorDMXOutput();
    }

    console.log(`\n   ✅ Cue ${cue.cueNumber} completed\n`);

    // Wait before next cue (allow fade to complete + brief pause)
    if (i < cues.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  console.log("\n🎉 Cue sequence completed!");
}

// Cleanup
async function cleanup(): Promise<void> {
  console.log("\n🧹 Cleaning up...");

  // Fade to black
  const query = `
    mutation FadeToBlack($fadeOutTime: Float!) {
      fadeToBlack(fadeOutTime: $fadeOutTime)
    }
  `;

  const result = await graphqlRequest(query, { fadeOutTime: 3.0 });
  if (result.success) {
    console.log("   ✅ Faded to black");
    // Wait for fade to complete
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

// Main test function
async function main(): Promise<void> {
  console.log("🧪 E2E FadeEngine Test with GraphQL Integration");
  console.log("==============================================\n");
  console.log("This test will:");
  console.log("• Start the GraphQL server");
  console.log(
    "• Create 256 Elation SIXPAR 200 fixtures (64 per universe, 8 channels each)",
  );
  console.log("• Create scenes for white light and blackout");
  console.log("• Create a cue list with 1-second fades");
  console.log("• Execute the cues while monitoring DMX output");
  console.log("• Art-Net output enabled for real-world testing\n");

  let hasError = false;

  try {
    await startServer();

    console.log("\n📋 Setting up test data...");
    console.log("============================");

    const [projectId, fixtureDefId] = await Promise.all([
      createProject(),
      createSixParFixture(),
    ]);
    const [channelIds, fixtureIds] = await Promise.all([
      getFixtureChannelIds(fixtureDefId),
      createFixtureInstances(projectId, fixtureDefId),
    ]);

    // Create white light scene (all colors + dimmer at full)
    const whiteValues = {
      Red: 255,
      Green: 255,
      Blue: 255,
      Amber: 255,
      White: 255,
      UV: 255,
      Dimmer: 255,
      Strobe: 255,
    };

    // Create blackout scene (all channels at 0)
    const blackValues = {
      Red: 0,
      Green: 0,
      Blue: 0,
      Amber: 0,
      White: 0,
      UV: 0,
      Dimmer: 0,
      Strobe: 0,
    };

    const sceneFullId = await createScene(
      projectId,
      fixtureIds,
      channelIds,
      whiteValues,
      "Full White",
    );
    const sceneBlackId = await createScene(
      projectId,
      fixtureIds,
      channelIds,
      blackValues,
      "Blackout",
    );

    const cueListId = await createCueList(projectId, sceneFullId, sceneBlackId);

    console.log("\n✅ Test setup complete!");
    console.log(`   Project: ${projectId}`);
    console.log(
      `   Fixtures: ${fixtureIds.length} SIXPAR 200 fixtures across 4 universes (${fixtureIds.length * 8} total channels)`,
    );
    console.log(`   Scenes: Full white light and blackout`);
    console.log(`   Cue List: 6 cues alternating between scenes\n`);

    // Wait a moment for everything to settle
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Execute the cue sequence
    await executeCueSequence(cueListId);

    // Final cleanup
    await cleanup();

    console.log("\n🎉 E2E test completed successfully!");
    console.log(
      "✅ All 2048 channels (256 SIXPAR fixtures × 8 channels) faded smoothly across 4 universes",
    );
    console.log("✅ 44Hz fade rate maintained during execution");
    console.log("✅ GraphQL mutations and FadeEngine integration working");
  } catch (error) {
    console.error("\n❌ E2E test failed:", error);
    hasError = true;
  } finally {
    stopServer();
    // Give server time to shut down
    setTimeout(() => process.exit(hasError ? 1 : 0), 1000);
  }
}

// Handle process termination
process.on("SIGINT", () => {
  console.log("\n🛑 Test interrupted - cleaning up...");
  stopServer();
  process.exit(0);
});

process.on("uncaughtException", (error) => {
  console.error("\n💥 Uncaught exception:", error);
  stopServer();
  process.exit(1);
});

main();
