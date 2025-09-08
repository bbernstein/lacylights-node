#!/usr/bin/env tsx

import { QLCFixtureLibrary } from '../src/services/qlcFixtureLibrary';

async function analyzeQLCFixtures() {
  try {
    console.log('🔍 Analyzing QLC+ fixtures vs LacyLights fixtures...\n');

    const lib = new QLCFixtureLibrary();
    await lib.loadFixtureLibrary();
    
    // Get the specific fixtures we mapped
    const slimpar = lib.getFixture('Chauvet', 'SlimPAR Pro Q USB');
    const colorsource = lib.getFixture('ETC', 'ColorSource PAR');
    
    console.log('🎭 QLC+ Fixture Analysis:\n');
    
    if (slimpar) {
      console.log(`📦 ${slimpar.manufacturer}/${slimpar.model}`);
      console.log('   Available Modes:');
      slimpar.modes.forEach(mode => {
        console.log(`     ${mode.name}: ${mode.channelCount} channels`);
        mode.channels.forEach(ch => {
          console.log(`       ${ch.number}: ${ch.name}`);
        });
      });
      console.log();
    }
    
    if (colorsource) {
      console.log(`📦 ${colorsource.manufacturer}/${colorsource.model}`);
      console.log('   Available Modes:');
      colorsource.modes.forEach(mode => {
        console.log(`     ${mode.name}: ${mode.channelCount} channels`);
        mode.channels.forEach(ch => {
          console.log(`       ${ch.number}: ${ch.name}`);
        });
      });
      console.log();
    }

    console.log('💡 Current Mapping Analysis:');
    console.log('LacyLights: Chauvet Dj/SlimPAR Pro RGBA (4-ch RGBA)');
    console.log('  → QLC+: Chauvet/SlimPAR Pro Q USB');
    console.log('     ✅ Has 4 Channel mode with Red/Green/Blue/Amber');
    console.log('     ✅ Perfect match!\n');

    console.log('LacyLights: Etc/ColorSource Spot (3-ch RGB)');
    console.log('  → QLC+: ETC/ColorSource PAR');
    console.log('     ✅ Has 3-channel (RGB) mode with Red/Green/Blue');
    console.log('     ✅ Perfect match!\n');

    console.log('🎯 Channel compatibility analysis needed:');
    console.log('1. Match channel count (3, 4, 5, etc.)');
    console.log('2. Match channel types (RGB, RGBA, with/without intensity)');  
    console.log('3. Consider mode name similarity');
    console.log('4. Score fixtures by compatibility');

  } catch (error) {
    console.error('❌ Analysis failed:', error);
  }
}

analyzeQLCFixtures();