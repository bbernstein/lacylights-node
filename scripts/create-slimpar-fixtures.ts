#!/usr/bin/env tsx

/**
 * Script to create 6 Chauvet DJ SlimPAR Pro RGBA fixtures in 4-channel mode
 * and verify they were created correctly.
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
  description?: string;
}

interface FixtureDefinition {
  id: string;
  manufacturer: string;
  model: string;
  modes: Array<{
    id: string;
    name: string;
    shortName?: string;
    channelCount: number;
  }>;
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
  };
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

async function createProject(): Promise<string> {
  console.log('🏗️  Creating test project...');
  
  const query = `
    mutation CreateProject($input: CreateProjectInput!) {
      createProject(input: $input) {
        id
        name
        description
      }
    }
  `;

  const variables = {
    input: {
      name: 'SlimPAR Test Project',
      description: 'Test project for 6 Chauvet DJ SlimPAR Pro RGBA fixtures in 4-channel mode'
    }
  };

  const response = await graphqlRequest<{ createProject: Project }>(query, variables);
  
  if (response.errors) {
    throw new Error(`Failed to create project: ${response.errors.map(e => e.message).join(', ')}`);
  }

  const project = response.data!.createProject;
  console.log(`✅ Created project: ${project.name} (ID: ${project.id})`);
  return project.id;
}

async function findFixtureDefinition(): Promise<FixtureDefinition> {
  console.log('🔍 Finding SlimPAR Pro RGBA fixture definition...');

  const query = `
    query FindFixture($filter: FixtureDefinitionFilter) {
      fixtureDefinitions(filter: $filter) {
        id
        manufacturer
        model
        modes {
          id
          name
          shortName
          channelCount
        }
      }
    }
  `;

  const variables = {
    filter: {
      manufacturer: 'Chauvet DJ',
      model: 'SlimPAR Pro RGBA'
    }
  };

  const response = await graphqlRequest<{ fixtureDefinitions: FixtureDefinition[] }>(query, variables);
  
  if (response.errors) {
    throw new Error(`Failed to find fixture: ${response.errors.map(e => e.message).join(', ')}`);
  }

  const fixtures = response.data!.fixtureDefinitions;
  if (fixtures.length === 0) {
    throw new Error('SlimPAR Pro RGBA fixture definition not found');
  }

  const fixture = fixtures[0];
  console.log(`✅ Found fixture: ${fixture.manufacturer} ${fixture.model} (ID: ${fixture.id})`);
  console.log(`   Available modes: ${fixture.modes.map(m => `${m.name} (${m.channelCount}ch)`).join(', ')}`);

  // Verify 4-channel mode exists
  const fourChannelMode = fixture.modes.find(m => m.name === '4-channel');
  if (!fourChannelMode) {
    throw new Error('4-channel mode not found for SlimPAR Pro RGBA');
  }
  console.log(`✅ Found 4-channel mode (${fourChannelMode.channelCount} channels)`);

  return fixture;
}

async function createFixtureInstance(
  projectId: string, 
  definitionId: string, 
  name: string, 
  universe: number, 
  startChannel: number
): Promise<FixtureInstance> {
  const query = `
    mutation CreateFixtureInstance($input: CreateFixtureInstanceInput!) {
      createFixtureInstance(input: $input) {
        id
        name
        universe
        startChannel
        definition {
          id
          manufacturer
          model
        }
      }
    }
  `;

  const variables = {
    input: {
      name,
      definitionId,
      projectId,
      universe,
      startChannel,
      tags: ['test', 'slimpar', '4-channel']
    }
  };

  const response = await graphqlRequest<{ createFixtureInstance: FixtureInstance }>(query, variables);
  
  if (response.errors) {
    throw new Error(`Failed to create fixture instance ${name}: ${response.errors.map(e => e.message).join(', ')}`);
  }

  return response.data!.createFixtureInstance;
}

async function createFixtures(projectId: string, definitionId: string): Promise<FixtureInstance[]> {
  console.log('🎭 Creating 6 SlimPAR Pro RGBA fixture instances...');

  const fixtures: FixtureInstance[] = [];
  const fixtureConfigs = [
    { name: 'SlimPAR 1 (Stage Left)', universe: 1, startChannel: 1 },
    { name: 'SlimPAR 2 (Stage Left-Center)', universe: 1, startChannel: 5 },
    { name: 'SlimPAR 3 (Stage Center)', universe: 1, startChannel: 9 },
    { name: 'SlimPAR 4 (Stage Right-Center)', universe: 1, startChannel: 13 },
    { name: 'SlimPAR 5 (Stage Right)', universe: 1, startChannel: 17 },
    { name: 'SlimPAR 6 (Upstage Center)', universe: 1, startChannel: 21 },
  ];

  for (const config of fixtureConfigs) {
    try {
      const fixture = await createFixtureInstance(
        projectId,
        definitionId,
        config.name,
        config.universe,
        config.startChannel
      );
      fixtures.push(fixture);
      console.log(`  ✅ Created: ${config.name} (Universe ${config.universe}, Channel ${config.startChannel}-${config.startChannel + 3})`);
    } catch (error) {
      console.error(`  ❌ Failed to create ${config.name}:`, error);
      throw error;
    }
  }

  console.log(`✅ Successfully created ${fixtures.length} fixture instances`);
  return fixtures;
}

async function verifyFixtures(projectId: string): Promise<void> {
  console.log('🔍 Verifying fixture instances were created correctly...');

  const query = `
    query GetProject($id: ID!) {
      project(id: $id) {
        id
        name
        fixtures {
          id
          name
          universe
          startChannel
          tags
          definition {
            id
            manufacturer
            model
            modes {
              name
              channelCount
            }
          }
        }
      }
    }
  `;

  const response = await graphqlRequest<{ project: Project & { fixtures: FixtureInstance[] } }>(query, { id: projectId });
  
  if (response.errors) {
    throw new Error(`Failed to verify fixtures: ${response.errors.map(e => e.message).join(', ')}`);
  }

  const project = response.data!.project;
  const fixtures = project.fixtures;

  console.log(`\n📊 Verification Results for Project: ${project.name}`);
  console.log(`   Total fixtures: ${fixtures.length}`);

  if (fixtures.length !== 6) {
    throw new Error(`Expected 6 fixtures, but found ${fixtures.length}`);
  }

  console.log('\n🎭 Fixture Details:');
  let allValid = true;
  
  fixtures.forEach((fixture, index) => {
    const isSlimPAR = fixture.definition.manufacturer === 'Chauvet DJ' && 
                      fixture.definition.model === 'SlimPAR Pro RGBA';
    const has4ChannelMode = fixture.definition.modes.some(m => m.name === '4-channel' && m.channelCount === 4);
    const correctUniverse = fixture.universe === 1;
    const expectedStartChannel = (index * 4) + 1;
    const correctChannel = fixture.startChannel === expectedStartChannel;

    const status = isSlimPAR && has4ChannelMode && correctUniverse && correctChannel ? '✅' : '❌';
    
    console.log(`   ${status} ${fixture.name}`);
    console.log(`      - Manufacturer: ${fixture.definition.manufacturer}`);
    console.log(`      - Model: ${fixture.definition.model}`);
    console.log(`      - Universe: ${fixture.universe}`);
    console.log(`      - Start Channel: ${fixture.startChannel}`);
    console.log(`      - End Channel: ${fixture.startChannel + 3}`);
    console.log(`      - Available Modes: ${fixture.definition.modes.map(m => `${m.name} (${m.channelCount}ch)`).join(', ')}`);

    if (!isSlimPAR) {
      console.log(`      ❌ Wrong fixture type (expected Chauvet DJ SlimPAR Pro RGBA)`);
      allValid = false;
    }
    if (!has4ChannelMode) {
      console.log(`      ❌ 4-channel mode not available`);
      allValid = false;
    }
    if (!correctUniverse) {
      console.log(`      ❌ Wrong universe (expected 1, got ${fixture.universe})`);
      allValid = false;
    }
    if (!correctChannel) {
      console.log(`      ❌ Wrong start channel (expected ${expectedStartChannel}, got ${fixture.startChannel})`);
      allValid = false;
    }
    console.log('');
  });

  if (allValid) {
    console.log('🎉 All fixtures verified successfully!');
    console.log('\n📋 Summary:');
    console.log(`   - 6 Chauvet DJ SlimPAR Pro RGBA fixtures created`);
    console.log(`   - All configured for 4-channel mode (RGBA)`);
    console.log(`   - Universe 1, channels 1-24 (4 channels per fixture)`);
    console.log(`   - Ready for DMX control`);
  } else {
    throw new Error('Fixture verification failed - see details above');
  }
}

async function main() {
  try {
    console.log('🚀 Starting SlimPAR Pro RGBA fixture creation script\n');

    // Step 1: Create or find project
    const projectId = await createProject();
    console.log('');

    // Step 2: Find fixture definition
    const fixtureDefinition = await findFixtureDefinition();
    console.log('');

    // Step 3: Create 6 fixture instances
    const fixtures = await createFixtures(projectId, fixtureDefinition.id);
    console.log('');

    // Step 4: Verify everything was created correctly
    await verifyFixtures(projectId);

    console.log('\n🎭 Script completed successfully!');
    console.log(`\n🔗 Project ID: ${projectId}`);
    console.log(`🔗 Fixture Definition ID: ${fixtureDefinition.id}`);
    console.log(`🔗 Created Fixture IDs: ${fixtures.map(f => f.id).join(', ')}`);

  } catch (error) {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  }
}

// Check if this script is being run directly
if (require.main === module) {
  main();
}

export { main as createSlimParFixtures };