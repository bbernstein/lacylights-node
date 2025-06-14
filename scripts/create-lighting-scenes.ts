#!/usr/bin/env tsx

/**
 * Script to create three lighting scenes for the SlimPAR Pro RGBA fixtures
 * and display the DMX values for verification.
 */

const GRAPHQL_URL = 'http://localhost:4000/graphql';

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
  fixtures: FixtureInstance[];
}

interface FixtureInstance {
  id: string;
  name: string;
  universe: number;
  startChannel: number;
  definition: {
    id: string;
    manufacturer: string;
    model: string;
    channels: Array<{
      id: string;
      name: string;
      type: string;
      offset: number;
    }>;
  };
}

interface Scene {
  id: string;
  name: string;
  description?: string;
  fixtureValues: Array<{
    id: string;
    fixture: {
      id: string;
      name: string;
      startChannel: number;
    };
    channelValues: Array<{
      channel: {
        id: string;
        name: string;
        type: string;
      };
      value: number;
    }>;
  }>;
}

interface ColorValues {
  red: number;
  green: number;
  blue: number;
  amber: number;
}

async function graphqlRequest<T = any>(query: string, variables?: any): Promise<GraphQLResponse<T>> {
  try {
    const response = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('GraphQL request failed:', error);
    throw error;
  }
}

async function findSlimParProject(): Promise<Project> {
  console.log('🔍 Finding SlimPAR Test Project...');

  const query = `
    query GetProjects {
      projects {
        id
        name
        fixtures {
          id
          name
          universe
          startChannel
          definition {
            id
            manufacturer
            model
            channels {
              id
              name
              type
              offset
            }
          }
        }
      }
    }
  `;

  const response = await graphqlRequest<{ projects: Project[] }>(query);
  
  if (response.errors) {
    throw new Error(`Failed to get projects: ${response.errors.map(e => e.message).join(', ')}`);
  }

  const projects = response.data!.projects;
  const slimParProject = projects.find(p => 
    p.name.includes('SlimPAR') && 
    p.fixtures.some(f => f.definition.manufacturer === 'Chauvet DJ' && f.definition.model === 'SlimPAR Pro RGBA')
  );

  if (!slimParProject) {
    throw new Error('SlimPAR Test Project not found. Please run the create-slimpar-fixtures script first.');
  }

  const slimParFixtures = slimParProject.fixtures.filter(f => 
    f.definition.manufacturer === 'Chauvet DJ' && f.definition.model === 'SlimPAR Pro RGBA'
  );

  if (slimParFixtures.length !== 6) {
    throw new Error(`Expected 6 SlimPAR fixtures, found ${slimParFixtures.length}`);
  }

  console.log(`✅ Found project: ${slimParProject.name} with ${slimParFixtures.length} SlimPAR fixtures`);
  
  return {
    ...slimParProject,
    fixtures: slimParFixtures.sort((a, b) => a.startChannel - b.startChannel) // Sort by DMX channel order
  };
}

function getChannelValues(fixture: FixtureInstance, colors: ColorValues): Array<{ channelId: string; value: number }> {
  const channelValues: Array<{ channelId: string; value: number }> = [];
  
  // Find RGBA channels in the fixture definition
  const redChannel = fixture.definition.channels.find(c => c.type === 'RED');
  const greenChannel = fixture.definition.channels.find(c => c.type === 'GREEN');
  const blueChannel = fixture.definition.channels.find(c => c.type === 'BLUE');
  const amberChannel = fixture.definition.channels.find(c => c.type === 'AMBER');

  if (redChannel) channelValues.push({ channelId: redChannel.id, value: colors.red });
  if (greenChannel) channelValues.push({ channelId: greenChannel.id, value: colors.green });
  if (blueChannel) channelValues.push({ channelId: blueChannel.id, value: colors.blue });
  if (amberChannel) channelValues.push({ channelId: amberChannel.id, value: colors.amber });

  return channelValues;
}

