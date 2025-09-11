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
  private idleRate: number = 1; // Hz when no changes detected
  private intervalId?: NodeJS.Timeout;
  private socket?: dgram.Socket;
  private artNetEnabled: boolean = true;
  private broadcastAddress: string = "255.255.255.255";
  private artNetPort: number = 6454;
  
  // Adaptive transmission rate management
  private lastTransmittedState: Map<number, number[]> = new Map();
  private lastChangeTime: number = 0;
  private currentRate: number = 44;
  private highRateDuration: number = 2000; // Keep high rate for 2 seconds after last change
  private isInHighRateMode: boolean = false;

  async initialize() {
    const universeCount = parseInt(process.env.DMX_UNIVERSE_COUNT || "4");
    const refreshRate = parseInt(process.env.DMX_REFRESH_RATE || "44");
    const idleRate = parseInt(process.env.DMX_IDLE_RATE || "1");
    const highRateDuration = parseInt(process.env.DMX_HIGH_RATE_DURATION || "2000");
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
    this.idleRate = idleRate;
    this.highRateDuration = highRateDuration;
    this.currentRate = refreshRate;

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
      this.lastTransmittedState.set(i, new Array(512).fill(0));
    }

    console.log(
      `🎭 DMX Service initialized with ${universeCount} universes`,
    );
    console.log(
      `📡 Adaptive transmission: ${refreshRate}Hz (active) / ${idleRate}Hz (idle), ${highRateDuration}ms high-rate duration`,
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
    this.scheduleNextTransmission();
  }

  private scheduleNextTransmission() {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
    }

    const intervalMs = 1000 / this.currentRate;
    // Using setTimeout with recursive calls instead of setInterval allows dynamic rate changes
    // and precise control over transmission timing. Any timing drift is negligible for DMX.
    this.intervalId = setTimeout(() => {
      this.processTransmission();
      this.scheduleNextTransmission();
    }, intervalMs);
  }

  private processTransmission() {
    const currentTime = Date.now();
    let hasChanges = false;

    // Check if any channels have changed since last transmission (only if Art-Net is enabled)
    if (this.artNetEnabled && this.socket) {
      for (const [universe] of this.universes.entries()) {
        const outputChannels = this.getUniverseOutputChannels(universe);
        const lastTransmitted = this.lastTransmittedState.get(universe) || [];
        
        // Compare current state with last transmitted state
        if (!this.arraysEqual(outputChannels, lastTransmitted)) {
          hasChanges = true;
          break;
        }
      }
    }

    // Update transmission rate based on changes
    if (hasChanges) {
      this.lastChangeTime = currentTime;
      if (!this.isInHighRateMode) {
        this.isInHighRateMode = true;
        this.currentRate = this.refreshRate;
        console.log(`📡 DMX transmission: switching to high rate (${this.refreshRate}Hz) - changes detected`);
      }
    } else {
      // Check if we should switch to idle rate
      const timeSinceLastChange = currentTime - this.lastChangeTime;
      if (this.isInHighRateMode && timeSinceLastChange > this.highRateDuration) {
        this.isInHighRateMode = false;
        this.currentRate = this.idleRate;
        console.log(`📡 DMX transmission: switching to idle rate (${this.idleRate}Hz) - no changes for ${timeSinceLastChange}ms`);
      }
    }

    // Transmit when we have changes or when we're in idle mode (for keep-alive)
    if (this.artNetEnabled && this.socket && (hasChanges || !this.isInHighRateMode)) {
      this.outputDMX();
    }
  }

  private outputDMX() {
    // Send Art-Net packets for each universe and update transmitted state
    for (const [universe] of this.universes.entries()) {
      const outputChannels = this.getUniverseOutputChannels(universe);
      this.sendArtNetPacket(universe, outputChannels);
      
      // Update last transmitted state
      this.lastTransmittedState.set(universe, [...outputChannels]);
    }
  }

  private getUniverseOutputChannels(universe: number): number[] {
    const baseChannels = this.universes.get(universe) || new Array(512).fill(0);
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

  private arraysEqual(a: number[], b: number[]): boolean {
    if (a.length !== b.length) { return false; }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) { return false; }
    }
    return true;
  }

  private sendArtNetPacket(universe: number, channels: number[]) {
    // Channels already have overrides applied by getUniverseOutputChannels

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
      packet.writeUInt8(channels[i] || 0, 18 + i);
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
      // Trigger change detection immediately for responsive fades
      this.triggerChangeDetection();
    }
  }

  setChannelOverride(universe: number, channel: number, value: number): void {
    if (channel >= 1 && channel <= 512) {
      const overrideKey = `${universe}:${channel}`;
      const clampedValue = Math.max(0, Math.min(255, value));
      this.channelOverrides.set(overrideKey, clampedValue);
      // Trigger change detection for overrides
      this.triggerChangeDetection();
    }
  }

  clearChannelOverride(universe: number, channel: number): void {
    const overrideKey = `${universe}:${channel}`;
    if (this.channelOverrides.has(overrideKey)) {
      this.channelOverrides.delete(overrideKey);
      // Trigger change detection when removing overrides
      this.triggerChangeDetection();
    }
  }

  clearAllOverrides(): void {
    if (this.channelOverrides.size > 0) {
      this.channelOverrides.clear();
      // Trigger change detection when clearing all overrides
      this.triggerChangeDetection();
    }
  }

  // Method to manually trigger high-rate transmission (useful for fades, scene changes)
  triggerChangeDetection(): void {
    this.lastChangeTime = Date.now();
    if (!this.isInHighRateMode) {
      this.isInHighRateMode = true;
      this.currentRate = this.refreshRate;
      console.log(`📡 DMX transmission: manual trigger to high rate (${this.refreshRate}Hz)`);
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
      clearTimeout(this.intervalId);
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

  // Transmission status methods
  getTransmissionStatus() {
    return {
      currentRate: this.currentRate,
      isInHighRateMode: this.isInHighRateMode,
      lastChangeTime: this.lastChangeTime,
      timeSinceLastChange: Date.now() - this.lastChangeTime,
      refreshRate: this.refreshRate,
      idleRate: this.idleRate,
      highRateDuration: this.highRateDuration,
    };
  }

  getCurrentTransmissionRate(): number {
    return this.currentRate;
  }

  isInHighRate(): boolean {
    return this.isInHighRateMode;
  }
}

export const dmxService = new DMXService();
