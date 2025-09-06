#!/usr/bin/env tsx

import { PrismaClient } from "@prisma/client";
import { FixtureSetupService } from "../src/services/fixtureSetupService";

const prisma = new PrismaClient();

async function main() {
  try {
    console.log("🔍 Checking fixture definitions in database...");
    
    const fixtureCount = await prisma.fixtureDefinition.count();
    
    if (fixtureCount === 0) {
      console.log("📦 No fixture definitions found. Starting import from Open Fixture Library...");
      await FixtureSetupService.ensureFixturesPopulated();
      
      const newCount = await prisma.fixtureDefinition.count();
      console.log(`✅ Successfully imported ${newCount} fixture definitions!`);
    } else {
      console.log(`✓ Found ${fixtureCount} fixture definitions in database. Skipping import.`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error checking/importing fixtures:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();