export interface UniverseOutput {
  universe: number;
  channels: number[];
}

export class DMXService {
  private universes: Map<number, number[]> = new Map();
  private refreshRate: number = 44; // Hz
  private intervalId?: NodeJS.Timeout;

  async initialize() {
    const universeCount = parseInt(process.env.DMX_UNIVERSE_COUNT || '4');
    const refreshRate = parseInt(process.env.DMX_REFRESH_RATE || '44');

    this.refreshRate = refreshRate;

    // Initialize universes with 512 channels each, all set to 0
    for (let i = 1; i <= universeCount; i++) {
      this.universes.set(i, new Array(512).fill(0));
    }

    console.log(`🎭 DMX Service initialized with ${universeCount} universes at ${refreshRate}Hz`);

    // Start the DMX output loop
    this.startOutputLoop();
  }

  private startOutputLoop() {
    const intervalMs = 1000 / this.refreshRate;

    this.intervalId = setInterval(() => {
      this.outputDMX();
    }, intervalMs);
  }

  private outputDMX() {
    // TODO: Implement actual DMX output
    // This will depend on the DMX interface being used
    // For now, this is a placeholder
  }

  setChannelValue(universe: number, channel: number, value: number) {
    const universeData = this.universes.get(universe);
    if (universeData && channel >= 1 && channel <= 512) {
      universeData[channel - 1] = Math.max(0, Math.min(255, value));
    }
  }

  getUniverseOutput(universe: number): number[] {
    return this.universes.get(universe) || [];
  }
  getAllUniverseOutputs(): UniverseOutput[] {
    const outputs: UniverseOutput[] = [];

    for (const [universe, channels] of this.universes.entries()) {
      outputs.push({
        universe,
        channels: [...channels], // Create a copy
      });
    }

    return outputs;
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    // Clear all channels
    for (const [universe, channels] of this.universes.entries()) {
      channels.fill(0);
    }

    console.log('🎭 DMX Service stopped');
  }
}

export const dmxService = new DMXService();
