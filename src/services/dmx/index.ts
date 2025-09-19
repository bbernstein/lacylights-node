import * as dgram from "dgram";
import { selectNetworkInterface, saveInterfacePreference } from '../../utils/interfaceSelector';
import { logger } from '../../utils/logger';

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

  // Performance optimization: dirty flag system
  private isDirty: boolean = false; // Tracks if any channels have changed since last transmission
  private dirtyUniverses: Set<number> = new Set(); // Tracks which universes have changes
  private lastTransmissionTime: number = 0; // For timing precision tracking
  
  // Timing drift monitoring (throttled to avoid console spam)
  private lastDriftWarningTime: number = 0;
  private driftWarningThrottle: number = 5000; // Only warn every 5 seconds max
  private significantDriftThreshold: number = 50; // Only warn for drifts > 50ms

  async initialize() {
    const universeCount = parseInt(process.env.DMX_UNIVERSE_COUNT || "4");
    const refreshRate = parseInt(process.env.DMX_REFRESH_RATE || "44");
    const idleRate = parseInt(process.env.DMX_IDLE_RATE || "1");
    const highRateDuration = parseInt(process.env.DMX_HIGH_RATE_DURATION || "2000");
    this.artNetEnabled = process.env.ARTNET_ENABLED !== "false";
    
    // Configure timing monitoring (can be disabled for production)
    this.significantDriftThreshold = parseInt(process.env.DMX_DRIFT_THRESHOLD || "50");
    this.driftWarningThrottle = parseInt(process.env.DMX_DRIFT_THROTTLE || "5000");
    
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

    logger.info(
      `🎭 DMX Service initialized with ${universeCount} universes`,
    );
    logger.info(
      `📡 Adaptive transmission: ${refreshRate}Hz (active) / ${idleRate}Hz (idle), ${highRateDuration}ms high-rate duration`,
    );
    if (this.artNetEnabled) {
      logger.info(
        `📡 Art-Net output enabled, broadcasting to ${this.broadcastAddress}:${this.artNetPort}`,
      );
    } else {
      logger.info(`📡 Art-Net output disabled (simulation mode)`);
    }
    
    // Log timing monitoring configuration
    if (this.significantDriftThreshold > 0) {
      logger.info(
        `⏱️  Timing monitoring: warn if drift >${this.significantDriftThreshold}ms, throttle ${this.driftWarningThrottle}ms`,
      );
    } else {
      logger.info(`⏱️  Timing monitoring: disabled`);
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
    
    // Calculate actual transmission interval for timing precision tracking
    const actualInterval = this.lastTransmissionTime > 0 ? currentTime - this.lastTransmissionTime : 0;
    const expectedInterval = 1000 / this.currentRate;
    
    // Throttled timing drift monitoring (only for significant drifts, max once per 5 seconds)
    // Set DMX_DRIFT_THRESHOLD=0 to disable timing monitoring entirely
    if (this.significantDriftThreshold > 0 && actualInterval > 0 && Math.abs(actualInterval - expectedInterval) > this.significantDriftThreshold) {
      if (currentTime - this.lastDriftWarningTime > this.driftWarningThrottle) {
        logger.warn(`⚠️  DMX timing drift detected: expected ${expectedInterval.toFixed(1)}ms, actual ${actualInterval}ms (drift: ${(actualInterval - expectedInterval).toFixed(1)}ms)`);
        this.lastDriftWarningTime = currentTime;
      }
    }

    // Use dirty flag system for efficient change detection
    const hasChanges = this.isDirty;

    // Update transmission rate based on changes
    if (hasChanges) {
      this.lastChangeTime = currentTime;
      if (!this.isInHighRateMode) {
        this.isInHighRateMode = true;
        this.currentRate = this.refreshRate;
        logger.info(`📡 DMX transmission: switching to high rate (${this.refreshRate}Hz) - changes detected`);
      }
    } else {
      // Check if we should switch to idle rate
      const timeSinceLastChange = currentTime - this.lastChangeTime;
      if (this.isInHighRateMode && this.lastChangeTime > 0 && timeSinceLastChange > this.highRateDuration) {
        this.isInHighRateMode = false;
        this.currentRate = this.idleRate;
        logger.info(`📡 DMX transmission: switching to idle rate (${this.idleRate}Hz) - no changes for ${timeSinceLastChange}ms`);
      }
    }

    // Transmit when we have changes (in high rate mode), or always in idle mode (for keep-alive)
    if (this.artNetEnabled && this.socket && (this.isInHighRateMode ? hasChanges : true)) {
      this.outputDMX();
      this.lastTransmissionTime = currentTime;
    }
  }

  private outputDMX() {
    // Determine which universes to transmit
    let universesToTransmit: number[];
    if (this.isDirty) {
      if (this.dirtyUniverses.size > 0) {
        universesToTransmit = Array.from(this.dirtyUniverses);
      } else {
        // This should never happen; log error and return early to catch logic bugs
        logger.error("Logical inconsistency: isDirty is true but dirtyUniverses is empty. No universes to transmit.");
        return;
      }
    } else {
      // In idle mode, transmit all for keep-alive
      universesToTransmit = Array.from(this.universes.keys());
    }

    // Send Art-Net packets for universes and update transmitted state
    for (const universe of universesToTransmit) {
      const outputChannels = this.getUniverseOutputChannels(universe);
      this.sendArtNetPacket(universe, outputChannels);
      
      // Update last transmitted state
      this.lastTransmittedState.set(universe, [...outputChannels]);
    }

    // Clear dirty flags after successful transmission
    this.isDirty = false;
    this.dirtyUniverses.clear();
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


  /**
   * Sends an Art-Net packet for the given universe.
   * 
   * @param universe The DMX universe number.
   * @param channels An array of 512 DMX channel values (0-255), with all channel overrides already applied.
   *                 This should be the result of getUniverseOutputChannels().
   */
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
        logger.error(`Art-Net send error for universe ${universe}`, { error: err, universe });
      }
    });
  }

  setChannelValue(universe: number, channel: number, value: number) {
    const universeData = this.universes.get(universe);
    if (universeData && channel >= 1 && channel <= 512) {
      const clampedValue = Math.max(0, Math.min(255, value));
      const currentValue = universeData[channel - 1];
      
      // Only mark dirty if value actually changed
      if (currentValue !== clampedValue) {
        universeData[channel - 1] = clampedValue;
        this.markDirty(universe);
        // Trigger change detection immediately for responsive fades
        this.triggerChangeDetection();
      }
    }
  }

  setChannelOverride(universe: number, channel: number, value: number): void {
    if (channel >= 1 && channel <= 512) {
      const overrideKey = `${universe}:${channel}`;
      const clampedValue = Math.max(0, Math.min(255, value));
      const currentValue = this.channelOverrides.get(overrideKey);
      
      // Only mark dirty if override value actually changed
      if (currentValue !== clampedValue) {
        this.channelOverrides.set(overrideKey, clampedValue);
        this.markDirty(universe);
        // Trigger change detection for overrides
        this.triggerChangeDetection();
      }
    }
  }

  clearChannelOverride(universe: number, channel: number): void {
    const overrideKey = `${universe}:${channel}`;
    if (this.channelOverrides.has(overrideKey)) {
      this.channelOverrides.delete(overrideKey);
      this.markDirty(universe);
      // Trigger change detection when removing overrides
      this.triggerChangeDetection();
    }
  }

  clearAllOverrides(): void {
    if (this.channelOverrides.size > 0) {
      // Mark all affected universes as dirty
      for (const overrideKey of this.channelOverrides.keys()) {
        const universe = parseInt(overrideKey.split(':')[0]);
        this.markDirty(universe);
      }
      this.channelOverrides.clear();
      // Trigger change detection when clearing all overrides
      this.triggerChangeDetection();
    }
  }

  // Helper method to mark a universe as dirty
  private markDirty(universe: number): void {
    this.isDirty = true;
    this.dirtyUniverses.add(universe);
  }

  // Method to manually trigger high-rate transmission (useful for fades, scene changes)
  triggerChangeDetection(): void {
    this.lastChangeTime = Date.now();
    if (!this.isInHighRateMode) {
      this.isInHighRateMode = true;
      this.currentRate = this.refreshRate;
      logger.info(`📡 DMX transmission: manual trigger to high rate (${this.refreshRate}Hz)`);
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

    logger.info("🎭 DMX Service stopped");
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
      // Performance optimization status
      isDirty: this.isDirty,
      dirtyUniverseCount: this.dirtyUniverses.size,
      dirtyUniverses: Array.from(this.dirtyUniverses),
      totalUniverses: this.universes.size,
      lastTransmissionTime: this.lastTransmissionTime,
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
