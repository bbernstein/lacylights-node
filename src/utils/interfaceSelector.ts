/* eslint-disable no-console */
import * as readline from 'readline';
import { getNetworkInterfaces, formatInterfaceTable } from './networkInterfaces';
import { logger } from './logger';

export async function selectNetworkInterface(): Promise<string | null> {
  // Check if ARTNET_BROADCAST is already set
  if (process.env.ARTNET_BROADCAST) {
    console.log(`📡 Using Art-Net broadcast address from environment: ${process.env.ARTNET_BROADCAST}`);
    return process.env.ARTNET_BROADCAST;
  }

  // Check if we're in non-interactive mode or stdout is redirected
  if (process.env.NON_INTERACTIVE === 'true' || process.env.CI === 'true' || !process.stdout.isTTY) {
    let reason = '';
    if (!process.stdout.isTTY) {
      reason = 'stdout redirected';
    } else if (process.env.NON_INTERACTIVE === 'true') {
      reason = 'NON_INTERACTIVE environment variable';
    } else if (process.env.CI === 'true') {
      reason = 'CI environment variable';
    } else {
      reason = 'non-interactive mode';
    }

    // Get interfaces to use first available instead of global broadcast
    const interfaces = getNetworkInterfaces();
    if (interfaces.length > 0) {
      const defaultAddress = interfaces[0].broadcast;
      console.log(`📡 ${reason} detected, using first available interface broadcast address: ${defaultAddress}`);
      return defaultAddress;
    } else {
      console.log(`📡 ${reason} detected, no network interfaces found, using default broadcast address: 255.255.255.255`);
    }
    return '255.255.255.255';
  }

  // Check if Art-Net is disabled
  if (process.env.ARTNET_ENABLED === 'false') {
    console.log('📡 Art-Net is disabled, skipping interface selection');
    return null;
  }

  try {
    const interfaces = getNetworkInterfaces();
    
    if (interfaces.length === 0) {
      console.log('⚠️  No network interfaces found, using default broadcast');
      return '255.255.255.255';
    }

    const defaultIndex = 0; // Use first option as default
    
    // Output all interface information and ensure it's flushed before readline
    process.stdout.write(formatInterfaceTable(interfaces) + '\n');
    process.stdout.write('\n📡 Select Art-Net broadcast destination:\n');
    process.stdout.write('   (This determines where DMX data will be sent)\n');
    process.stdout.write('   Press Enter for default (first option)\n');
    
    process.stdout.write('\n');
    
    // Force flush all output before creating readline interface
    await new Promise(resolve => {
      process.stdout.write('', () => {
        // Add a small delay to ensure output is fully flushed
        setTimeout(resolve, 10);
      });
    });
    
    // Temporarily remove all stdin listeners to prevent tsx interference
    const originalListeners = process.stdin.listeners('data').slice();
    const originalKeyListeners = process.stdin.listeners('keypress').slice();
    
    // Remove all existing stdin listeners
    process.stdin.removeAllListeners('data');
    process.stdin.removeAllListeners('keypress');
    
    // Ensure stdin is not in raw mode
    const wasRaw = process.stdin.isRaw;
    if (process.stdin.isTTY && process.stdin.isRaw) {
      process.stdin.setRawMode(false);
    }
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });
    
    const answer = await new Promise<string>((resolve) => {
      rl.question(`Select option [1-${interfaces.length}] (default: ${defaultIndex + 1}): `, (input) => {
        rl.close();
        
        // Restore original listeners after a delay
        setTimeout(() => {
          originalListeners.forEach(listener => process.stdin.on('data', listener as (data: Buffer) => void));
          originalKeyListeners.forEach(listener => process.stdin.on('keypress', listener as (str: string, key: object) => void));
          
          // Restore raw mode if it was enabled
          if (process.stdin.isTTY && wasRaw) {
            process.stdin.setRawMode(true);
          }
        }, 100);
        
        resolve(input);
      });
    });
    
    let selectedIndex: number;
    
    if (answer.trim() === '') {
      selectedIndex = defaultIndex;
    } else {
      selectedIndex = parseInt(answer) - 1;
      
      if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= interfaces.length) {
        console.log('⚠️  Invalid selection, using default broadcast');
        selectedIndex = defaultIndex;
      }
    }

    const selected = interfaces[selectedIndex];
    console.log(`✅ Selected: ${selected.description}`);
    console.log(`   Broadcasting to: ${selected.broadcast}\n`);
    
    return selected.broadcast;
  } catch (error) {
    logger.error('Error during interface selection', { error });
    console.log('   Using default broadcast address: 255.255.255.255');
    return '255.255.255.255';
  }
}

export function saveInterfacePreference(address: string): void {
  // You could save this to a local config file if you want persistence
  // For now, we'll just log a suggestion
  console.log('\n💡 Tip: To skip this prompt next time, you can:');
  console.log(`   1. Set ARTNET_BROADCAST=${address} in your .env file`);
  console.log(`   2. Or run: export ARTNET_BROADCAST=${address}`);
  console.log('');
}