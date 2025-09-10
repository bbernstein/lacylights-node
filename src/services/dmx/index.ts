import * as dgram from "dgram";
import { selectNetworkInterface, saveInterfacePreference } from '../../utils/interfaceSelector';

export interface UniverseOutput {
  universe: number;
  channels: number[];
}

export class DMXService {
  private universes: Map<number, number[]> = new Map();
  private channelOverrides: Map<string, number> = new Map(); // Key: "universe:channel"
  private currentActiveSceneId: string | null = null; // Track currently active scene
  private refreshRate: number = 44; // Hz
  private intervalId?: NodeJS.Timeout;
  private socket?: dgram.Socket;
  private artNetEnabled: boolean = true;
  private broadcastAddress: string = "255.255.255.255";
  private artNetPort: number = 6454;

  async initialize() {
    const universeCount = parseInt(process.env.DMX_UNIVERSE_COUNT || "4");
    const refreshRate = parseInt(process.env.DMX_REFRESH_RATE || "44");
    this.artNetEnabled = process.env.ARTNET_ENABLED !== "false";
    
    // Select network interface for Art-Net broadcast
    if (this.artNetEnabled) {
      const selectedInterface = await selectNetworkInterface();
      if (selectedInterface) {
        this.broadcastAddress = selectedInterface;
        saveInterfacePreference(selectedInterface);
      } else {
        this.broadcastAddress = "255.255.255.255";
      }
    }

    this.refreshRate = refreshRate;

    // Initialize Art-Net UDP socket
    if (this.artNetEnabled) {
      this.socket = dgram.createSocket("udp4");
      this.socket.bind(() => {
        this.socket!.setBroadcast(true);
      });
    }

    // Initialize universes with 512 channels each, all set to 0
    for (let i = 1; i <= universeCount; i++) {
      this.universes.set(i, new Array(512).fill(0));
    }

    console.log(
      `🎭 DMX Service initialized with ${universeCount} universes at ${refreshRate}Hz`,
    );
    if (this.artNetEnabled) {
      console.log(
        `📡 Art-Net output enabled, broadcasting to ${this.broadcastAddress}:${this.artNetPort}`,
      );
    } else {
      console.log(`📡 Art-Net output disabled (simulation mode)`);
    }

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
    if (!this.artNetEnabled || !this.socket) {
      return;
    }

    // Send Art-Net packets for each universe
    for (const [universe, channels] of this.universes.entries()) {
      this.sendArtNetPacket(universe, channels);
    }
  }

  private sendArtNetPacket(universe: number, channels: number[]) {
    // Apply channel overrides to the output
    const outputChannels = [...channels];
    for (let i = 0; i < 512; i++) {
      const overrideKey = `${universe}:${i + 1}`;
      if (this.channelOverrides.has(overrideKey)) {
        outputChannels[i] = this.channelOverrides.get(overrideKey)!;
      }
    }

    // Art-Net packet structure
    const packet = Buffer.alloc(530); // Header (18) + Data (512)

    // Art-Net header
    packet.write("Art-Net\0", 0); // ID (8 bytes)
    packet.writeUInt16LE(0x5000, 8); // OpCode for DMX (0x5000)
    packet.writeUInt16BE(14, 10); // Protocol version (14)
    packet.writeUInt8(0, 12); // Sequence (0 = no sequence)
    packet.writeUInt8(0, 13); // Physical input port (0)
    packet.writeUInt16LE(universe - 1, 14); // Universe (0-based in Art-Net)
    packet.writeUInt16BE(512, 16); // Data length (512 channels)

    // DMX data (512 channels)
    for (let i = 0; i < 512; i++) {
      packet.writeUInt8(outputChannels[i] || 0, 18 + i);
    }

    // Send the packet
    this.socket!.send(packet, this.artNetPort, this.broadcastAddress, (err) => {
      if (err) {
        console.error(`❌ Art-Net send error for universe ${universe}:`, err);
      }
    });
  }

  setChannelValue(universe: number, channel: number, value: number) {
    const universeData = this.universes.get(universe);
    if (universeData && channel >= 1 && channel <= 512) {
      const clampedValue = Math.max(0, Math.min(255, value));
      universeData[channel - 1] = clampedValue;
    }
  }

  getChannelValue(universe: number, channel: number): number {
    const universeData = this.universes.get(universe);
    if (universeData && channel >= 1 && channel <= 512) {
      return universeData[channel - 1];
    }
    return 0;
  }

  getUniverseOutput(universe: number): number[] {
    const baseChannels = this.universes.get(universe) || [];
    const outputChannels = [...baseChannels];
    
    // Apply overrides
    for (let i = 0; i < 512; i++) {
      const overrideKey = `${universe}:${i + 1}`;
      if (this.channelOverrides.has(overrideKey)) {
        outputChannels[i] = this.channelOverrides.get(overrideKey)!;
      }
    }
    
    return outputChannels;
  }

  getUniverseChannels(universe: number): number[] | null {
    const baseChannels = this.universes.get(universe);
    if (!baseChannels) {return null;}
    
    const outputChannels = [...baseChannels];
    
    // Apply overrides
    for (let i = 0; i < 512; i++) {
      const overrideKey = `${universe}:${i + 1}`;
      if (this.channelOverrides.has(overrideKey)) {
        outputChannels[i] = this.channelOverrides.get(overrideKey)!;
      }
    }
    
    return outputChannels;
  }

  setChannelOverride(universe: number, channel: number, value: number): void {
    if (channel >= 1 && channel <= 512) {
      const overrideKey = `${universe}:${channel}`;
      const clampedValue = Math.max(0, Math.min(255, value));
      this.channelOverrides.set(overrideKey, clampedValue);
    }
  }

  clearChannelOverride(universe: number, channel: number): void {
    const overrideKey = `${universe}:${channel}`;
    this.channelOverrides.delete(overrideKey);
  }

  clearAllOverrides(): void {
    this.channelOverrides.clear();
  }
  getAllUniverseOutputs(): UniverseOutput[] {
    const outputs: UniverseOutput[] = [];

    for (const [universe] of this.universes.entries()) {
      outputs.push({
        universe,
        channels: this.getUniverseOutput(universe), // This now includes overrides
      });
    }

    return outputs;
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    // Clear all channels and send one final packet with zeros
    for (const [universe, channels] of this.universes.entries()) {
      channels.fill(0);
      if (this.artNetEnabled && this.socket) {
        this.sendArtNetPacket(universe, channels);
      }
    }

    // Close Art-Net socket
    if (this.socket) {
      this.socket.close();
      this.socket = undefined;
    }

    console.log("🎭 DMX Service stopped");
  }

  // Active scene tracking methods
  setActiveScene(sceneId: string): void {
    this.currentActiveSceneId = sceneId;
  }

  getCurrentActiveSceneId(): string | null {
    return this.currentActiveSceneId;
  }

  clearActiveScene(): void {
    this.currentActiveSceneId = null;
  }
}

export const dmxService = new DMXService();
