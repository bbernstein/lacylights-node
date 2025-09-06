/* eslint-disable no-console */
import * as readlineSync from 'readline-sync';
import { getNetworkInterfaces, formatInterfaceTable } from './networkInterfaces';

export async function selectNetworkInterface(): Promise<string | null> {
  // Check if ARTNET_BROADCAST is already set
  if (process.env.ARTNET_BROADCAST) {
    console.log(`📡 Using Art-Net broadcast address from environment: ${process.env.ARTNET_BROADCAST}`);
    return process.env.ARTNET_BROADCAST;
  }

  // Check if we're in non-interactive mode
  if (process.env.NON_INTERACTIVE === 'true' || process.env.CI === 'true') {
    console.log('📡 Non-interactive mode detected, using default broadcast address: 255.255.255.255');
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

    console.log(formatInterfaceTable(interfaces));
    console.log('\n📡 Select Art-Net broadcast destination:');
    console.log('   (This determines where DMX data will be sent)');
    console.log('   Press Enter for default (Global Broadcast)\n');

    const defaultIndex = interfaces.findIndex(i => i.name === 'global-broadcast');
    const answer = readlineSync.question(`Select option [1-${interfaces.length}] (default: ${defaultIndex + 1}): `);
    
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
    console.error('❌ Error during interface selection:', error);
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