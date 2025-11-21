import dgram from 'dgram';
import { EventEmitter } from 'events';

/**
 * Parsed Art-Net packet structure
 */
export interface ArtNetPacket {
  header: string; // Should be "Art-Net\0"
  opcode: number; // Should be 0x5000 for DMX
  protocolVersion: number; // Should be 14
  sequence: number;
  physical: number;
  universe: number; // 0-based in Art-Net
  dataLength: number; // Should be 512
  dmxData: number[]; // 512 bytes of DMX channel values (0-255)
  timestamp: number; // When packet was captured
  rawBuffer: Buffer; // Complete raw packet
}

/**
 * Options for Art-Net packet capture
 */
export interface CaptureOptions {
  port?: number; // Default 6454
  timeout?: number; // Milliseconds to wait for packets, default 5000
  filterUniverse?: number; // Only capture specific universe
}

/**
 * Art-Net packet capture utility for testing
 * 
 * This class intercepts UDP packets on the Art-Net port (6454) to validate
 * that the DMX service is sending correct Art-Net packets with proper DMX data.
 */
export class ArtNetCapture extends EventEmitter {
  private socket?: dgram.Socket;
  private packets: ArtNetPacket[] = [];
  private isCapturing = false;
  private port: number;

  constructor(port?: number) {
    super();
    // Use provided port, or ARTNET_PORT env var, or default to 6454
    this.port = port ?? parseInt(process.env.ARTNET_PORT || "6454");
  }

  /**
   * Start capturing Art-Net packets
   */
  async start(): Promise<void> {
    if (this.isCapturing) {
      throw new Error('Already capturing');
    }

    this.packets = [];
    this.socket = dgram.createSocket('udp4');
    this.isCapturing = true;

    return new Promise((resolve, reject) => {
      this.socket!.on('error', (err) => {
        this.isCapturing = false;
        reject(err);
      });

      this.socket!.on('message', (msg, _rinfo) => {
        try {
          const packet = this.parsePacket(msg);
          this.packets.push(packet);
          this.emit('packet', packet);
        } catch (error) {
          // Invalid packet, skip
          this.emit('invalid-packet', { buffer: msg, error });
        }
      });

      // Bind to 0.0.0.0 (all interfaces) to receive packets sent to localhost
      this.socket!.bind(this.port, '0.0.0.0', () => {
        resolve();
      });
    });
  }

  /**
   * Stop capturing packets
   */
  async stop(): Promise<ArtNetPacket[]> {
    if (!this.isCapturing) {
      return this.packets;
    }

    return new Promise((resolve) => {
      if (this.socket) {
        this.socket.close(() => {
          this.isCapturing = false;
          resolve(this.packets);
        });
      } else {
        this.isCapturing = false;
        resolve(this.packets);
      }
    });
  }

  /**
   * Get all captured packets
   */
  getPackets(): ArtNetPacket[] {
    return [...this.packets];
  }

  /**
   * Get packets for a specific universe (1-based indexing like LacyLights)
   */
  getPacketsForUniverse(universe: number): ArtNetPacket[] {
    return this.packets.filter(p => p.universe === universe - 1); // Art-Net uses 0-based
  }

  /**
   * Clear all captured packets
   */
  clearPackets(): void {
    this.packets = [];
  }

