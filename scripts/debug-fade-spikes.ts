#!/usr/bin/env tsx

/**
 * Debug script to identify sources of value spikes during fades
 * Monitors channel values for discontinuities and logs suspicious changes
 */

import { fadeEngine, EasingType } from "../src/services/fadeEngine";
import { dmxService } from "../src/services/dmx";

interface ValueChange {
  time: number;
  value: number;
  delta: number;
  suspicious: boolean;
}

async function initializeDMX() {
  console.log("🎭 Initializing DMX service...");
  
  process.env.DMX_UNIVERSE_COUNT = "1";
  process.env.DMX_REFRESH_RATE = "40";
  process.env.ARTNET_ENABLED = "true"; // Enable to match your test
  
  await dmxService.initialize();
  console.log("✅ DMX service initialized\n");
}

function monitorChannelForSpikes(
  universe: number,
  channel: number,
  duration: number,
  spikeThreshold: number = 15
): Promise<ValueChange[]> {
  return new Promise((resolve) => {
    const changes: ValueChange[] = [];
    let lastValue: number | null = null;
    let lastTime: number | null = null;
    const startTime = Date.now();
    
    // Override setChannelValue to monitor all changes
    const originalSetChannelValue = dmxService.setChannelValue;
    dmxService.setChannelValue = (u: number, c: number, value: number) => {
      const now = Date.now();
      
      if (u === universe && c === channel) {
        const time = now - startTime;
        let delta = 0;
        let suspicious = false;
        
        if (lastValue !== null) {
          delta = value - lastValue;
          
          // Check for suspicious changes
          if (Math.abs(delta) > spikeThreshold && lastTime !== null) {
            const timeDelta = time - lastTime;
            const expectedMaxDelta = (255 / (duration * 1000)) * timeDelta * 1.5; // 1.5x for curve variations
            
            // Mark as suspicious if change is larger than expected
            if (Math.abs(delta) > expectedMaxDelta) {
              suspicious = true;
              console.log(`\n⚠️  SPIKE DETECTED at ${time}ms:`);
              console.log(`   Previous: ${lastValue} at ${lastTime}ms`);
              console.log(`   Current:  ${value} at ${time}ms`);
              console.log(`   Delta:    ${delta} (${timeDelta}ms elapsed)`);
              console.log(`   Expected max delta: ±${expectedMaxDelta.toFixed(1)}`);
            }
          }
        }
        
        changes.push({ time, value, delta, suspicious });
        lastValue = value;
        lastTime = time;
      }
      
      return originalSetChannelValue.call(dmxService, u, c, value);
    };
    
    // Restore after duration
    setTimeout(() => {
      dmxService.setChannelValue = originalSetChannelValue;
      resolve(changes);
    }, duration * 1000 + 500);
  });
}

async function analyzeFadePattern(changes: ValueChange[]): Promise<void> {
  console.log("\n📊 Fade Analysis:");
  console.log(`Total value changes: ${changes.length}`);
  
  // Calculate frame intervals
  const intervals: number[] = [];
  for (let i = 1; i < changes.length; i++) {
    intervals.push(changes[i].time - changes[i - 1].time);
  }
  
  if (intervals.length > 0) {
    const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
    const minInterval = Math.min(...intervals);
    const maxInterval = Math.max(...intervals);
    
    console.log(`\nTiming Analysis:`);
    console.log(`  Average interval: ${avgInterval.toFixed(1)}ms (expected: ~25ms)`);
    console.log(`  Min interval: ${minInterval}ms`);
    console.log(`  Max interval: ${maxInterval}ms`);
    
    // Check for timing irregularities
    const irregularIntervals = intervals.filter(i => i < 10 || i > 40);
    if (irregularIntervals.length > 0) {
      console.log(`  ⚠️  Irregular intervals: ${irregularIntervals.length} out of ${intervals.length}`);
      console.log(`     Values: ${irregularIntervals.slice(0, 10).join(', ')}${irregularIntervals.length > 10 ? '...' : ''}`);
    }
  }
  
  // Count spikes
  const spikes = changes.filter(c => c.suspicious);
  if (spikes.length > 0) {
    console.log(`\n⚠️  Detected ${spikes.length} suspicious spikes`);
  } else {
    console.log(`\n✅ No suspicious spikes detected`);
  }
  
  // Check for value reversals (value going backwards)
  const reversals = changes.filter((c, i) => i > 0 && c.delta < -2); // -2 for rounding tolerance
  if (reversals.length > 0) {
    console.log(`\n⚠️  Detected ${reversals.length} value reversals (fade going backwards)`);
    reversals.slice(0, 5).forEach(r => {
      console.log(`   At ${r.time}ms: value=${r.value}, delta=${r.delta}`);
    });
  }
}

