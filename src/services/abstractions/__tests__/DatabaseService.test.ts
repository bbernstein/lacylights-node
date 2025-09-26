import { mockDeep } from 'jest-mock-extended';
import { PrismaClient, FixtureType, ChannelType } from '@prisma/client';
import { DatabaseService, FixtureDefinition } from '../DatabaseService';

describe('DatabaseService', () => {
  let service: DatabaseService;
  let mockPrisma: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    mockPrisma = mockDeep<PrismaClient>();
    service = new DatabaseService(mockPrisma);
    jest.clearAllMocks();
  });

  describe('getFixtureCount', () => {
    it('should return fixture count from prisma', async () => {
      const expectedCount = 42;
      (mockPrisma.fixtureDefinition.count as jest.Mock).mockResolvedValue(expectedCount);

      const result = await service.getFixtureCount();

      expect(result).toBe(expectedCount);
      expect(mockPrisma.fixtureDefinition.count).toHaveBeenCalledWith();
    });

    it('should return 0 when no fixtures exist', async () => {
      (mockPrisma.fixtureDefinition.count as jest.Mock).mockResolvedValue(0);

      const result = await service.getFixtureCount();

      expect(result).toBe(0);
      expect(mockPrisma.fixtureDefinition.count).toHaveBeenCalledWith();
    });
  });

  describe('createFixtures', () => {
    it('should create fixtures using prisma createMany', async () => {
      const fixtures: FixtureDefinition[] = [
        {
          manufacturer: 'Chauvet',
          model: 'SlimPAR Pro H USB',
          type: FixtureType.LED_PAR,
          isBuiltIn: false,
          channels: {
            create: [
              {
                name: 'Red',
                type: ChannelType.RED,
                offset: 0,
                minValue: 0,
                maxValue: 255,
                defaultValue: 0
              },
              {
                name: 'Green',
                type: ChannelType.GREEN,
                offset: 1,
                minValue: 0,
                maxValue: 255,
                defaultValue: 0
              }
            ]
          }
        }
      ];

      const expectedResult = { count: 1 };
      (mockPrisma.fixtureDefinition.createMany as jest.Mock).mockResolvedValue(expectedResult);

      const result = await service.createFixtures(fixtures);

      expect(result).toEqual(expectedResult);
      expect(mockPrisma.fixtureDefinition.createMany).toHaveBeenCalledWith({
        data: fixtures
      });
    });

    it('should create multiple fixtures', async () => {
      const fixtures: FixtureDefinition[] = [
        {
          manufacturer: 'Chauvet',
          model: 'SlimPAR Pro',
          type: FixtureType.LED_PAR,
          isBuiltIn: false,
          channels: {
            create: [{
              name: 'Master',
              type: ChannelType.INTENSITY,
              offset: 0,
              minValue: 0,
              maxValue: 255,
              defaultValue: 0
            }]
          }
        },
        {
          manufacturer: 'Martin',
          model: 'MAC Viper',
          type: FixtureType.MOVING_HEAD,
          isBuiltIn: true,
          channels: {
            create: [{
              name: 'Pan',
              type: ChannelType.PAN,
              offset: 0,
              minValue: 0,
              maxValue: 255,
              defaultValue: 127
            }]
          }
        }
      ];

      const expectedResult = { count: 2 };
      (mockPrisma.fixtureDefinition.createMany as jest.Mock).mockResolvedValue(expectedResult);

      const result = await service.createFixtures(fixtures);

      expect(result).toEqual(expectedResult);
      expect(mockPrisma.fixtureDefinition.createMany).toHaveBeenCalledWith({
        data: fixtures
      });
    });

    it('should handle empty fixtures array', async () => {
      const fixtures: FixtureDefinition[] = [];
      const expectedResult = { count: 0 };
      (mockPrisma.fixtureDefinition.createMany as jest.Mock).mockResolvedValue(expectedResult);

      const result = await service.createFixtures(fixtures);

      expect(result).toEqual(expectedResult);
      expect(mockPrisma.fixtureDefinition.createMany).toHaveBeenCalledWith({
        data: fixtures
      });
    });
  });
});