#!/usr/bin/env tsx

/**
 * Test script for FadeEngine performance with 2048 channels
 * Fades all channels from 0 to 255 over 1 second, then 200 to 0 over 1 second
 * Repeats this cycle 3 times to verify 40Hz fade rate performance
 *
 * Runs in simulation mode (Art-Net disabled) to focus on fade timing performance
 */

import { fadeEngine } from "../src/services/fadeEngine";
import { dmxService } from "../src/services/dmx";

// Track performance metrics
interface FadeMetrics {
  startTime: number;
  endTime: number;
  duration: number;
  channelCount: number;
  totalFrames: number;
  averageFrameTime: number;
}

const metrics: FadeMetrics[] = [];

async function initializeDMX() {
  console.log("🎭 Initializing DMX service in simulation mode...");

  // Set environment variables for test - disable Art-Net for performance testing
  process.env.DMX_UNIVERSE_COUNT = "8";
  process.env.DMX_REFRESH_RATE = "44";
  process.env.ARTNET_ENABLED = "false"; // Disable Art-Net to avoid network errors

  await dmxService.initialize();
  console.log(
    "✅ DMX service initialized (Art-Net disabled for performance testing)\n",
  );
}

function createAllChannels(): Array<{
  universe: number;
  channel: number;
  targetValue: number;
}> {
  const channels: Array<{
    universe: number;
    channel: number;
    targetValue: number;
  }> = [];

  // Create 2048 channels across 4 universes (512 channels each)
  for (
    let universe = 1;
    universe <= Number(process.env.DMX_UNIVERSE_COUNT);
    universe++
  ) {
    for (let channel = 1; channel <= 512; channel++) {
      channels.push({
        universe,
        channel,
        targetValue: 0, // Will be set per fade
      });
    }
  }

  return channels;
}

function fadeChannelsTo(
  channels: Array<{ universe: number; channel: number; targetValue: number }>,
  targetValue: number,
  duration: number,
): Promise<void> {
  return new Promise((resolve) => {
    // Update target values
    channels.forEach((ch) => (ch.targetValue = targetValue));

    const startTime = Date.now();
    let frameCount = 0;

    // Track frame updates
    const originalSetChannelValue = dmxService.setChannelValue;
    dmxService.setChannelValue = (
      universe: number,
      channel: number,
      value: number,
    ) => {
      frameCount++;
      return originalSetChannelValue.call(dmxService, universe, channel, value);
    };

    fadeEngine.fadeChannels(
      channels,
      duration,
      `fade-to-${targetValue}`,
      () => {
        const endTime = Date.now();
        const actualDuration = endTime - startTime;

        // Restore original method
        dmxService.setChannelValue = originalSetChannelValue;

        const metric: FadeMetrics = {
          startTime,
          endTime,
          duration: actualDuration,
          channelCount: channels.length,
          totalFrames: Math.floor(frameCount / channels.length), // Frames per channel
          averageFrameTime:
            actualDuration / Math.floor(frameCount / channels.length),
        };

        metrics.push(metric);

        console.log(`   ✅ Fade to ${targetValue} completed:`);
        console.log(
          `      Duration: ${actualDuration}ms (target: ${duration * 1000}ms)`,
        );
        console.log(
          `      Frames: ${metric.totalFrames} (expected: ~${Math.floor(duration * 40)})`,
        );
        console.log(
          `      Avg frame time: ${metric.averageFrameTime.toFixed(2)}ms (target: 25ms)`,
        );
        console.log(`      Channels updated: ${frameCount} total updates\n`);

        resolve();
      },
    );
  });
}

async function runFadeCycle(cycleNumber: number) {
  console.log(`🔄 Starting fade cycle ${cycleNumber}:`);

  const channels = createAllChannels();

  // Fade up from 0 to 255 over 1 second
  console.log(`   📈 Fading ${channels.length} channels from 0 → 255...`);
  await fadeChannelsTo(channels, 255, 1);

  // Brief pause
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Fade down from 200 to 0 over 1 second
  console.log(`   📉 Fading ${channels.length} channels from 200 → 0...`);
  // Set current values to 200 first
  channels.forEach((ch) =>
    dmxService.setChannelValue(ch.universe, ch.channel, 200),
  );
  await fadeChannelsTo(channels, 0, 1);

  // Brief pause between cycles
  await new Promise((resolve) => setTimeout(resolve, 200));
}

