#!/usr/bin/env tsx

/**
 * Quick test to verify Art-Net output is working by setting some channels manually
 */

const GRAPHQL_URL = 'http://localhost:4000/graphql';

async function graphqlRequest<T = any>(query: string, variables?: any) {
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
}

async function setChannel(universe: number, channel: number, value: number) {
  const query = `
    mutation SetChannelValue($universe: Int!, $channel: Int!, $value: Int!) {
      setChannelValue(universe: $universe, channel: $channel, value: $value)
    }
  `;
  
  console.log(`Setting Universe ${universe}, Channel ${channel} = ${value}`);
  const result = await graphqlRequest(query, { universe, channel, value });
  return result.data.setChannelValue;
}

async function main() {
  console.log('🧪 Testing Art-Net output...\n');
  
  try {
    // Test basic channels
    await setChannel(1, 1, 255);  // Channel 1 to full
    await setChannel(1, 2, 128);  // Channel 2 to 50%
    await setChannel(1, 3, 64);   // Channel 3 to 25%
    await setChannel(1, 4, 32);   // Channel 4 to 12.5%
    
    console.log('\n✅ Test channels set! Check ArtNetView for output.');
    console.log('   Universe 1, Channels 1-4 should show values 255, 128, 64, 32');
    
    // Hold for 5 seconds
    console.log('\n⏱️  Holding for 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Clear channels
    console.log('\n🧹 Clearing channels...');
    await setChannel(1, 1, 0);
    await setChannel(1, 2, 0);
    await setChannel(1, 3, 0);
    await setChannel(1, 4, 0);
    
    console.log('✅ Channels cleared.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

main();