import * as os from 'os';
import { execSync } from 'child_process';

export interface NetworkInterfaceOption {
  name: string;
  address: string;
  broadcast: string;
  description: string;
  interfaceType: 'ethernet' | 'wifi' | 'other' | 'localhost' | 'global';
}

function getFallbackInterfaceType(ifaceName: string): 'ethernet' | 'wifi' | 'other' {
  // Fallback logic based on common interface naming patterns
  if (ifaceName === 'en0') {
    return 'wifi'; // en0 is typically WiFi on macOS
  } else if (ifaceName.startsWith('en') || ifaceName.startsWith('eth')) {
    return 'ethernet';
  } else {
    return 'other';
  }
}

function getInterfaceType(ifaceName: string): 'ethernet' | 'wifi' | 'other' {
  try {
    // Sanitize interface name to prevent command injection
    const sanitizedName = ifaceName.replace(/[^a-zA-Z0-9]/g, '');
    if (sanitizedName !== ifaceName) {
      // If sanitization changed the name, use fallback logic instead of shell command
      return getFallbackInterfaceType(ifaceName);
    }

    // On macOS, use networksetup to get hardware port information
    if (process.platform === 'darwin') {
      const output = execSync(`networksetup -listallhardwareports | grep -B2 "Device: ${sanitizedName}" | head -3`, 
        { encoding: 'utf8', timeout: 5000 }).toLowerCase();
      
      if (output.includes('wi-fi') || output.includes('wifi') || output.includes('wireless')) {
        return 'wifi';
      } else if (output.includes('usb') && (output.includes('lan') || output.includes('ethernet') || output.includes('100'))) {
        return 'ethernet'; // USB Ethernet
      } else if (output.includes('thunderbolt') || output.includes('ethernet') || output.includes('lan') || output.includes('wired')) {
        return 'ethernet';
      } else {
        return 'other';
      }
    }
    
    // Fallback for other platforms or if networksetup fails
    return getFallbackInterfaceType(ifaceName);
  } catch {
    // Fallback logic if command fails
    return getFallbackInterfaceType(ifaceName);
  }
}

function getTypeIcon(interfaceType: string): string {
  switch (interfaceType) {
    case 'wifi': return '📶';
    case 'ethernet': return '🌐';
    case 'other': return '📡';
    case 'localhost': return '🏠';
    case 'global': return '🌍';
    default: return '📡';
  }
}

export function getNetworkInterfaces(): NetworkInterfaceOption[] {
  const interfaces = os.networkInterfaces();
  
  const ethernetOptions: NetworkInterfaceOption[] = [];
  const wifiOptions: NetworkInterfaceOption[] = [];
  const otherOptions: NetworkInterfaceOption[] = [];

  // Process all network interfaces
  for (const [ifaceName, iface] of Object.entries(interfaces)) {
    if (!iface) {continue;}

    for (const config of iface) {
      // Only include IPv4 addresses that are not internal
      if (config.family === 'IPv4' && !config.internal) {
        const broadcastAddr = calculateBroadcast(config.address, config.netmask);
        
        // Only add broadcast option (no unicast) and only if broadcast is different from IP
        if (broadcastAddr && broadcastAddr !== config.address) {
          const interfaceType = getInterfaceType(ifaceName);
          const typeIcon = getTypeIcon(interfaceType);
          
          const option: NetworkInterfaceOption = {
            name: `${ifaceName}-broadcast`,
            address: config.address,
            broadcast: broadcastAddr,
            description: `${typeIcon} ${ifaceName} - ${interfaceType.charAt(0).toUpperCase() + interfaceType.slice(1)} Broadcast (${broadcastAddr})`,
            interfaceType
          };

          // Sort by interface type
          switch (interfaceType) {
            case 'ethernet':
              ethernetOptions.push(option);
              break;
            case 'wifi':
              wifiOptions.push(option);
              break;
            default:
              otherOptions.push(option);
              break;
          }
        }
      }
    }
  }

  // Build final sorted array: ethernet, wifi, other, localhost, global broadcast
  const options: NetworkInterfaceOption[] = [
    ...ethernetOptions,
    ...wifiOptions,
    ...otherOptions,
    {
      name: 'localhost',
      address: '127.0.0.1',
      broadcast: '127.0.0.1',
      description: `${getTypeIcon('localhost')} Localhost (for testing only)`,
      interfaceType: 'localhost'
    },
    {
      name: 'global-broadcast',
      address: '0.0.0.0',
      broadcast: '255.255.255.255',
      description: `${getTypeIcon('global')} Global Broadcast (255.255.255.255)`,
      interfaceType: 'global'
    }
  ];

  return options;
}

function calculateBroadcast(ip: string, netmask: string): string | null {
  try {
    const ipParts = ip.split('.').map(Number);
    const maskParts = netmask.split('.').map(Number);
    
    if (ipParts.length !== 4 || maskParts.length !== 4) {
      return null;
    }

    const broadcastParts = ipParts.map((ipPart, i) => 
      (ipPart & maskParts[i]) | (~maskParts[i] & 0xff)
    );

    return broadcastParts.join('.');
  } catch {
    return null;
  }
}

export function formatInterfaceTable(interfaces: NetworkInterfaceOption[]): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('Available Network Interface Options:');
  lines.push('='.repeat(60));
  
  interfaces.forEach((iface, index) => {
    lines.push(`[${index + 1}] ${iface.description}`);
    lines.push(`    Address: ${iface.address} -> ${iface.broadcast}`);
  });
  
  lines.push('='.repeat(60));
  return lines.join('\n');
}