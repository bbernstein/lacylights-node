import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../utils/logger";

const execAsync = promisify(exec);

/**
 * WiFi security types supported by NetworkManager
 */
export enum WiFiSecurityType {
  OPEN = "OPEN",
  WEP = "WEP",
  WPA_PSK = "WPA_PSK",
  WPA_EAP = "WPA_EAP",
  WPA3_PSK = "WPA3_PSK",
  WPA3_EAP = "WPA3_EAP",
  OWE = "OWE",
}

/**
 * WiFi network information from scan results
 */
export interface WiFiNetwork {
  ssid: string;
  signalStrength: number; // 0-100 percentage
  frequency: string; // "2.4 GHz" or "5 GHz"
  security: WiFiSecurityType;
  inUse: boolean;
  saved: boolean;
}

/**
 * Current WiFi connection status
 */
export interface WiFiStatus {
  available: boolean;
  enabled: boolean;
  connected: boolean;
  ssid?: string;
  signalStrength?: number;
  ipAddress?: string;
  macAddress?: string;
  frequency?: string;
}

/**
 * Result of a WiFi connection attempt
 */
export interface WiFiConnectionResult {
  success: boolean;
  message?: string;
  connected: boolean;
}

/**
 * WiFi error codes for specific error handling
 */
export enum WiFiErrorCode {
  SCAN_FAILED = "SCAN_FAILED",
  CONNECTION_FAILED = "CONNECTION_FAILED",
  INVALID_PASSWORD = "INVALID_PASSWORD",
  NETWORK_NOT_FOUND = "NETWORK_NOT_FOUND",
  ALREADY_CONNECTED = "ALREADY_CONNECTED",
  WIFI_DISABLED = "WIFI_DISABLED",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  NMCLI_NOT_FOUND = "NMCLI_NOT_FOUND",
}

/**
 * Custom error class for WiFi operations
 */
export class WiFiError extends Error {
  constructor(
    message: string,
    public code: WiFiErrorCode,
    public details?: string
  ) {
    super(message);
    this.name = "WiFiError";
  }
}

/**
 * WiFi service for managing WiFi connections using NetworkManager (nmcli)
 *
 * This service provides a high-level interface to NetworkManager for:
 * - Scanning available WiFi networks
 * - Connecting/disconnecting from WiFi networks
 * - Managing WiFi radio state (enable/disable)
 * - Querying connection status
 *
 * Requirements:
 * - NetworkManager must be installed and running
 * - The process must have permission to run nmcli commands
 *   (either via sudoers or netdev group membership)
 */
export class WiFiService {
  private wifiDevice: string;

  constructor(wifiDevice: string = "wlan0") {
    this.wifiDevice = wifiDevice;
  }

