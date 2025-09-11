#!/usr/bin/env tsx

import { dmxService } from '../src/services/dmx';

async function testAdaptiveTransmission() {
  console.log('🧪 Testing Adaptive DMX Transmission\n');

  // Initialize DMX service
  await dmxService.initialize();
  
  console.log('\n📊 Initial Status:');
  console.log(dmxService.getTransmissionStatus());

  // Test 1: Set some channels to trigger high-rate mode
  console.log('\n🔥 Test 1: Setting channels to trigger high-rate transmission...');
  dmxService.setChannelValue(1, 1, 255);
  dmxService.setChannelValue(1, 2, 128);
  dmxService.setChannelValue(1, 3, 64);
  
  console.log('Status after changes:');
  console.log(dmxService.getTransmissionStatus());
  
  // Wait and check status
  console.log('\n⏱️  Waiting 1 second...');
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('Status after 1 second:');
  console.log(dmxService.getTransmissionStatus());
  
  console.log('\n⏱️  Waiting another 2 seconds (should switch to idle)...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log('Status after 3 seconds total:');
  console.log(dmxService.getTransmissionStatus());
  
  // Test 2: Make another change to switch back to high rate
  console.log('\n🔥 Test 2: Making another change to trigger high-rate again...');
  dmxService.setChannelValue(1, 4, 200);
  console.log('Status after new change:');
  console.log(dmxService.getTransmissionStatus());
  
  // Test 3: Test channel overrides
  console.log('\n🔥 Test 3: Testing channel overrides...');
  dmxService.setChannelOverride(1, 1, 100);
  console.log('Status after override:');
  console.log(dmxService.getTransmissionStatus());
  
  console.log('\n⏱️  Waiting for idle mode again...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  console.log('Final status:');
  console.log(dmxService.getTransmissionStatus());
  
  // Cleanup
  dmxService.stop();
  console.log('\n✅ Test completed');
}

// Run the test
testAdaptiveTransmission().catch(console.error);