function analyzeResults() {
  console.log("📊 Performance Analysis:");
  console.log("========================\n");

  const fadeUps = metrics.filter((_, index) => index % 2 === 0);
  const fadeDowns = metrics.filter((_, index) => index % 2 === 1);

  console.log("Fade Up Performance (0 → 255):");
  fadeUps.forEach((metric, index) => {
    const frameRateHz = 1000 / metric.averageFrameTime;
    console.log(
      `  Cycle ${index + 1}: ${metric.totalFrames} frames, ${frameRateHz.toFixed(1)}Hz`,
    );
  });

  console.log("\nFade Down Performance (200 → 0):");
  fadeDowns.forEach((metric, index) => {
    const frameRateHz = 1000 / metric.averageFrameTime;
    console.log(
      `  Cycle ${index + 1}: ${metric.totalFrames} frames, ${frameRateHz.toFixed(1)}Hz`,
    );
  });

  // Overall statistics
  const totalFrames = metrics.reduce((sum, m) => sum + m.totalFrames, 0);
  const avgFrameTime =
    metrics.reduce((sum, m) => sum + m.averageFrameTime, 0) / metrics.length;
  const avgFrameRate = 1000 / avgFrameTime;

  console.log("\nOverall Performance:");
  console.log(`  Total fades: ${metrics.length}`);
  console.log(`  Total frames processed: ${totalFrames}`);
  console.log(
    `  Average frame rate: ${avgFrameRate.toFixed(1)}Hz (target: 40Hz)`,
  );
  console.log(
    `  Frame rate variance: ${avgFrameRate >= 38 && avgFrameRate <= 42 ? "✅ Within tolerance" : "⚠️  Outside tolerance"}`,
  );

  // Performance validation
  const performanceIssues: string[] = [];

  if (avgFrameRate < 38) {
    performanceIssues.push(
      `Frame rate too low: ${avgFrameRate.toFixed(1)}Hz < 38Hz`,
    );
  }
  if (avgFrameRate > 42) {
    performanceIssues.push(
      `Frame rate too high: ${avgFrameRate.toFixed(1)}Hz > 42Hz`,
    );
  }

  const maxDurationVariance = Math.max(
    ...metrics.map((m) => Math.abs(m.duration - 1000)),
  );
  if (maxDurationVariance > 50) {
    performanceIssues.push(
      `Duration variance too high: ${maxDurationVariance}ms > 50ms`,
    );
  }

  if (performanceIssues.length === 0) {
    console.log("\n🎉 All performance targets met!");
    console.log("   ✅ 40Hz fade rate maintained");
    console.log("   ✅ 2048 channels handled efficiently");
    console.log("   ✅ Timing accuracy within tolerance");
  } else {
    console.log("\n⚠️  Performance issues detected:");
    performanceIssues.forEach((issue) => console.log(`   ❌ ${issue}`));
  }
}

async function main() {
  console.log("🧪 FadeEngine Performance Test");
  console.log("==============================\n");
  console.log("Testing 2048 channels (4 universes × 512 channels)");
  console.log("Fade pattern: 0→255 (1s), then 200→0 (1s), repeat 3 times");
  console.log("Target frame rate: 40Hz (25ms intervals)");
  console.log(
    "Mode: Simulation (Art-Net disabled for pure performance testing)\n",
  );

  try {
    await initializeDMX();

    // Run 3 fade cycles
    for (let cycle = 1; cycle <= 3; cycle++) {
      await runFadeCycle(cycle);
    }

    // Analyze results
    analyzeResults();

    // Clean up - fade all channels to black
    console.log("\n🧹 Cleaning up - fading to black...");
    fadeEngine.fadeToBlack(0.5);

    // Wait for cleanup fade to complete
    await new Promise((resolve) => setTimeout(resolve, 600));

    console.log("✅ Test completed successfully!\n");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  } finally {
    // Stop services
    fadeEngine.stop();
    dmxService.stop();

    // Force exit since Art-Net socket might keep process alive
    setTimeout(() => process.exit(0), 100);
  }
}

// Handle process termination
process.on("SIGINT", () => {
  console.log("\n🛑 Test interrupted - cleaning up...");
  fadeEngine.stop();
  dmxService.stop();
  process.exit(0);
});

main();
