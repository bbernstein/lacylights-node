#!/usr/bin/env tsx

/**
 * Test script to verify fade continuity when interrupting fades
 * This should show smooth transitions without value reversals
 */

import { fadeEngine, EasingType } from "../src/services/fadeEngine";
import { dmxService } from "../src/services/dmx";

async function initializeDMX() {
  console.log("🎭 Initializing DMX service...");
  
  process.env.DMX_UNIVERSE_COUNT = "1";
  process.env.DMX_REFRESH_RATE = "40";
  process.env.ARTNET_ENABLED = "true";
  
  await dmxService.initialize();
  console.log("✅ DMX service initialized\n");
}

function trackChannelValues(universe: number, channel: number, duration: number): Promise<number[]> {
  return new Promise((resolve) => {
    const values: number[] = [];
    let captureInterval: NodeJS.Timeout;
    
    // Capture values every 10ms for high resolution
    captureInterval = setInterval(() => {
      const value = dmxService.getChannelValue(universe, channel);
      values.push(value);
    }, 10);
    
    // Stop capturing after duration
    setTimeout(() => {
      clearInterval(captureInterval);
      resolve(values);
    }, duration);
  });
}

async function testFadeInterruption() {
  console.log("🧪 Testing Fade Interruption Continuity");
  console.log("========================================\n");
  
  const universe = 1;
  const channel = 1;
  
  // Reset channel
  dmxService.setChannelValue(universe, channel, 0);
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Start tracking
  const trackingPromise = trackChannelValues(universe, channel, 3000);
  
  // Start fade up
  console.log("📈 Starting fade: 0 → 255 over 2s");
  fadeEngine.fadeChannels(
    [{ universe, channel, targetValue: 255 }],
    2,
    'test-fade',
    undefined,
    EasingType.EASE_IN_OUT_SINE
  );
  
  // Interrupt after 800ms
  await new Promise(resolve => setTimeout(resolve, 800));
  console.log("🔄 Interrupting at ~800ms: current → 0 over 1.5s");
  
  fadeEngine.fadeChannels(
    [{ universe, channel, targetValue: 0 }],
    1.5,
    'test-fade', // Same ID to replace
    undefined,
    EasingType.EASE_IN_OUT_SINE
  );
  
  // Interrupt again after 600ms
  await new Promise(resolve => setTimeout(resolve, 600));
  console.log("🔄 Interrupting at ~1400ms: current → 128 over 1s");
  
  fadeEngine.fadeChannels(
    [{ universe, channel, targetValue: 128 }],
    1,
    'test-fade',
    undefined,
    EasingType.LINEAR
  );
  
  // Get all values
  const values = await trackingPromise;
  
  // Analyze for reversals
  console.log("\n📊 Analysis:");
  console.log(`Total samples: ${values.length}`);
  
  let reversals = 0;
  let maxReversal = 0;
  const reversalDetails: string[] = [];
  
  for (let i = 1; i < values.length; i++) {
    const delta = values[i] - values[i-1];
    if (delta < -1) { // -1 tolerance for rounding
      reversals++;
      maxReversal = Math.max(maxReversal, Math.abs(delta));
      if (reversalDetails.length < 5) {
        reversalDetails.push(`  Sample ${i}: ${values[i-1]} → ${values[i]} (delta: ${delta})`);
      }
    }
  }
  
  if (reversals > 0) {
    console.log(`\n⚠️  Found ${reversals} value reversals (max: ${maxReversal})`);
    console.log("First few reversals:");
    reversalDetails.forEach(detail => console.log(detail));
  } else {
    console.log("\n✅ No value reversals detected - fade continuity maintained!");
  }
  
  // Show fade progression visually
  console.log("\n📈 Fade progression (sampled every 100ms):");
  for (let i = 0; i < values.length; i += 10) {
    const value = values[i];
    const bar = '█'.repeat(Math.floor(value / 5));
    const time = (i * 10).toString().padStart(4, ' ');
    console.log(`${time}ms: ${value.toString().padStart(3, ' ')} ${bar}`);
  }
}

async function main() {
  try {
    await initializeDMX();
    await testFadeInterruption();
    
    console.log("\n✅ Test completed!\n");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  } finally {
    fadeEngine.stop();
    dmxService.stop();
    setTimeout(() => process.exit(0), 100);
  }
}

main();