#!/usr/bin/env tsx

/**
 * Test the user's GraphQL query to verify it works
 */

const GRAPHQL_URL = 'http://localhost:4000/graphql';

async function graphqlRequest(query: string, variables: any) {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  const result = await response.json();
  
  if (!response.ok) {
    console.error('Response:', result);
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return result;
}

async function findProjectId() {
  const query = `
    query GetProjects {
      projects {
        id
        name
      }
    }
  `;
  
  const result = await graphqlRequest(query, {});
  const projects = result.data.projects;
  const slimParProject = projects.find((p: any) => p.name.includes('SlimPAR'));
  
  if (!slimParProject) {
    throw new Error('SlimPAR project not found');
  }
  
  return slimParProject.id;
}

async function testUserQuery() {
  console.log('🧪 Testing user GraphQL query...\n');
  
  try {
    // Get a valid project ID
    const projectId = await findProjectId();
    console.log(`📋 Using project ID: ${projectId}`);
    
    // Run the user's query (fixed to only declare used variables)
    const query = `
      query($projectId: ID!) {
        project(id: $projectId) {
          description
          id
          name
          scenes {
            id
            name
            fixtureValues {
              id
            }
          }
        }
      }
    `;
    
    const variables = {
      projectId: projectId
    };
    
    console.log('\n🔍 Running query...');
    const result = await graphqlRequest(query, variables);
    
    if (result.errors) {
      console.error('❌ GraphQL errors:', result.errors);
      return;
    }
    
    console.log('✅ Query successful!');
    console.log('\n📊 Result:');
    console.log(JSON.stringify(result.data, null, 2));
    
    const project = result.data.project;
    if (project && project.scenes) {
      console.log(`\n📈 Summary:`);
      console.log(`   - Project: ${project.name}`);
      console.log(`   - Scenes found: ${project.scenes.length}`);
      
      project.scenes.forEach((scene: any, index: number) => {
        console.log(`   - Scene ${index + 1}: ${scene.name} (${scene.fixtureValues?.length || 0} fixture values)`);
      });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testUserQuery();