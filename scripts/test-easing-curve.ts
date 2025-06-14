#!/usr/bin/env tsx

/**
 * Test script to verify easing curves are working correctly
 * Monitors a single channel and logs its values during fade to visualize the curve
 */

import { fadeEngine, EasingType } from "../src/services/fadeEngine";
import { dmxService } from "../src/services/dmx";

async function initializeDMX() {
  console.log("🎭 Initializing DMX service...");
  
  process.env.DMX_UNIVERSE_COUNT = "1";
  process.env.DMX_REFRESH_RATE = "40";
  process.env.ARTNET_ENABLED = "false";
  
  await dmxService.initialize();
  console.log("✅ DMX service initialized\n");
}

function captureChannelValues(universe: number, channel: number, duration: number): Promise<number[]> {
  return new Promise((resolve) => {
    const values: number[] = [];
    const startTime = Date.now();
    
    // Override setChannelValue to capture values
    const originalSetChannelValue = dmxService.setChannelValue;
    dmxService.setChannelValue = (u: number, c: number, value: number) => {
      if (u === universe && c === channel) {
        const elapsed = Date.now() - startTime;
        values.push(value);
        console.log(`[${elapsed.toString().padStart(4, '0')}ms] Channel ${c}: ${value.toString().padStart(3, ' ')} ${'█'.repeat(Math.floor(value / 5))}`);
      }
      return originalSetChannelValue.call(dmxService, u, c, value);
    };
    
    // Restore after duration
    setTimeout(() => {
      dmxService.setChannelValue = originalSetChannelValue;
      resolve(values);
    }, duration * 1000 + 100);
  });
}

async function testEasingType(easingType: EasingType) {
  console.log(`\n📊 Testing ${easingType} easing:`);
  console.log("=" + "=".repeat(50));
  
  const universe = 1;
  const channel = 1;
  const duration = 2; // 2 seconds for better visualization
  
  // Reset channel to 0
  dmxService.setChannelValue(universe, channel, 0);
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Start capturing values
  const capturePromise = captureChannelValues(universe, channel, duration);
  
  // Start fade
  fadeEngine.fadeChannels(
    [{ universe, channel, targetValue: 255 }],
    duration,
    `test-${easingType}`,
    undefined,
    easingType
  );
  
  // Wait for capture to complete
  const values = await capturePromise;
  
  // Analyze the curve
  console.log(`\nCaptured ${values.length} values over ${duration} seconds`);
  
  // Check if it's linear by comparing middle values
  if (values.length > 10) {
    const quarter = values[Math.floor(values.length * 0.25)];
    const half = values[Math.floor(values.length * 0.5)];
    const threeQuarter = values[Math.floor(values.length * 0.75)];
    
    console.log(`\nKey points:`);
    console.log(`  25%: ${quarter} (linear would be ~64)`);
    console.log(`  50%: ${half} (linear would be ~128)`);
    console.log(`  75%: ${threeQuarter} (linear would be ~191)`);
    
    const isLinear = Math.abs(quarter - 64) < 10 && 
                     Math.abs(half - 128) < 10 && 
                     Math.abs(threeQuarter - 191) < 10;
    
    console.log(`\nCurve type: ${isLinear ? '⚠️  Appears LINEAR' : '✅ Non-linear (curved)'}`);
  }
}

async function main() {
  console.log("🧪 Easing Curve Verification Test");
  console.log("=================================\n");
  
  try {
    await initializeDMX();
    
    // Test each easing type
    await testEasingType(EasingType.LINEAR);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await testEasingType(EasingType.EASE_IN_OUT_SINE);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await testEasingType(EasingType.EASE_IN_OUT_CUBIC);
    await new Promise(resolve => setTimeout(resolve, 500));
    
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