async function testFadeWithMonitoring(
  name: string,
  targetValue: number,
  duration: number,
  easingType: EasingType
): Promise<void> {
  console.log(`\n🧪 Testing ${name}:`);
  console.log("=" + "=".repeat(60));
  
  const universe = 1;
  const channel = 1;
  
  // Reset channel
  dmxService.setChannelValue(universe, channel, 0);
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Start monitoring
  const monitorPromise = monitorChannelForSpikes(universe, channel, duration);
  
  // Start fade
  console.log(`Starting fade: 0 → ${targetValue} over ${duration}s with ${easingType}`);
  fadeEngine.fadeChannels(
    [{ universe, channel, targetValue }],
    duration,
    `test-${name}`,
    undefined,
    easingType
  );
  
  // Wait for monitoring to complete
  const changes = await monitorPromise;
  
  // Analyze results
  await analyzeFadePattern(changes);
  
  // Wait before next test
  await new Promise(resolve => setTimeout(resolve, 500));
}

async function testRapidFadeChanges(): Promise<void> {
  console.log("\n🧪 Testing Rapid Fade Changes (potential source of spikes):");
  console.log("=" + "=".repeat(60));
  
  const universe = 1;
  const channel = 1;
  
  // Start monitoring
  const monitorPromise = monitorChannelForSpikes(universe, channel, 3);
  
  // Start a fade
  fadeEngine.fadeChannels(
    [{ universe, channel, targetValue: 255 }],
    2,
    'rapid-test-1'
  );
  
  // Interrupt with new fade after 500ms
  setTimeout(() => {
    console.log("\n🔄 Interrupting with new fade (255 → 0)");
    fadeEngine.fadeChannels(
      [{ universe, channel, targetValue: 0 }],
      2,
      'rapid-test-1' // Same ID to override
    );
  }, 500);
  
  // Another interruption after 1000ms
  setTimeout(() => {
    console.log("\n🔄 Interrupting again with new fade (0 → 128)");
    fadeEngine.fadeChannels(
      [{ universe, channel, targetValue: 128 }],
      1,
      'rapid-test-1'
    );
  }, 1000);
  
  const changes = await monitorPromise;
  await analyzeFadePattern(changes);
}

async function checkForRoundingIssues(): Promise<void> {
  console.log("\n🧪 Checking for Rounding Issues:");
  console.log("=" + "=".repeat(60));
  
  // Test specific progress values that might cause rounding issues
  const testProgress = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  
  for (const progress of testProgress) {
    // Simulate fade interpolation
    const start = 0;
    const end = 255;
    const linearValue = start + (end - start) * progress;
    const roundedValue = Math.round(linearValue);
    
    // Check for potential issues
    if (Math.abs(roundedValue - linearValue) > 0.5) {
      console.log(`Progress ${progress}: linear=${linearValue.toFixed(2)}, rounded=${roundedValue}`);
    }
  }
}

async function main() {
  console.log("🔍 Fade Spike Debugging Tool");
  console.log("============================\n");
  console.log("This tool monitors DMX output for:");
  console.log("• Value spikes during fades");
  console.log("• Timing irregularities");
  console.log("• Value reversals");
  console.log("• Fade interruption behavior\n");
  
  try {
    await initializeDMX();
    
    // Test smooth fade
    await testFadeWithMonitoring(
      "Smooth Fade Up",
      255,
      2,
      EasingType.EASE_IN_OUT_SINE
    );
    
    // Test fade down
    await testFadeWithMonitoring(
      "Smooth Fade Down",
      0,
      2,
      EasingType.EASE_IN_OUT_SINE
    );
    
    // Test linear fade for comparison
    await testFadeWithMonitoring(
      "Linear Fade (for comparison)",
      255,
      2,
      EasingType.LINEAR
    );
    
    // Test rapid fade changes
    await testRapidFadeChanges();
    
    // Check for rounding issues
    await checkForRoundingIssues();
    
    console.log("\n✅ Debugging completed!\n");
    
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