  /**
   * Check if nmcli is available on the system
   */
  private async checkNmcliAvailable(): Promise<boolean> {
    try {
      await execAsync("which nmcli");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if WiFi configuration is supported on this system
   *
   * Returns true if:
   * - NetworkManager (nmcli) is installed
   * - System has a WiFi device
   *
   * This allows the frontend to conditionally show WiFi configuration
   * only on systems that support it (e.g., Raspberry Pi with WiFi)
   * and hide it on systems that don't (e.g., macOS development machines)
   */
  async isWiFiSupported(): Promise<boolean> {
    // Check if nmcli is available
    if (!(await this.checkNmcliAvailable())) {
      logger.info("WiFi configuration not supported: NetworkManager (nmcli) not found");
      return false;
    }

    try {
      // Check if WiFi device exists
      const { stdout } = await execAsync("nmcli device status");
      const hasWiFiDevice = stdout.toLowerCase().includes("wifi") ||
                           stdout.includes(this.wifiDevice);

      if (!hasWiFiDevice) {
        logger.info("WiFi configuration not supported: No WiFi device found");
        return false;
      }

      logger.info("WiFi configuration is supported on this system");
      return true;
    } catch (error) {
      logger.warn("Error checking WiFi support", { error });
      return false;
    }
  }

  /**
   * Parse security type from nmcli output
   */
  private parseSecurityType(security: string): WiFiSecurityType {
    const securityUpper = security.toUpperCase();

    if (securityUpper.includes("WPA3") && securityUpper.includes("EAP")) {
      return WiFiSecurityType.WPA3_EAP;
    }
    if (securityUpper.includes("WPA3")) {
      return WiFiSecurityType.WPA3_PSK;
    }
    if (securityUpper.includes("WPA") && securityUpper.includes("EAP")) {
      return WiFiSecurityType.WPA_EAP;
    }
    if (securityUpper.includes("WPA")) {
      return WiFiSecurityType.WPA_PSK;
    }
    if (securityUpper.includes("WEP")) {
      return WiFiSecurityType.WEP;
    }
    if (securityUpper.includes("OWE")) {
      return WiFiSecurityType.OWE;
    }
    if (securityUpper === "--" || securityUpper === "") {
      return WiFiSecurityType.OPEN;
    }

    // Default to WPA_PSK if we can't determine
    return WiFiSecurityType.WPA_PSK;
  }

  /**
   * Parse frequency to human-readable format
   */
  private parseFrequency(chan: string): string {
    const chanNum = parseInt(chan, 10);
    if (chanNum >= 1 && chanNum <= 14) {
      return "2.4 GHz";
    } else if (chanNum >= 36) {
      return "5 GHz";
    }
    return "Unknown";
  }

  /**
   * Deduplicate WiFi networks by SSID
   * Keeps the entry with the strongest signal for each unique SSID
   * Preserves inUse and saved flags if ANY entry has them
   * Prefers 5 GHz frequency when signal strengths are similar
   *
   * @param networks - Array of WiFi networks to deduplicate
   * @returns Deduplicated array of networks
   */
  private deduplicateNetworks(networks: WiFiNetwork[]): WiFiNetwork[] {
    const networkMap = new Map<string, WiFiNetwork>();

    for (const network of networks) {
      const existing = networkMap.get(network.ssid);

      if (!existing) {
        // First occurrence of this SSID
        networkMap.set(network.ssid, network);
      } else {
        // Determine which network to keep
        const currentStrength = network.signalStrength;
        const existingStrength = existing.signalStrength;
        const strengthDiff = Math.abs(currentStrength - existingStrength);

        // If signal strengths are within 5%, prefer 5 GHz
        const shouldPreferCurrent =
          currentStrength > existingStrength ||
          (strengthDiff <= 5 && network.frequency === "5 GHz" && existing.frequency !== "5 GHz");

        // Merge flags - preserve true values from either entry
        const mergedNetwork: WiFiNetwork = {
          ...(shouldPreferCurrent ? network : existing),
          inUse: network.inUse || existing.inUse,
          saved: network.saved || existing.saved,
        };

        networkMap.set(network.ssid, mergedNetwork);
      }
    }

    // Convert back to array and sort by signal strength
    return Array.from(networkMap.values()).sort(
      (a, b) => b.signalStrength - a.signalStrength
    );
  }

  /**
   * Scan for available WiFi networks
   *
   * @param rescan - Whether to force a rescan (default: true)
   * @param deduplicate - Whether to deduplicate networks by SSID (default: true)
   * @returns Array of available WiFi networks
   * @throws WiFiError if scan fails
   */
  async scanNetworks(rescan: boolean = true, deduplicate: boolean = true): Promise<WiFiNetwork[]> {
    if (!(await this.checkNmcliAvailable())) {
      throw new WiFiError(
        "NetworkManager (nmcli) is not available on this system",
        WiFiErrorCode.NMCLI_NOT_FOUND
      );
    }

    try {
      // Scan networks with nmcli
      const rescanFlag = rescan ? "yes" : "no";
      const { stdout } = await execAsync(
        `nmcli --terse --fields SSID,SIGNAL,CHAN,SECURITY,IN-USE device wifi list --rescan ${rescanFlag}`
      );

      // Parse output
      const networks: WiFiNetwork[] = [];
      const lines = stdout.trim().split("\n");

      for (const line of lines) {
        if (!line.trim()) {continue;}

        const parts = line.split(":");
        if (parts.length < 5) {continue;}

        const [ssid, signal, chan, security, inUse] = parts;

        // Skip hidden networks (empty SSID)
        if (!ssid || ssid.trim() === "") {continue;}

        // Check if this network is saved
        const saved = await this.isNetworkSaved(ssid);

        networks.push({
          ssid: ssid.trim(),
          signalStrength: parseInt(signal, 10) || 0,
          frequency: this.parseFrequency(chan),
          security: this.parseSecurityType(security),
          inUse: inUse.trim() === "*",
          saved,
        });
      }

      // Sort by signal strength (strongest first)
      networks.sort((a, b) => b.signalStrength - a.signalStrength);

      // Deduplicate if requested
      const finalNetworks = deduplicate ? this.deduplicateNetworks(networks) : networks;

      logger.info(`WiFi scan found ${networks.length} networks${deduplicate ? ` (${finalNetworks.length} unique)` : ""}`);
      return finalNetworks;
    } catch (error) {
      logger.error("WiFi scan failed", { error });
      throw new WiFiError(
        "Failed to scan WiFi networks",
        WiFiErrorCode.SCAN_FAILED,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Check if a network is saved in NetworkManager
   */
  private async isNetworkSaved(ssid: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(
        `nmcli --terse --fields NAME connection show`
      );
      const connections = stdout
        .trim()
        .split("\n")
        .map((name) => name.trim());
      return connections.includes(ssid);
    } catch {
      return false;
    }
  }

  /**
   * Parse connection details from nmcli output
   *
   * @param output - The raw output from nmcli command
   * @returns A record of key-value pairs parsed from the output
   */
  private parseConnectionDetails(output: string): Record<string, string> {
    const details: Record<string, string> = {};
    output
      .trim()
      .split("\n")
      .forEach((line) => {
        const colonIndex = line.indexOf(":");
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim();
          const value = line.substring(colonIndex + 1).trim();
          if (key && value) {
            details[key] = value;
          }
        }
      });
    return details;
  }

  /**
   * Get current WiFi connection status
   *
   * @returns Current WiFi status information
   */
  async getStatus(): Promise<WiFiStatus> {
    // Check if WiFi is supported on this system
    const available = await this.isWiFiSupported();

    if (!available) {
      // WiFi not available on this system (e.g., macOS development machine)
      return {
        available: false,
        enabled: false,
        connected: false,
      };
    }

    try {
      // Check if WiFi is enabled
      const { stdout: radioStatus } = await execAsync("nmcli radio wifi");
      const enabled = radioStatus.trim().toLowerCase() === "enabled";

      if (!enabled) {
        return {
          available: true,
          enabled: false,
          connected: false,
        };
      }

      // Get active WiFi connection
      // Check both by device name and connection type for more robust detection
      const { stdout: activeConn } = await execAsync(
        `nmcli --terse --fields NAME,TYPE,DEVICE connection show --active`
      );

      const wifiConnection = activeConn
        .trim()
        .split("\n")
        .find((line) => {
          const parts = line.split(":");
          if (parts.length < 3) { return false; }

          // Check if device matches our WiFi device
          const device = parts[parts.length - 1]; // DEVICE is always last field
          if (device === this.wifiDevice) { return true; }

          // Also check for wireless connection types (handles various nmcli versions)
          const type = parts[parts.length - 2]; // TYPE is second to last
          return type && (
            type.includes("wireless") ||
            type.includes("wifi") ||
            type === "802-11-wireless"
          );
        });

      // If we didn't find a connection via active connections, check scan results
      // This is more reliable as scanNetworks successfully detects the connection
      if (!wifiConnection) {
        try {
          const networks = await this.scanNetworks(false);
          const activeNetwork = networks.find((n) => n.inUse);

          if (!activeNetwork) {
            return {
              available: true,
              enabled: true,
              connected: false,
            };
          }

          // We found an active network via scan, so we're connected
          // Get connection details by SSID
          logger.info(`Found active WiFi connection via scan: ${activeNetwork.ssid}`);

          // Try to get additional connection details
          try {
            // Get IP address from active connection
            const { stdout: connDetails } = await execAsync(
              `nmcli --terse --fields IP4.ADDRESS connection show --active`
            );

            const details = this.parseConnectionDetails(connDetails);

            // Get MAC address from device info (not connection info)
            let macAddress: string | undefined;
            try {
              const { stdout: deviceInfo } = await execAsync(
                `nmcli --terse --fields GENERAL.HWADDR device show ${this.wifiDevice}`
              );
              const macLine = deviceInfo.trim().split("\n").find(line => line.startsWith("GENERAL.HWADDR:"));
              if (macLine) {
                macAddress = macLine.split(":").slice(1).join(":");
              }
            } catch (macError) {
              logger.warn("Could not get MAC address", { error: macError });
            }

            return {
              available: true,
              enabled: true,
              connected: true,
              ssid: activeNetwork.ssid,
              signalStrength: activeNetwork.signalStrength,
              ipAddress: details["IP4.ADDRESS"]
                ? details["IP4.ADDRESS"].split("/")[0]
                : undefined,
              macAddress,
              frequency: activeNetwork.frequency,
            };
          } catch (detailsError) {
            logger.warn("Could not get detailed connection info", { error: detailsError });
            // Return basic connection info from scan
            return {
              available: true,
              enabled: true,
              connected: true,
              ssid: activeNetwork.ssid,
              signalStrength: activeNetwork.signalStrength,
              frequency: activeNetwork.frequency,
            };
          }
        } catch (scanError) {
          logger.warn("Could not scan networks for connection check", { error: scanError });
          return {
            available: true,
            enabled: true,
            connected: false,
          };
        }
      }

      const [connectionName] = wifiConnection.split(":");

      // Get connection details (without GENERAL.HWADDR which doesn't work in connection show)
      const { stdout: connDetails } = await execAsync(
        `nmcli --terse --fields connection.id,802-11-wireless.ssid,IP4.ADDRESS connection show "${connectionName}"`
      );

      const details = this.parseConnectionDetails(connDetails);

      // Get MAC address from device info (not connection info)
      let macAddress: string | undefined;
      try {
        const { stdout: deviceInfo } = await execAsync(
          `nmcli --terse --fields GENERAL.HWADDR device show ${this.wifiDevice}`
        );
        const macLine = deviceInfo.trim().split("\n").find(line => line.startsWith("GENERAL.HWADDR:"));
        if (macLine) {
          macAddress = macLine.split(":").slice(1).join(":");
        }
      } catch (macError) {
        logger.warn("Could not get MAC address", { error: macError });
      }

      // Get signal strength from device WiFi list
      const networks = await this.scanNetworks(false);
      const currentNetwork = networks.find((n) => n.inUse);

      return {
        available: true,
        enabled: true,
        connected: true,
        ssid: details["802-11-wireless.ssid"] || connectionName,
        signalStrength: currentNetwork?.signalStrength,
        ipAddress: details["IP4.ADDRESS"]
          ? details["IP4.ADDRESS"].split("/")[0]
          : undefined,
        macAddress,
        frequency: currentNetwork?.frequency,
      };
    } catch (error) {
      logger.error("Failed to get WiFi status", { error });
      // Return default status on error
      return {
        available: true,
        enabled: false,
        connected: false,
      };
    }
  }

  /**
   * Connect to a WiFi network
   *
   * @param ssid - Network SSID to connect to
   * @param password - Network password (optional for open networks)
   * @returns Connection result with success status
   * @throws WiFiError if connection fails
   */
  async connect(
    ssid: string,
    password?: string
  ): Promise<WiFiConnectionResult> {
    if (!(await this.checkNmcliAvailable())) {
      throw new WiFiError(
        "NetworkManager (nmcli) is not available on this system",
        WiFiErrorCode.NMCLI_NOT_FOUND
      );
    }

    // Check if WiFi is enabled
    const status = await this.getStatus();
    if (!status.enabled) {
      throw new WiFiError(
        "WiFi is disabled. Please enable WiFi first.",
        WiFiErrorCode.WIFI_DISABLED
      );
    }

    // Check if already connected to this network
    if (status.connected && status.ssid === ssid) {
      return {
        success: true,
        message: `Already connected to ${ssid}`,
        connected: true,
      };
    }

    try {
      logger.info(`Attempting to connect to WiFi network: ${ssid}`);

      // For WPA/WPA2 networks, we need to create a connection profile first
      // then activate it. This ensures proper key-mgmt configuration.
      const useSudo = process.platform === "linux";

      if (password) {
        // Create connection profile with proper WPA2-PSK settings
        const addCmd = useSudo ? "sudo nmcli" : "nmcli";
        const addCommand = `${addCmd} connection add type wifi con-name "${ssid}" ssid "${ssid}" wifi-sec.key-mgmt wpa-psk wifi-sec.psk "${password}"`;

        try {
          await execAsync(addCommand);
        } catch {
          // Connection might already exist, try to modify it instead
          const modifyCmd = `${addCmd} connection modify "${ssid}" wifi-sec.psk "${password}"`;
          await execAsync(modifyCmd);
        }

        // Activate the connection
        const upCmd = `${addCmd} connection up "${ssid}"`;
        await execAsync(upCmd);
      } else {
        // For open networks, use the simpler device wifi connect
        const command = `${useSudo ? "sudo nmcli" : "nmcli"} device wifi connect "${ssid}"`;
        await execAsync(command);
      }

      logger.info(`Successfully connected to WiFi network: ${ssid}`);
      return {
        success: true,
        message: `Connected to ${ssid}`,
        connected: true,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Failed to connect to WiFi network: ${ssid}`, {
        error: errorMessage,
      });

      // Parse error message for specific error codes
      if (errorMessage.includes("Secrets were required")) {
        throw new WiFiError(
          "Invalid or missing password",
          WiFiErrorCode.INVALID_PASSWORD,
          errorMessage
        );
      }
      if (errorMessage.includes("No network with SSID")) {
        throw new WiFiError(
          `Network "${ssid}" not found`,
          WiFiErrorCode.NETWORK_NOT_FOUND,
          errorMessage
        );
      }

      throw new WiFiError(
        `Failed to connect to ${ssid}`,
        WiFiErrorCode.CONNECTION_FAILED,
        errorMessage
      );
    }
  }

  /**
   * Disconnect from current WiFi network
   *
   * @returns Disconnection result
   * @throws WiFiError if disconnection fails
   */
  async disconnect(): Promise<WiFiConnectionResult> {
    if (!(await this.checkNmcliAvailable())) {
      throw new WiFiError(
        "NetworkManager (nmcli) is not available on this system",
        WiFiErrorCode.NMCLI_NOT_FOUND
      );
    }

    const status = await this.getStatus();

    if (!status.connected) {
      return {
        success: true,
        message: "No active WiFi connection",
        connected: false,
      };
    }

    try {
      logger.info(`Disconnecting from WiFi network: ${status.ssid}`);

      // Get the connection name using robust detection
      const { stdout } = await execAsync(
        `nmcli --terse --fields NAME,TYPE,DEVICE connection show --active`
      );

      const wifiConnection = stdout
        .trim()
        .split("\n")
        .find((line) => {
          const parts = line.split(":");
          if (parts.length < 3) {return false;}

          // Check if device matches our WiFi device
          const device = parts[parts.length - 1];
          if (device === this.wifiDevice) {return true;}

          // Also check for wireless connection types
          const type = parts[parts.length - 2];
          return type && (
            type.includes("wireless") ||
            type.includes("wifi") ||
            type === "802-11-wireless"
          );
        });

      if (!wifiConnection) {
        return {
          success: true,
          message: "No active WiFi connection found",
          connected: false,
        };
      }

      const [connectionName] = wifiConnection.split(":");

      // Disconnect using connection name (use sudo on Linux)
      const useSudo = process.platform === "linux";
      const command = useSudo
        ? `sudo nmcli connection down "${connectionName}"`
        : `nmcli connection down "${connectionName}"`;
      await execAsync(command);

      logger.info(`Successfully disconnected from WiFi network`);
      return {
        success: true,
        message: `Disconnected from ${status.ssid}`,
        connected: false,
      };
    } catch (error) {
      logger.error("Failed to disconnect from WiFi", { error });
      throw new WiFiError(
        "Failed to disconnect from WiFi",
        WiFiErrorCode.CONNECTION_FAILED,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Enable or disable WiFi radio
   *
   * @param enabled - True to enable, false to disable
   * @returns Updated WiFi status
   * @throws WiFiError if operation fails
   */
  async setEnabled(enabled: boolean): Promise<WiFiStatus> {
    if (!(await this.checkNmcliAvailable())) {
      throw new WiFiError(
        "NetworkManager (nmcli) is not available on this system",
        WiFiErrorCode.NMCLI_NOT_FOUND
      );
    }

    try {
      // Use sudo on Linux systems where nmcli requires elevated permissions
      const useSudo = process.platform === "linux";
      const command = enabled
        ? (useSudo ? "sudo nmcli radio wifi on" : "nmcli radio wifi on")
        : (useSudo ? "sudo nmcli radio wifi off" : "nmcli radio wifi off");
      await execAsync(command);

      logger.info(`WiFi ${enabled ? "enabled" : "disabled"}`);
      return await this.getStatus();
    } catch (error) {
      logger.error(`Failed to ${enabled ? "enable" : "disable"} WiFi`, {
        error,
      });
      throw new WiFiError(
        `Failed to ${enabled ? "enable" : "disable"} WiFi`,
        WiFiErrorCode.PERMISSION_DENIED,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Check if WiFi radio is enabled
   *
   * @returns True if WiFi is enabled
   */
  async isEnabled(): Promise<boolean> {
    if (!(await this.checkNmcliAvailable())) {
      return false;
    }

    try {
      const { stdout } = await execAsync("nmcli radio wifi");
      return stdout.trim().toLowerCase() === "enabled";
    } catch {
      return false;
    }
  }

  /**
   * Forget a saved WiFi network
   *
   * @param ssid - Network SSID to forget
   * @returns True if network was forgotten
   * @throws WiFiError if operation fails
   */
  async forgetNetwork(ssid: string): Promise<boolean> {
    if (!(await this.checkNmcliAvailable())) {
      throw new WiFiError(
        "NetworkManager (nmcli) is not available on this system",
        WiFiErrorCode.NMCLI_NOT_FOUND
      );
    }

    try {
      logger.info(`Forgetting WiFi network: ${ssid}`);

      // Check if network exists
      const saved = await this.isNetworkSaved(ssid);
      if (!saved) {
        logger.info(`Network ${ssid} is not saved`);
        return true;
      }

      // Delete the connection (use sudo on Linux)
      const useSudo = process.platform === "linux";
      const command = useSudo
        ? `sudo nmcli connection delete "${ssid}"`
        : `nmcli connection delete "${ssid}"`;
      await execAsync(command);

      logger.info(`Successfully forgot WiFi network: ${ssid}`);
      return true;
    } catch (error) {
      logger.error(`Failed to forget WiFi network: ${ssid}`, { error });
      throw new WiFiError(
        `Failed to forget network ${ssid}`,
        WiFiErrorCode.CONNECTION_FAILED,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Get list of saved WiFi networks
   *
   * @returns Array of saved WiFi networks
   */
  async getSavedNetworks(): Promise<WiFiNetwork[]> {
    if (!(await this.checkNmcliAvailable())) {
      throw new WiFiError(
        "NetworkManager (nmcli) is not available on this system",
        WiFiErrorCode.NMCLI_NOT_FOUND
      );
    }

    try {
      // Get all WiFi connections
      const { stdout } = await execAsync(
        `nmcli --terse --fields NAME,TYPE connection show`
      );

      const wifiConnections = stdout
        .trim()
        .split("\n")
        .filter((line) => line.includes(":802-11-wireless"))
        .map((line) => line.split(":")[0]);

      if (wifiConnections.length === 0) {
        return [];
      }

      // Get current scan results to find signal strength
      const scannedNetworks = await this.scanNetworks(false);

      // Build saved networks list
      const savedNetworks: WiFiNetwork[] = [];

      for (const ssid of wifiConnections) {
        // Try to find in scanned networks
        const scanned = scannedNetworks.find((n) => n.ssid === ssid);

        if (scanned) {
          savedNetworks.push(scanned);
        } else {
          // Network not in range, add with minimal info
          savedNetworks.push({
            ssid,
            signalStrength: 0,
            frequency: "Unknown",
            security: WiFiSecurityType.WPA_PSK,
            inUse: false,
            saved: true,
          });
        }
      }

      return savedNetworks;
    } catch (error) {
      logger.error("Failed to get saved WiFi networks", { error });
      return [];
    }
  }
}

// Export singleton instance
export const wifiService = new WiFiService();