async function createScene(
  projectId: string,
  name: string,
  description: string,
  fixtures: FixtureInstance[],
  colorConfigs: ColorValues[]
): Promise<string> {
  console.log(`🎨 Creating scene: ${name}`);

  const fixtureValues = fixtures.map((fixture, index) => ({
    fixtureId: fixture.id,
    channelValues: getChannelValues(fixture, colorConfigs[index])
  }));

  const query = `
    mutation CreateScene($input: CreateSceneInput!) {
      createScene(input: $input) {
        id
        name
        description
      }
    }
  `;

  const variables = {
    input: {
      name,
      description,
      projectId,
      fixtureValues
    }
  };

  const response = await graphqlRequest<{ createScene: { id: string; name: string; description?: string } }>(query, variables);
  
  if (response.errors) {
    throw new Error(`Failed to create scene ${name}: ${response.errors.map(e => e.message).join(', ')}`);
  }

  const scene = response.data!.createScene;
  console.log(`  ✅ Created scene: ${scene.name} (ID: ${scene.id})`);
  
  return scene.id;
}

async function createAllScenes(project: Project): Promise<string[]> {
  console.log('🎭 Creating lighting scenes...\n');

  const sceneIds: string[] = [];

  // Scene 1: All 6 fixtures with Red, Red/Green, Red/Blue, Green, Green/Blue, Blue
  console.log('Scene 1: Rainbow Gradient (All 6 fixtures)');
  console.log('  SlimPAR 1: Red');
  console.log('  SlimPAR 2: Red/Green (Yellow)');
  console.log('  SlimPAR 3: Red/Blue (Magenta)');
  console.log('  SlimPAR 4: Green');
  console.log('  SlimPAR 5: Green/Blue (Cyan)');
  console.log('  SlimPAR 6: Blue');

  const scene1Colors: ColorValues[] = [
    { red: 255, green: 0, blue: 0, amber: 0 },     // Red
    { red: 255, green: 255, blue: 0, amber: 0 },   // Red/Green (Yellow)
    { red: 255, green: 0, blue: 255, amber: 0 },   // Red/Blue (Magenta)
    { red: 0, green: 255, blue: 0, amber: 0 },     // Green
    { red: 0, green: 255, blue: 255, amber: 0 },   // Green/Blue (Cyan)
    { red: 0, green: 0, blue: 255, amber: 0 }      // Blue
  ];

  const scene1Id = await createScene(
    project.id,
    'Rainbow Gradient',
    'All 6 fixtures creating a rainbow gradient from red to blue',
    project.fixtures,
    scene1Colors
  );
  sceneIds.push(scene1Id);

  // Scene 2: First 3 fixtures - Blue, Red, Green
  console.log('\nScene 2: Primary Colors Front (First 3 fixtures)');
  console.log('  SlimPAR 1: Blue');
  console.log('  SlimPAR 2: Red'); 
  console.log('  SlimPAR 3: Green');

  const scene2Colors: ColorValues[] = [
    { red: 0, green: 0, blue: 255, amber: 0 },     // Blue
    { red: 255, green: 0, blue: 0, amber: 0 },     // Red
    { red: 0, green: 255, blue: 0, amber: 0 }      // Green
  ];

  const scene2Id = await createScene(
    project.id,
    'Primary Colors Front',
    'First 3 fixtures (stage front) in blue, red, green',
    project.fixtures.slice(0, 3),
    scene2Colors
  );
  sceneIds.push(scene2Id);

  // Scene 3: Last 3 fixtures - Green, Red, Blue
  console.log('\nScene 3: Primary Colors Back (Last 3 fixtures)');
  console.log('  SlimPAR 4: Green');
  console.log('  SlimPAR 5: Red');
  console.log('  SlimPAR 6: Blue');

  const scene3Colors: ColorValues[] = [
    { red: 0, green: 255, blue: 0, amber: 0 },     // Green
    { red: 255, green: 0, blue: 0, amber: 0 },     // Red
    { red: 0, green: 0, blue: 255, amber: 0 }      // Blue
  ];

  const scene3Id = await createScene(
    project.id,
    'Primary Colors Back',
    'Last 3 fixtures (stage back) in green, red, blue',
    project.fixtures.slice(3, 6),
    scene3Colors
  );
  sceneIds.push(scene3Id);

  console.log(`\n✅ Created ${sceneIds.length} scenes successfully`);
  return sceneIds;
}