  /**
   * Wait for a packet matching the given predicate
   * @param predicate Function to test each packet
   * @param timeout Milliseconds to wait, default 5000
   */
  async waitForPacket(
    predicate: (packet: ArtNetPacket) => boolean,
    timeout: number = 5000
  ): Promise<ArtNetPacket> {
    // Check existing packets first
    const existing = this.packets.find(predicate);
    if (existing) {
      return existing;
    }

    // Wait for new packet
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.off('packet', handler);
        reject(new Error(`Timeout waiting for Art-Net packet (${timeout}ms)`));
      }, timeout);

      const handler = (packet: ArtNetPacket) => {
        if (predicate(packet)) {
          clearTimeout(timeoutId);
          this.off('packet', handler);
          resolve(packet);
        }
      };

      this.on('packet', handler);
    });
  }

  /**
   * Wait for a packet for a specific universe with optional channel validation
   */
  async waitForUniversePacket(
    universe: number,
    channelValidator?: (dmxData: number[]) => boolean,
    timeout: number = 5000
  ): Promise<ArtNetPacket> {
    return this.waitForPacket((packet) => {
      if (packet.universe !== universe - 1) {return false;} // Art-Net is 0-based
      if (channelValidator && !channelValidator(packet.dmxData)) {return false;}
      return true;
    }, timeout);
  }

  /**
   * Parse Art-Net packet from buffer
   */
  private parsePacket(buffer: Buffer): ArtNetPacket {
    if (buffer.length < 530) {
      throw new Error(`Invalid Art-Net packet length: ${buffer.length}, expected at least 530`);
    }

    // Parse header
    const header = buffer.toString('ascii', 0, 8);
    if (header !== 'Art-Net\0') {
      throw new Error(`Invalid Art-Net header: ${JSON.stringify(header)}`);
    }

    // Parse opcode (should be 0x5000 for DMX)
    const opcode = buffer.readUInt16LE(8);
    if (opcode !== 0x5000) {
      throw new Error(`Invalid Art-Net opcode: 0x${opcode.toString(16)}, expected 0x5000`);
    }

    const protocolVersion = buffer.readUInt16BE(10);
    const sequence = buffer.readUInt8(12);
    const physical = buffer.readUInt8(13);
    const universe = buffer.readUInt16LE(14);
    const dataLength = buffer.readUInt16BE(16);

    if (dataLength !== 512) {
      throw new Error(`Invalid DMX data length: ${dataLength}, expected 512`);
    }

    // Extract DMX data (512 bytes)
    const dmxData: number[] = [];
    for (let i = 0; i < 512; i++) {
      dmxData.push(buffer.readUInt8(18 + i));
    }

    return {
      header,
      opcode,
      protocolVersion,
      sequence,
      physical,
      universe,
      dataLength,
      dmxData,
      timestamp: Date.now(),
      rawBuffer: buffer,
    };
  }

  /**
   * Validate Art-Net packet structure
   */
  static validatePacketStructure(packet: ArtNetPacket): void {
    if (packet.header !== 'Art-Net\0') {
      throw new Error(`Invalid header: ${JSON.stringify(packet.header)}`);
    }
    if (packet.opcode !== 0x5000) {
      throw new Error(`Invalid opcode: 0x${packet.opcode.toString(16)}`);
    }
    if (packet.protocolVersion !== 14) {
      throw new Error(`Invalid protocol version: ${packet.protocolVersion}`);
    }
    if (packet.dataLength !== 512) {
      throw new Error(`Invalid data length: ${packet.dataLength}`);
    }
    if (packet.dmxData.length !== 512) {
      throw new Error(`Invalid DMX data array length: ${packet.dmxData.length}`);
    }
  }

  /**
   * Validate DMX channel values in packet
   */
  static validateChannelValues(
    packet: ArtNetPacket,
    expectedValues: Map<number, number> // channel (1-512) -> value (0-255)
  ): void {
    for (const [channel, expectedValue] of expectedValues) {
      if (channel < 1 || channel > 512) {
        throw new Error(`Invalid channel number: ${channel}`);
      }
      const actualValue = packet.dmxData[channel - 1]; // DMX data is 0-indexed
      if (actualValue !== expectedValue) {
        throw new Error(
          `Channel ${channel} mismatch: expected ${expectedValue}, got ${actualValue}`
        );
      }
    }
  }

  /**
   * Get the most recent packet for a universe
   */
  getLatestPacketForUniverse(universe: number): ArtNetPacket | undefined {
    const packets = this.getPacketsForUniverse(universe);
    return packets.length > 0 ? packets[packets.length - 1] : undefined;
  }
}

/**
 * Helper function to capture Art-Net packets during a test operation
 * 
 * @example
 * const packets = await captureArtNetPackets(async () => {
 *   await executeGraphQLMutation(setSceneLive, { sceneId: 'scene-1' });
 * });
 * expect(packets).toHaveLength(1);
 * expect(packets[0].universe).toBe(0); // Universe 1 in LacyLights is 0 in Art-Net
 */
export async function captureArtNetPackets(
  operation: () => Promise<void>,
  options: CaptureOptions = {}
): Promise<ArtNetPacket[]> {
  const capture = new ArtNetCapture(options.port);

  try {
    await capture.start();

    // Give a small delay for socket to be ready
    await new Promise(resolve => setTimeout(resolve, 100));

    // Execute the operation
    await operation();

    // Wait a bit for packets to arrive
    const timeout = options.timeout || 1000;
    await new Promise(resolve => setTimeout(resolve, timeout));

    const packets = await capture.stop();

    // Filter by universe if specified
    if (options.filterUniverse !== undefined) {
      return packets.filter(p => p.universe === options.filterUniverse! - 1);
    }

    return packets;
  } finally {
    await capture.stop();
  }
}

/**
 * Assert that Art-Net packets were sent for specific universes
 */
export function assertPacketsForUniverses(
  packets: ArtNetPacket[],
  expectedUniverses: number[]
): void {
  const receivedUniverses = new Set(packets.map(p => p.universe + 1)); // Convert to 1-based
  const expected = new Set(expectedUniverses);

  for (const universe of expected) {
    if (!receivedUniverses.has(universe)) {
      throw new Error(`Expected Art-Net packet for universe ${universe} but none received`);
    }
  }
}

/**
 * Assert specific DMX channel values in captured packets
 */
export function assertDMXValues(
  packets: ArtNetPacket[],
  universe: number,
  expectedChannels: Map<number, number>
): void {
  const packet = packets.find(p => p.universe === universe - 1);
  if (!packet) {
    throw new Error(`No Art-Net packet found for universe ${universe}`);
  }

  ArtNetCapture.validateChannelValues(packet, expectedChannels);
}
