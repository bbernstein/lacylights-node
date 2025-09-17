import fs from 'fs';
import path from 'path';
import * as xml2js from 'xml2js';

export interface QLCFixtureDefinition {
  manufacturer: string;
  model: string;
  type: string;
  modes: QLCFixtureMode[];
  channels: QLCChannelDefinition[];
}

export interface QLCFixtureMode {
  name: string;
  channelCount: number;
  channels: { number: number; name: string }[];
}

export interface QLCChannelDefinition {
  name: string;
  preset?: string;
}

export interface LacyLightsFixtureDetails {
  manufacturer: string;
  model: string;
  mode?: string;
  channelCount: number;
  channels: {
    offset: number;
    name: string;
    type: string; // LacyLights channel types like RED, GREEN, BLUE, etc.
  }[];
}

export interface FixtureCompatibilityScore {
  fixture: QLCFixtureDefinition;
  mode: QLCFixtureMode;
  score: number;
  reasons: string[];
}

export interface FixtureMapping {
  lacyLightsKey: string; // "manufacturer/model"
  qlcManufacturer: string;
  qlcModel: string;
  qlcMode: string;
}

export class QLCFixtureLibrary {
  private fixtures: Map<string, QLCFixtureDefinition> = new Map();
  private fixtureListPath: string;
  
  constructor(qlcFixturesPath?: string) {
    // Use the provided path, or the QLC_FIXTURES_PATH environment variable, or default to local resources
    this.fixtureListPath = qlcFixturesPath 
      || process.env.QLC_FIXTURES_PATH 
      || path.join(__dirname, '../../resources/qlc-fixtures');
  }

  async loadFixtureLibrary(): Promise<void> {
    if (!fs.existsSync(this.fixtureListPath)) {
      throw new Error(`QLC+ fixtures path not found: ${this.fixtureListPath}`);
    }

    const manufacturerDirs = fs.readdirSync(this.fixtureListPath)
      .filter(dir => fs.statSync(path.join(this.fixtureListPath, dir)).isDirectory());
    
    for (const manufacturerDir of manufacturerDirs) {
      const manufacturerPath = path.join(this.fixtureListPath, manufacturerDir);
      const fixtureFiles = fs.readdirSync(manufacturerPath)
        .filter(file => file.endsWith('.qxf'));
      
      for (const fixtureFile of fixtureFiles) {
        try {
          const fixturePath = path.join(manufacturerPath, fixtureFile);
          const fixtureData = await this.parseFixtureFile(fixturePath);
          if (fixtureData) {
            const key = `${fixtureData.manufacturer}/${fixtureData.model}`;
            this.fixtures.set(key, fixtureData);
          }
        } catch {
          // Silently skip fixtures that fail to parse
          continue;
        }
      }
    }
  }