async function getSceneDetails(sceneId: string): Promise<Scene> {
  const query = `
    query GetScene($id: ID!) {
      scene(id: $id) {
        id
        name
        description
        fixtureValues {
          id
          fixture {
            id
            name
            startChannel
          }
          channelValues {
            channel {
              id
              name
              type
            }
            value
          }
        }
      }
    }
  `;

  const response = await graphqlRequest<{ scene: Scene }>(query, { id: sceneId });
  
  if (response.errors) {
    throw new Error(`Failed to get scene details: ${response.errors.map(e => e.message).join(', ')}`);
  }

  return response.data!.scene;
}

async function displaySceneDMXValues(sceneIds: string[]): Promise<void> {
  console.log('\n📊 DMX VALUES FOR ALL SCENES\n');
  console.log('=' .repeat(80));

  for (const sceneId of sceneIds) {
    const scene = await getSceneDetails(sceneId);
    
    console.log(`\n🎭 SCENE: ${scene.name.toUpperCase()}`);
    console.log(`📝 Description: ${scene.description}`);
    console.log('-'.repeat(60));

    // Sort fixtures by DMX start channel for consistent display
    const sortedFixtureValues = scene.fixtureValues.sort((a, b) => 
      a.fixture.startChannel - b.fixture.startChannel
    );

    for (const fixtureValue of sortedFixtureValues) {
      const fixture = fixtureValue.fixture;
      console.log(`\n🎯 ${fixture.name} (DMX Start: Ch${fixture.startChannel})`);
      
      // Sort channel values by channel type for RGBA order
      const sortedChannels = fixtureValue.channelValues.sort((a, b) => {
        const typeOrder = { 'RED': 1, 'GREEN': 2, 'BLUE': 3, 'AMBER': 4 };
        return (typeOrder[a.channel.type as keyof typeof typeOrder] || 99) - 
               (typeOrder[b.channel.type as keyof typeof typeOrder] || 99);
      });

      let dmxChannel = fixture.startChannel;
      for (const channelValue of sortedChannels) {
        const channel = channelValue.channel;
        const colorName = channel.type.toLowerCase().padEnd(6);
        const dmxValue = channelValue.value.toString().padStart(3);
        const percentage = Math.round((channelValue.value / 255) * 100).toString().padStart(3);
        
        console.log(`   Ch${dmxChannel.toString().padStart(2)}: ${colorName} = ${dmxValue}/255 (${percentage}%)`);
        dmxChannel++;
      }
    }
    
    console.log('\n' + '='.repeat(60));
  }

  console.log('\n🎆 DMX Summary:');
  console.log('   - All values range from 0-255 (standard DMX)');
  console.log('   - Each SlimPAR uses 4 consecutive channels (RGBA)');
  console.log('   - Channels 1-24 total across 6 fixtures');
  console.log('   - Ready for DMX output to lighting console');
}

async function main() {
  try {
    console.log('🚀 Starting lighting scene creation script\n');

    // Step 1: Find the existing SlimPAR project
    const project = await findSlimParProject();
    console.log('');

    // Step 2: Create the three scenes
    const sceneIds = await createAllScenes(project);
    console.log('');

    // Step 3: Display DMX values for verification
    await displaySceneDMXValues(sceneIds);

    console.log('\n🎭 Scene creation completed successfully!');
    console.log(`\n🔗 Project ID: ${project.id}`);
    console.log(`🔗 Scene IDs: ${sceneIds.join(', ')}`);

  } catch (error) {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  }
}

// Check if this script is being run directly
if (require.main === module) {
  main();
}

export { main as createLightingScenes };