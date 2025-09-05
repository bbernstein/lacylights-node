import * as os from 'os';

export interface NetworkInterfaceOption {
  name: string;
  address: string;
  broadcast: string;
  description: string;
}

export function getNetworkInterfaces(): NetworkInterfaceOption[] {
  const interfaces = os.networkInterfaces();
  const options: NetworkInterfaceOption[] = [];

  // Add localhost option first
  options.push({
    name: 'localhost',
    address: '127.0.0.1',
    broadcast: '127.0.0.1',
    description: 'Localhost (for testing only)'
  });

  // Process all network interfaces
  for (const [ifaceName, iface] of Object.entries(interfaces)) {
    if (!iface) continue;

    for (const config of iface) {
      // Only include IPv4 addresses
      if (config.family === 'IPv4' && !config.internal) {
        const broadcastAddr = calculateBroadcast(config.address, config.netmask);
        
        // Add unicast option (direct to interface IP)
        options.push({
          name: `${ifaceName}-unicast`,
          address: config.address,
          broadcast: config.address,
          description: `${ifaceName} - Unicast (${config.address})`
        });

        // Add broadcast option if we could calculate it
        if (broadcastAddr) {
          options.push({
            name: `${ifaceName}-broadcast`,
            address: config.address,
            broadcast: broadcastAddr,
            description: `${ifaceName} - Broadcast (${broadcastAddr})`
          });
        }
      }
    }
  }

  // Add global broadcast option
  options.push({
    name: 'global-broadcast',
    address: '0.0.0.0',
    broadcast: '255.255.255.255',
    description: 'Global Broadcast (255.255.255.255)'
  });

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
  lines.push('=' .repeat(60));
  
  interfaces.forEach((iface, index) => {
    lines.push(`[${index + 1}] ${iface.description}`);
    lines.push(`    Address: ${iface.address} -> ${iface.broadcast}`);
  });
  
  lines.push('=' .repeat(60));
  return lines.join('\n');
}