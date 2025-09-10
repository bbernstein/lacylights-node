#!/usr/bin/env node

import { QLCFixtureLibrary } from '../src/services/qlcFixtureLibrary';
import path from 'path';

async function testFixturePath() {
  console.log('Testing QLC+ Fixture Library Path Resolution...\n');
  
  // Test 1: Default path (should use local resources)
  console.log('Test 1: Using default path (no arguments)');
  try {
    const lib1 = new QLCFixtureLibrary();
    await lib1.loadFixtureLibrary();
    console.log('✅ Successfully loaded fixtures from default path\n');
  } catch (error) {
    console.error('❌ Failed to load fixtures from default path:', error, '\n');
  }
  
  // Test 2: Using environment variable
  console.log('Test 2: Using QLC_FIXTURES_PATH environment variable');
  const originalEnv = process.env.QLC_FIXTURES_PATH;
  process.env.QLC_FIXTURES_PATH = path.join(__dirname, '../resources/qlc-fixtures');
  try {
    const lib2 = new QLCFixtureLibrary();
    await lib2.loadFixtureLibrary();
    console.log('✅ Successfully loaded fixtures from environment variable path\n');
  } catch (error) {
    console.error('❌ Failed to load fixtures from environment variable:', error, '\n');
  } finally {
    if (originalEnv) {
      process.env.QLC_FIXTURES_PATH = originalEnv;
    } else {
      delete process.env.QLC_FIXTURES_PATH;
    }
  }
  
  // Test 3: Using explicit path
  console.log('Test 3: Using explicit path parameter');
  try {
    const explicitPath = path.join(__dirname, '../resources/qlc-fixtures');
    const lib3 = new QLCFixtureLibrary(explicitPath);
    await lib3.loadFixtureLibrary();
    console.log('✅ Successfully loaded fixtures from explicit path\n');
  } catch (error) {
    console.error('❌ Failed to load fixtures from explicit path:', error, '\n');
  }
  
  // Show fixture statistics
  console.log('Fixture Library Statistics:');
  const lib = new QLCFixtureLibrary();
  await lib.loadFixtureLibrary();
  
  // Search for some common fixtures to verify they're loaded
  const chauvetFixtures = lib.searchFixtures('Chauvet');
  const adjFixtures = lib.searchFixtures('American DJ');
  
  console.log(`Found ${chauvetFixtures.length} Chauvet fixtures`);
  console.log(`Found ${adjFixtures.length} American DJ fixtures`);
  
  // Show sample fixtures
  console.log('\nSample Chauvet fixtures:');
  chauvetFixtures.slice(0, 5).forEach(f => {
    console.log(`  - ${f.manufacturer} ${f.model} (${f.type})`);
  });
}

testFixturePath().catch(console.error);