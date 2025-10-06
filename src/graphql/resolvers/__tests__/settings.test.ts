import { Context } from "../../../context";
import { settingsResolvers } from "../settings";

describe("Settings Resolvers", () => {
  let mockContext: Context;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      setting: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };

    mockContext = {
      prisma: mockPrisma,
    } as Context;
  });

  describe("Query resolvers", () => {
    describe("settings", () => {
      it("should fetch all settings ordered by key", async () => {
        const mockSettings = [
          {
            id: "1",
            key: "artnet_broadcast_address",
            value: "192.168.1.255",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: "2",
            key: "dmx_refresh_rate",
            value: "44",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];

        mockPrisma.setting.findMany.mockResolvedValue(mockSettings);

        const result = await settingsResolvers.Query.settings(
          {},
          {},
          mockContext,
        );

        expect(mockPrisma.setting.findMany).toHaveBeenCalledWith({
          orderBy: { key: "asc" },
        });
        expect(result).toEqual(mockSettings);
      });

      it("should handle empty settings list", async () => {
        mockPrisma.setting.findMany.mockResolvedValue([]);

        const result = await settingsResolvers.Query.settings(
          {},
          {},
          mockContext,
        );

        expect(result).toEqual([]);
      });
    });

    describe("setting", () => {
      it("should fetch a single setting by key", async () => {
        const settingKey = "artnet_broadcast_address";
        const mockSetting = {
          id: "test-setting-id",
          key: settingKey,
          value: "192.168.1.255",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockPrisma.setting.findUnique.mockResolvedValue(mockSetting);

        const result = await settingsResolvers.Query.setting(
          {},
          { key: settingKey },
          mockContext,
        );

        expect(mockPrisma.setting.findUnique).toHaveBeenCalledWith({
          where: { key: settingKey },
        });
        expect(result).toEqual(mockSetting);
      });

      it("should return null if setting does not exist", async () => {
        mockPrisma.setting.findUnique.mockResolvedValue(null);

        const result = await settingsResolvers.Query.setting(
          {},
          { key: "non_existent_key" },
          mockContext,
        );

        expect(result).toBeNull();
      });
    });
  });

  describe("Mutation resolvers", () => {
    describe("updateSetting", () => {
      it("should create a new setting if it does not exist", async () => {
        const input = {
          key: "artnet_broadcast_address",
          value: "192.168.1.255",
        };

        const mockSetting = {
          id: "new-setting-id",
          key: input.key,
          value: input.value,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockPrisma.setting.upsert.mockResolvedValue(mockSetting);

        const result = await settingsResolvers.Mutation.updateSetting(
          {},
          { input },
          mockContext,
        );

        expect(mockPrisma.setting.upsert).toHaveBeenCalledWith({
          where: { key: input.key },
          update: { value: input.value },
          create: {
            key: input.key,
            value: input.value,
          },
        });
        expect(result).toEqual(mockSetting);
      });

      it("should update an existing setting", async () => {
        const input = {
          key: "artnet_broadcast_address",
          value: "192.168.1.255",
        };

        const mockSetting = {
          id: "existing-setting-id",
          key: input.key,
          value: input.value,
          createdAt: new Date("2024-01-01"),
          updatedAt: new Date(),
        };

        mockPrisma.setting.upsert.mockResolvedValue(mockSetting);

        const result = await settingsResolvers.Mutation.updateSetting(
          {},
          { input },
          mockContext,
        );

        expect(mockPrisma.setting.upsert).toHaveBeenCalledWith({
          where: { key: input.key },
          update: { value: input.value },
          create: {
            key: input.key,
            value: input.value,
          },
        });
        expect(result).toEqual(mockSetting);
      });

      it("should handle updating setting with different value", async () => {
        const input = {
          key: "dmx_refresh_rate",
          value: "60",
        };

        const mockSetting = {
          id: "setting-id",
          key: input.key,
          value: input.value,
          createdAt: new Date("2024-01-01"),
          updatedAt: new Date(),
        };

        mockPrisma.setting.upsert.mockResolvedValue(mockSetting);

        const result = await settingsResolvers.Mutation.updateSetting(
          {},
          { input },
          mockContext,
        );

        expect(result.value).toBe("60");
      });
    });
  });
});
