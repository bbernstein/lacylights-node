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
    it('should create fixtures using transaction with modes', async () => {
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
          },
          modes: [
            {
              name: '2-Channel',
              shortName: '2CH',
              channelCount: 2,
              channels: [
                { offset: 1, channelName: 'Red' },
                { offset: 2, channelName: 'Green' }
              ]
            }
          ]
        }
      ];

      const createdFixture = {
        id: '1',
        manufacturer: 'Chauvet',
        model: 'SlimPAR Pro H USB',
        type: FixtureType.LED_PAR,
        isBuiltIn: false,
        channels: [
          { id: '1', name: 'Red', type: ChannelType.RED, offset: 0, minValue: 0, maxValue: 255, defaultValue: 0, definitionId: '1' },
          { id: '2', name: 'Green', type: ChannelType.GREEN, offset: 1, minValue: 0, maxValue: 255, defaultValue: 0, definitionId: '1' }
        ]
      };

      const mockTx = {
        fixtureDefinition: {
          create: jest.fn().mockResolvedValue(createdFixture)
        },
        fixtureMode: {
          create: jest.fn().mockResolvedValue({ id: '1', name: '2-Channel' })
        }
      };

      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });

      const result = await service.createFixtures(fixtures);

      expect(result).toEqual({ count: 1 });
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockTx.fixtureDefinition.create).toHaveBeenCalledTimes(1);
      expect(mockTx.fixtureMode.create).toHaveBeenCalledTimes(1);
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

      const mockTx = {
        fixtureDefinition: {
          create: jest.fn()
            .mockResolvedValueOnce({ id: '1', channels: [{ id: '1', name: 'Master' }] })
            .mockResolvedValueOnce({ id: '2', channels: [{ id: '2', name: 'Pan' }] })
        },
        fixtureMode: {
          create: jest.fn()
        }
      };

      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });

      const result = await service.createFixtures(fixtures);

      expect(result).toEqual({ count: 2 });
      expect(mockTx.fixtureDefinition.create).toHaveBeenCalledTimes(2);
    });

    it('should handle empty fixtures array', async () => {
      const fixtures: FixtureDefinition[] = [];

      const mockTx = {
        fixtureDefinition: {
          create: jest.fn()
        }
      };

      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });

      const result = await service.createFixtures(fixtures);

      expect(result).toEqual({ count: 0 });
      expect(mockTx.fixtureDefinition.create).not.toHaveBeenCalled();
    });
  });
});