#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';
import { QLCFixtureLibrary, LacyLightsFixtureDetails } from '../src/services/qlcFixtureLibrary';

const prisma = new PrismaClient();

async function testEnhancedMapping() {
  try {
    console.log('🧠 Testing Enhanced Fixture Mapping with Channel Analysis...\n');

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

    // Get all unique fixtures in the project with detailed channel information
    const fixtures = await prisma.fixtureInstance.findMany({
      where: { projectId: project.id },
      include: { 
        definition: true, 
        channels: { orderBy: { offset: 'asc' } }
      },
      distinct: ['definitionId'],
    });

    // Convert to enhanced fixture details
    const lacyFixtures: LacyLightsFixtureDetails[] = fixtures.map(f => ({
      manufacturer: f.manufacturer || f.definition.manufacturer,
      model: f.model || f.definition.model,
      mode: f.modeName,
      channelCount: f.channelCount || f.channels.length,
      channels: f.channels.map(ch => ({
        offset: ch.offset,
        name: ch.name,
        type: ch.type,
      })),
    }));

    console.log('🎭 LacyLights Fixtures with Channel Details:');
    lacyFixtures.forEach((fixture, i) => {
      console.log(`\n${i + 1}. ${fixture.manufacturer}/${fixture.model}`);
      console.log(`   Mode: ${fixture.mode} (${fixture.channelCount} channels)`);
      console.log('   Channels:', fixture.channels.map(ch => `${ch.name}(${ch.type})`).join(', '));
    });
    console.log();

    // Load QLC+ fixture library
    console.log('📚 Loading QLC+ fixture library...');
    const qlcLibrary = new QLCFixtureLibrary();
    await qlcLibrary.loadFixtureLibrary();
    console.log();

    // Get enhanced compatibility suggestions
    const suggestions = qlcLibrary.suggestFixtureMappingsEnhanced(lacyFixtures);
    
    console.log('🎯 Enhanced Compatibility Analysis:\n');
    
    suggestions.forEach((suggestion, index) => {
      console.log(`${index + 1}. LacyLights: ${suggestion.fixture.manufacturer}/${suggestion.fixture.model}`);
      console.log(`   Channels: ${suggestion.fixture.channels.map(ch => ch.type).join(', ')}\n`);
      
      if (suggestion.compatibleFixtures.length === 0) {
        console.log('   ❌ No compatible QLC+ fixtures found\n');
        return;
      }

      console.log('   🏆 Top QLC+ Matches (by compatibility score):');
      suggestion.compatibleFixtures.slice(0, 3).forEach((match, i) => {
        console.log(`     ${i + 1}. ${match.fixture.manufacturer}/${match.fixture.model} - ${match.mode.name}`);
        console.log(`        Score: ${match.score}/100 points`);
        console.log(`        Channels: ${match.mode.channels.map(ch => ch.name).join(', ')}`);
        console.log(`        Reasons: ${match.reasons.join(', ')}\n`);
      });
    });

    // Show current default mappings vs best AI suggestions
    console.log('📊 Default Mappings vs AI Suggestions:\n');
    
    const defaultMappings = qlcLibrary.getDefaultMappings();
    
    suggestions.forEach((suggestion, i) => {
      const lacyKey = `${suggestion.fixture.manufacturer}/${suggestion.fixture.model}`;
      const defaultMapping = defaultMappings.find(m => m.lacyLightsKey === lacyKey);
      const bestAiMatch = suggestion.compatibleFixtures[0];
      
      console.log(`${i + 1}. ${lacyKey}:`);
      
      if (defaultMapping) {
        console.log(`   📋 Current Default: ${defaultMapping.qlcManufacturer}/${defaultMapping.qlcModel} (${defaultMapping.qlcMode})`);
      }
      
      if (bestAiMatch) {
        console.log(`   🤖 AI Suggestion: ${bestAiMatch.fixture.manufacturer}/${bestAiMatch.fixture.model} (${bestAiMatch.mode.name})`);
        console.log(`   📈 AI Confidence: ${bestAiMatch.score}/100 points`);
        
        if (defaultMapping) {
          const isCurrentMappingOptimal = 
            defaultMapping.qlcManufacturer === bestAiMatch.fixture.manufacturer &&
            defaultMapping.qlcModel === bestAiMatch.fixture.model &&
            defaultMapping.qlcMode === bestAiMatch.mode.name;
          
          console.log(`   ${isCurrentMappingOptimal ? '✅' : '⚠️'} ${isCurrentMappingOptimal ? 'Current mapping is optimal!' : 'AI suggests different fixture'}`);
        }
      }
      console.log();
    });

  } catch (error) {
    console.error('❌ Enhanced mapping test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testEnhancedMapping();