#!/usr/bin/env tsx

import { dmxService } from '../src/services/dmx';

async function testPerformanceDMX() {
  console.log('🚀 Testing High-Performance DMX Transmission with Dirty Flag System\n');

  // Test with 8 universes (4096 channels) to simulate professional lighting setup
  process.env.DMX_UNIVERSE_COUNT = '8';
  process.env.DMX_REFRESH_RATE = '44';
  process.env.DMX_IDLE_RATE = '1';
  process.env.DMX_HIGH_RATE_DURATION = '2000';

  // Initialize DMX service
  await dmxService.initialize();
  
  console.log('📊 Initial Status:');
  console.log(dmxService.getTransmissionStatus());

  // Performance Test 1: Single channel change in large system
  console.log('\n🔥 Performance Test 1: Single channel change in 4096-channel system...');
  const startTime = Date.now();
  dmxService.setChannelValue(1, 1, 255);
  const singleChangeTime = Date.now() - startTime;
  
  console.log(`⚡ Single channel change took: ${singleChangeTime}ms`);
  console.log('Status after single change:');
  console.log(dmxService.getTransmissionStatus());

  // Performance Test 2: Bulk channel changes
  console.log('\n🔥 Performance Test 2: Bulk channel changes (500 channels)...');
  const bulkStartTime = Date.now();
  
  // Change 500 channels across multiple universes
  for (let universe = 1; universe <= 8; universe++) {
    for (let channel = 1; channel <= 62; channel++) { // ~62 channels per universe = 496 total
      const value = Math.floor(Math.random() * 256);
      dmxService.setChannelValue(universe, channel, value);
    }
  }
  
  const bulkChangeTime = Date.now() - bulkStartTime;
  console.log(`⚡ 500 channel changes took: ${bulkChangeTime}ms`);
  console.log('Status after bulk changes:');
  console.log(dmxService.getTransmissionStatus());

  // Performance Test 3: Override system performance
  console.log('\n🔥 Performance Test 3: Override system with 100 overrides...');
  const overrideStartTime = Date.now();
  
  for (let i = 1; i <= 100; i++) {
    const universe = Math.ceil(i / 25); // Spread across first 4 universes
    const channel = ((i - 1) % 25) + 1;
    dmxService.setChannelOverride(universe, channel, 200);
  }
  
  const overrideTime = Date.now() - overrideStartTime;
  console.log(`⚡ 100 overrides took: ${overrideTime}ms`);
  console.log('Status after overrides:');
  console.log(dmxService.getTransmissionStatus());

  // Performance Test 4: No-op changes (should not trigger dirty flags)
  console.log('\n🔥 Performance Test 4: No-op changes (setting same values)...');
  const noopStartTime = Date.now();
  
  // Try to set channels to their current values
  for (let i = 1; i <= 100; i++) {
    dmxService.setChannelValue(1, 1, 255); // Same value as before
  }
  
  const noopTime = Date.now() - noopStartTime;
  console.log(`⚡ 100 no-op changes took: ${noopTime}ms`);
  console.log('Status after no-op changes (should show no new dirty flags):');
  console.log(dmxService.getTransmissionStatus());

  // Test idle mode transition
  console.log('\n⏱️  Waiting for idle mode transition (3 seconds)...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  console.log('Status after idle transition:');
  console.log(dmxService.getTransmissionStatus());

  // Performance Test 5: Massive simultaneous changes
  console.log('\n🔥 Performance Test 5: Massive changes (all 4096 channels)...');
  const massiveStartTime = Date.now();
  
  for (let universe = 1; universe <= 8; universe++) {
    for (let channel = 1; channel <= 512; channel++) {
      const value = Math.floor(Math.random() * 256);
      dmxService.setChannelValue(universe, channel, value);
    }
  }
  
  const massiveChangeTime = Date.now() - massiveStartTime;
  console.log(`⚡ 4096 channel changes took: ${massiveChangeTime}ms`);
  console.log('Status after massive changes:');
  console.log(dmxService.getTransmissionStatus());

  // Wait for one transmission cycle to measure actual transmission time
  console.log('\n⏱️  Waiting one transmission cycle to measure performance...');
  await new Promise(resolve => setTimeout(resolve, 50)); // ~2 cycles at 44Hz
  console.log('Final status:');
  console.log(dmxService.getTransmissionStatus());

  // Performance summary
  console.log('\n📈 Performance Summary:');
  console.log(`  Single channel change: ${singleChangeTime}ms`);
  console.log(`  500 bulk changes: ${bulkChangeTime}ms (${(bulkChangeTime/500).toFixed(2)}ms per channel)`);
  console.log(`  100 overrides: ${overrideTime}ms (${(overrideTime/100).toFixed(2)}ms per override)`);
  console.log(`  100 no-op changes: ${noopTime}ms (${(noopTime/100).toFixed(2)}ms per no-op)`);
  console.log(`  4096 massive changes: ${massiveChangeTime}ms (${(massiveChangeTime/4096).toFixed(3)}ms per channel)`);
  
  // Cleanup
  dmxService.stop();
  console.log('\n✅ Performance test completed');
}

// Run the test
testPerformanceDMX().catch(console.error);