  private async parseFixtureFile(filePath: string): Promise<QLCFixtureDefinition | null> {
    try {
      const xmlContent = fs.readFileSync(filePath, 'utf8');
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(xmlContent);
      
      const fixtureDef = result.FixtureDefinition;
      if (!fixtureDef) {return null;}

      const manufacturer = fixtureDef.Manufacturer?.[0] || 'Unknown';
      const model = fixtureDef.Model?.[0] || 'Unknown';
      const type = fixtureDef.Type?.[0] || 'Other';

      // Parse channels
      const channels: QLCChannelDefinition[] = [];
      if (fixtureDef.Channel) {
        for (const channelData of fixtureDef.Channel) {
          channels.push({
            name: channelData.$.Name || 'Unknown',
            preset: channelData.$.Preset,
          });
        }
      }

      // Parse modes
      const modes: QLCFixtureMode[] = [];
      if (fixtureDef.Mode) {
        for (const modeData of fixtureDef.Mode) {
          const mode: QLCFixtureMode = {
            name: modeData.$.Name || 'Default',
            channelCount: 0,
            channels: [],
          };

          if (modeData.Channel) {
            for (const channelRef of modeData.Channel) {
              const channelNumber = parseInt(channelRef.$.Number || '0');
              const channelName = channelRef._ || `Channel ${channelNumber}`;
              mode.channels.push({
                number: channelNumber,
                name: channelName,
              });
            }
            mode.channelCount = mode.channels.length;
          }

          modes.push(mode);
        }
      }

      return {
        manufacturer,
        model,
        type,
        modes,
        channels,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to parse fixture file "${filePath}":`, error);
      return null;
    }
  }

  searchFixtures(searchTerm: string): QLCFixtureDefinition[] {
    const results: QLCFixtureDefinition[] = [];
    const searchLower = searchTerm.toLowerCase();

    for (const fixture of this.fixtures.values()) {
      const manufacturerMatch = fixture.manufacturer.toLowerCase().includes(searchLower);
      const modelMatch = fixture.model.toLowerCase().includes(searchLower);
      
      if (manufacturerMatch || modelMatch) {
        results.push(fixture);
      }
    }

    return results.sort((a, b) => 
      a.manufacturer.localeCompare(b.manufacturer) || a.model.localeCompare(b.model)
    );
  }

  getFixture(manufacturer: string, model: string): QLCFixtureDefinition | undefined {
    const key = `${manufacturer}/${model}`;
    return this.fixtures.get(key);
  }

  suggestFixtureMappings(lacyLightsFixtures: { manufacturer: string; model: string }[]): {
    fixture: { manufacturer: string; model: string };
    suggestions: QLCFixtureDefinition[];
  }[] {
    const results = [];

    for (const lacyFixture of lacyLightsFixtures) {
      // Search for similar fixtures in QLC+
      const searchTerms = [
        lacyFixture.model,
        lacyFixture.manufacturer,
        `${lacyFixture.manufacturer} ${lacyFixture.model}`,
      ];

      const suggestions = new Set<QLCFixtureDefinition>();
      
      for (const term of searchTerms) {
        const found = this.searchFixtures(term);
        found.forEach(f => suggestions.add(f));
      }

      results.push({
        fixture: lacyFixture,
        suggestions: Array.from(suggestions).slice(0, 5), // Top 5 suggestions
      });
    }

    return results;
  }

  /**
   * Enhanced fixture mapping with channel compatibility analysis
   */
  findCompatibleFixtures(lacyFixture: LacyLightsFixtureDetails): FixtureCompatibilityScore[] {
    const results: FixtureCompatibilityScore[] = [];

    // First, search for fixtures by name
    const manufacturerWords = lacyFixture.manufacturer.split(/\s+/);
    const nameSearchTerms = [
      lacyFixture.model,
      lacyFixture.manufacturer,
      `${lacyFixture.manufacturer} ${lacyFixture.model}`,
      // Add individual manufacturer words (e.g., "Chauvet" from "Chauvet Dj")
      ...manufacturerWords,
      // Add combinations of manufacturer words with model
      ...manufacturerWords.map(word => `${word} ${lacyFixture.model}`),
    ];

    const candidateFixtures = new Set<QLCFixtureDefinition>();
    
    for (const term of nameSearchTerms) {
      const found = this.searchFixtures(term);
      found.forEach(f => candidateFixtures.add(f));
    }

    // Score each candidate fixture and its modes
    for (const qlcFixture of candidateFixtures) {
      for (const mode of qlcFixture.modes) {
        const score = this.calculateCompatibilityScore(lacyFixture, qlcFixture, mode);
        if (score.score > 0) {
          results.push(score);
        }
      }
    }

    // Sort by compatibility score (highest first)
    return results.sort((a, b) => b.score - a.score);
  }

  private calculateCompatibilityScore(
    lacyFixture: LacyLightsFixtureDetails,
    qlcFixture: QLCFixtureDefinition,
    qlcMode: QLCFixtureMode
  ): FixtureCompatibilityScore {
    let score = 0;
    const reasons: string[] = [];

    // 1. Exact channel count match (30 points)
    if (lacyFixture.channelCount === qlcMode.channelCount) {
      score += 30;
      reasons.push(`Exact channel count match (${lacyFixture.channelCount})`);
    } else if (Math.abs(lacyFixture.channelCount - qlcMode.channelCount) <= 2) {
      // Close channel count (10 points)
      score += 10;
      reasons.push(`Similar channel count (${lacyFixture.channelCount} vs ${qlcMode.channelCount})`);
    }

    // 2. Channel type compatibility (40 points max)
    const channelTypeScore = this.calculateChannelTypeCompatibility(lacyFixture, qlcMode);
    score += channelTypeScore.score;
    reasons.push(...channelTypeScore.reasons);

    // 3. Manufacturer match (15 points)
    const lacyManu = lacyFixture.manufacturer.toLowerCase().trim();
    const qlcManu = qlcFixture.manufacturer.toLowerCase().trim();
    
    if (lacyManu === qlcManu) {
      score += 15;
      reasons.push('Exact manufacturer match');
    } else {
      // Check for partial manufacturer matches (e.g., "Chauvet Dj" vs "Chauvet")
      const lacyWords = lacyManu.split(/\s+/);
      const qlcWords = qlcManu.split(/\s+/);
      
      let wordMatches = 0;
      for (const lacyWord of lacyWords) {
        for (const qlcWord of qlcWords) {
          if (lacyWord === qlcWord || lacyWord.includes(qlcWord) || qlcWord.includes(lacyWord)) {
            wordMatches++;
            break;
          }
        }
      }
      
      if (wordMatches > 0) {
        const matchScore = Math.round((wordMatches / Math.max(lacyWords.length, qlcWords.length)) * 15);
        score += matchScore;
        reasons.push(`Partial manufacturer match (${wordMatches} words)`);
      }
    }

    // 4. Model name similarity (10 points max)
    const modelSimilarity = this.calculateStringSimilarity(lacyFixture.model, qlcFixture.model);
    const modelScore = Math.round(modelSimilarity * 10);
    score += modelScore;
    if (modelScore > 5) {
      reasons.push(`Model similarity (${Math.round(modelSimilarity * 100)}%)`);
    }

    // 5. Mode name relevance (5 points)
    if (lacyFixture.mode) {
      const modeMatch = qlcMode.name.toLowerCase().includes(lacyFixture.mode.toLowerCase()) ||
                       lacyFixture.mode.toLowerCase().includes(qlcMode.name.toLowerCase());
      if (modeMatch) {
        score += 5;
        reasons.push('Mode name match');
      }
    }

    return {
      fixture: qlcFixture,
      mode: qlcMode,
      score,
      reasons,
    };
  }

  private calculateChannelTypeCompatibility(
    lacyFixture: LacyLightsFixtureDetails,
    qlcMode: QLCFixtureMode
  ): { score: number; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];

    // Create channel type maps
    const lacyChannelTypes = new Set(lacyFixture.channels.map(ch => ch.type.toLowerCase()));
    const qlcChannelNames = qlcMode.channels.map(ch => ch.name.toLowerCase());

    // Standard color channels
    const colorChannels = ['red', 'green', 'blue', 'amber', 'white', 'lime'];
    let colorMatches = 0;

    for (const color of colorChannels) {
      const lacyHasColor = lacyChannelTypes.has(color);
      const qlcHasColor = qlcChannelNames.some(name => name.includes(color));
      
      if (lacyHasColor && qlcHasColor) {
        colorMatches++;
      } else if (lacyHasColor && !qlcHasColor) {
        const COLOR_CHANNEL_MISSING_PENALTY = 5;
        score -= COLOR_CHANNEL_MISSING_PENALTY; // Penalty for missing color channel
      }
    }

    // Score based on color channel matches
    if (colorMatches >= 3) {
      score += 25; // RGB or more
      reasons.push(`${colorMatches} color channels match`);
    } else if (colorMatches >= 2) {
      score += 15;
      reasons.push(`${colorMatches} color channels match`);
    } else if (colorMatches >= 1) {
      score += 5;
      reasons.push(`${colorMatches} color channel matches`);
    }

    // Check for intensity/dimmer channel
    const lacyHasIntensity = lacyChannelTypes.has('intensity');
    const qlcHasIntensity = qlcChannelNames.some(name => 
      name.includes('intensity') || name.includes('dimmer') || name.includes('master')
    );

    if (lacyHasIntensity === qlcHasIntensity) {
      score += 10;
      reasons.push(lacyHasIntensity ? 'Both have intensity channel' : 'Both lack intensity channel');
    }

    // Check for special effects (strobe, macro, etc.)
    const effectChannels = ['strobe', 'macro', 'effect'];
    for (const effect of effectChannels) {
      const lacyHasEffect = lacyChannelTypes.has(effect);
      const qlcHasEffect = qlcChannelNames.some(name => name.includes(effect));
      
      if (lacyHasEffect && qlcHasEffect) {
        score += 5;
        reasons.push(`Both have ${effect} channel`);
      }
    }

    return { score, reasons };
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    if (s1 === s2) {return 1.0;}
    
    // Simple word-based similarity
    const words1 = s1.split(/\s+/);
    const words2 = s2.split(/\s+/);
    
    let matches = 0;
    for (const word1 of words1) {
      for (const word2 of words2) {
        if (word1.includes(word2) || word2.includes(word1)) {
          matches++;
          break;
        }
      }
    }
    
    return matches / Math.max(words1.length, words2.length);
  }

  /**
   * Enhanced fixture mapping suggestions with compatibility scoring
   */
  suggestFixtureMappingsEnhanced(lacyLightsFixtures: LacyLightsFixtureDetails[]): {
    fixture: LacyLightsFixtureDetails;
    compatibleFixtures: FixtureCompatibilityScore[];
  }[] {
    const results = [];

    for (const lacyFixture of lacyLightsFixtures) {
      const compatibleFixtures = this.findCompatibleFixtures(lacyFixture);
      
      results.push({
        fixture: lacyFixture,
        compatibleFixtures: compatibleFixtures.slice(0, 5), // Top 5 suggestions
      });
    }

    return results;
  }

  // Default mappings based on your specific case
  getDefaultMappings(): FixtureMapping[] {
    return [
      {
        lacyLightsKey: "Chauvet Dj/SlimPAR Pro RGBA",
        qlcManufacturer: "Chauvet",
        qlcModel: "SlimPAR Pro Q USB",
        qlcMode: "4 Channel",
      },
      {
        lacyLightsKey: "Etc/ColorSource Spot",
        qlcManufacturer: "ETC",
        qlcModel: "ColorSource Spot",
        qlcMode: "3-channel (RGB)",
      },
      {
        lacyLightsKey: "Etc/ColorSource PAR",
        qlcManufacturer: "ETC",
        qlcModel: "ColorSource PAR",
        qlcMode: "3-channel (RGB)",
      },
    ];
  }
}