import { dmxService } from "./dmx";

export enum EasingType {
  LINEAR = "LINEAR",
  EASE_IN_OUT_CUBIC = "EASE_IN_OUT_CUBIC",
  EASE_IN_OUT_SINE = "EASE_IN_OUT_SINE",
  EASE_OUT_EXPONENTIAL = "EASE_OUT_EXPONENTIAL",
  BEZIER = "BEZIER",
  S_CURVE = "S_CURVE",
}

interface ChannelFade {
  universe: number;
  channel: number;
  startValue: number;
  endValue: number;
  startTime: number;
  duration: number;
}

interface ActiveFade {
  id: string;
  channels: ChannelFade[];
  startTime: number;
  duration: number;
  easingType: EasingType;
  onComplete?: () => void;
}

class FadeEngine {
  private activeFades: Map<string, ActiveFade> = new Map();
  private fadeInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private currentInterpolatedValues: Map<string, number> = new Map(); // Track actual interpolated values

  constructor() {
    this.start();
  }

  start() {
    if (this.isRunning) { return; }

    this.isRunning = true;
    // Run at 40Hz (25ms intervals) for smooth fading
    this.fadeInterval = setInterval(() => this.processFades(), 25);
  }

  stop() {
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
      this.fadeInterval = null;
    }
    this.isRunning = false;
  }

  private processFades() {
    const now = Date.now();
    const completedFades: string[] = [];

    this.activeFades.forEach((fade, fadeId) => {
      const elapsed = now - fade.startTime;
      const progress = Math.min(elapsed / fade.duration, 1);

      if (progress >= 1) {
        // Fade complete - set final values
        fade.channels.forEach((channel) => {
          const channelKey = `${channel.universe}-${channel.channel}`;
          this.currentInterpolatedValues.set(channelKey, channel.endValue);
          dmxService.setChannelValue(
            channel.universe,
            channel.channel,
            channel.endValue,
          );
        });

        completedFades.push(fadeId);
        if (fade.onComplete) {fade.onComplete();}
      } else {
        // Interpolate values
        fade.channels.forEach((channel) => {
          const currentValue = this.interpolate(
            channel.startValue,
            channel.endValue,
            progress,
            fade.easingType,
          );
          // Use better rounding to avoid jumps
          const roundedValue = Math.round(currentValue);
          // Clamp to valid DMX range
          const clampedValue = Math.max(0, Math.min(255, roundedValue));

          // Store the interpolated value for accurate fade transitions
          const channelKey = `${channel.universe}-${channel.channel}`;
          this.currentInterpolatedValues.set(channelKey, currentValue);

          dmxService.setChannelValue(
            channel.universe,
            channel.channel,
            clampedValue,
          );
        });
      }
    });

    // Remove completed fades
    completedFades.forEach((id) => this.activeFades.delete(id));
  }

  private interpolate(
    start: number,
    end: number,
    progress: number,
    easingType: EasingType = EasingType.EASE_IN_OUT_SINE,
  ): number {
    // Apply easing function to progress
    const easedProgress = this.applyEasing(progress, easingType);
    return start + (end - start) * easedProgress;
  }

  private applyEasing(progress: number, easingType: EasingType): number {
    switch (easingType) {
      case EasingType.LINEAR:
        return progress;

      case EasingType.EASE_IN_OUT_CUBIC:
        return progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      case EasingType.EASE_IN_OUT_SINE:
        return -(Math.cos(Math.PI * progress) - 1) / 2;

      case EasingType.EASE_OUT_EXPONENTIAL:
        return progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);

      case EasingType.BEZIER:
        // For now, using a standard ease-in-out bezier curve
        // Future: allow custom control points
        return this.cubicBezier(0.42, 0, 0.58, 1, progress);

      case EasingType.S_CURVE:
        // Sigmoid function normalized to 0-1 range
        const k = 10; // Steepness factor
        return 1 / (1 + Math.exp(-k * (progress - 0.5)));

      default:
        return progress;
    }
  }

  private cubicBezier(
    p1x: number,
    p1y: number,
    p2x: number,
    p2y: number,
    t: number,
  ): number {
    // Simplified cubic bezier implementation for standard ease curves
    // For a more complete implementation, we'd use Newton-Raphson method
    // const cx = 3 * p1x; // Not used in current implementation
    // const bx = 3 * (p2x - p1x) - cx; // Not used in current implementation
    // const ax = 1 - cx - bx; // Not used in current implementation

    const cy = 3 * p1y;
    const by = 3 * (p2y - p1y) - cy;
    const ay = 1 - cy - by;

    // This is a simplified approximation
    const tSquared = t * t;
    const tCubed = tSquared * t;

    return ay * tCubed + by * tSquared + cy * t;
  }

  fadeChannels(
    channels: Array<{ universe: number; channel: number; targetValue: number }>,
    duration: number,
    fadeId?: string,
    onComplete?: () => void,
    easingType: EasingType = EasingType.EASE_IN_OUT_SINE,
  ): string {
    const id = fadeId || `fade-${Date.now()}-${Math.random()}`;
    const startTime = Date.now();

    // Get current values before canceling existing fade
    const channelFades: ChannelFade[] = channels.map((ch) => {
      // Get the actual interpolated value if available, otherwise get DMX value
      const channelKey = `${ch.universe}-${ch.channel}`;
      const interpolatedValue = this.currentInterpolatedValues.get(channelKey);
      const currentValue =
        interpolatedValue !== undefined
          ? Math.round(interpolatedValue)
          : dmxService.getChannelValue(ch.universe, ch.channel) || 0;
      return {
        universe: ch.universe,
        channel: ch.channel,
        startValue: currentValue,
        endValue: ch.targetValue,
        startTime,
        duration: duration * 1000, // Convert to milliseconds
      };
    });

    // Cancel any existing fade with the same ID after reading current values
    if (this.activeFades.has(id)) {
      this.activeFades.delete(id);
    }

    this.activeFades.set(id, {
      id,
      channels: channelFades,
      startTime,
      duration: duration * 1000,
      easingType,
      onComplete,
    });

    return id;
  }

  fadeToScene(
    sceneChannels: Array<{ universe: number; channel: number; value: number }>,
    fadeInTime: number,
    fadeId?: string,
    easingType?: EasingType,
  ): string {
    return this.fadeChannels(
      sceneChannels.map((ch) => ({
        universe: ch.universe,
        channel: ch.channel,
        targetValue: ch.value,
      })),
      fadeInTime,
      fadeId,
      undefined,
      easingType ?? EasingType.EASE_IN_OUT_SINE, // Use nullish coalescing to ensure default
    );
  }

  fadeToBlack(fadeOutTime: number, easingType?: EasingType): string {
    // Get all active channels
    const outputs = dmxService.getAllUniverseOutputs();
    const channels: Array<{
      universe: number;
      channel: number;
      targetValue: number;
    }> = [];

    outputs.forEach((output) => {
      output.channels.forEach((value, index) => {
        if (value > 0) {
          channels.push({
            universe: output.universe,
            channel: index + 1,
            targetValue: 0,
          });
        }
      });
    });

    return this.fadeChannels(
      channels,
      fadeOutTime,
      "fade-to-black",
      undefined,
      easingType ?? EasingType.EASE_IN_OUT_SINE,
    );
  }

  cancelFade(fadeId: string) {
    const fade = this.activeFades.get(fadeId);

    if (fade) {
      // Clean up interpolated values for this fade's channels
      fade.channels.forEach((channel) => {
        const channelKey = `${channel.universe}-${channel.channel}`;
        this.currentInterpolatedValues.delete(channelKey);
      });
    }
    this.activeFades.delete(fadeId);
  }

  cancelAllFades() {
    // Clean up all interpolated values
    this.currentInterpolatedValues.clear();
    this.activeFades.clear();
  }
}

export const fadeEngine = new FadeEngine();
