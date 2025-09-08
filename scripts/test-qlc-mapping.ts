#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';
import { QLCFixtureLibrary } from '../src/services/qlcFixtureLibrary';

const prisma = new PrismaClient();

async function testQLCMapping() {
  try {
    console.log('🎭 Testing QLC+ Fixture Mapping...\n');

    // Find the FunHome project
    const projects = await prisma.project.findMany({
      where: {
        name: {
          contains: 'FunHome',
          mode: 'insensitive',
        },
      },
    });

    if (projects.length === 0) {
      console.error('❌ No FunHome project found');
      return;
    }

    const project = projects[0];
    console.log(`📁 Project: ${project.name}\n`);

    // Get all unique fixtures in the project
    const fixtures = await prisma.fixtureInstance.findMany({
      where: { projectId: project.id },
      include: { definition: true },
      distinct: ['definitionId'],
    });

    console.log('🔧 LacyLights Fixtures in Project:');
    const uniqueFixtures = fixtures.map(f => {
      const manufacturer = f.manufacturer || f.definition.manufacturer;
      const model = f.model || f.definition.model;
      console.log(`   - ${manufacturer}/${model}`);
      return { manufacturer, model };
    });
    console.log();

    // Load QLC+ fixture library
    console.log('📚 Loading QLC+ fixture library...');
    const qlcLibrary = new QLCFixtureLibrary();
    await qlcLibrary.loadFixtureLibrary();
    console.log();

    // Get suggestions
    const suggestions = qlcLibrary.suggestFixtureMappings(uniqueFixtures);
    
    console.log('💡 QLC+ Fixture Mapping Suggestions:');
    suggestions.forEach((suggestion, index) => {
      console.log(`\n${index + 1}. LacyLights: ${suggestion.fixture.manufacturer}/${suggestion.fixture.model}`);
      console.log('   QLC+ Suggestions:');
      
      if (suggestion.suggestions.length === 0) {
        console.log('     ❌ No matches found');
      } else {
        suggestion.suggestions.slice(0, 3).forEach((qlcFixture, i) => {
          console.log(`     ${i + 1}. ${qlcFixture.manufacturer}/${qlcFixture.model}`);
          qlcFixture.modes.forEach(mode => {
            console.log(`        - Mode: ${mode.name} (${mode.channelCount} channels)`);
          });
        });
      }
    });

    // Show default mappings
    const defaultMappings = qlcLibrary.getDefaultMappings();
    console.log('\n✅ Default Mappings (Ready to Use):');
    defaultMappings.forEach((mapping, index) => {
      console.log(`\n${index + 1}. ${mapping.lacyLightsKey} →`);
      console.log(`   QLC+: ${mapping.qlcManufacturer}/${mapping.qlcModel} (${mapping.qlcMode})`);
    });

    console.log('\n🚀 Ready to export with correct fixture definitions!');

  } catch (error) {
    console.error('❌ Mapping test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testQLCMapping();