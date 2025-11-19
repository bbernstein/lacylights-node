import { PrismaClient } from "@prisma/client";
import { OFLImportService } from "../oflImportService";
import { FixtureType, ChannelType } from "../../types/enums";

// Mock Prisma Client
const mockPrisma = {
  fixtureDefinition: {
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  fixtureMode: {
    create: jest.fn(),
  },
  modeChannel: {
    create: jest.fn(),
  },
  $transaction: jest.fn(async (cb) => cb(mockPrisma)),
} as unknown as PrismaClient;

describe("OFLImportService", () => {
  let service: OFLImportService;

  beforeEach(() => {
    service = new OFLImportService(mockPrisma);
    jest.clearAllMocks();
  });

  describe("mapChannelType", () => {
    it("should map Intensity to INTENSITY", () => {
      const result = service.mapChannelType({ type: "Intensity" });
      expect(result).toBe(ChannelType.INTENSITY);
    });

    it("should map ColorIntensity with red to RED", () => {
      const result = service.mapChannelType({
        type: "ColorIntensity",
        color: "red",
      });
      expect(result).toBe(ChannelType.RED);
    });

    it("should map ColorIntensity with green to GREEN", () => {
      const result = service.mapChannelType({
        type: "ColorIntensity",
        color: "green",
      });
      expect(result).toBe(ChannelType.GREEN);
    });

    it("should map Pan to PAN", () => {
      const result = service.mapChannelType({ type: "Pan" });
      expect(result).toBe(ChannelType.PAN);
    });

    it("should map Tilt to TILT", () => {
      const result = service.mapChannelType({ type: "Tilt" });
      expect(result).toBe(ChannelType.TILT);
    });

    it("should map unknown types to OTHER", () => {
      const result = service.mapChannelType({ type: "Unknown" });
      expect(result).toBe(ChannelType.OTHER);
    });
  });

  describe("mapFixtureType", () => {
    it("should map moving head category to MOVING_HEAD", () => {
      const result = service.mapFixtureType(["Moving Head"]);
      expect(result).toBe(FixtureType.MOVING_HEAD);
    });

    it("should map scanner category to MOVING_HEAD", () => {
      const result = service.mapFixtureType(["Scanner"]);
      expect(result).toBe(FixtureType.MOVING_HEAD);
    });

    it("should map strobe category to STROBE", () => {
      const result = service.mapFixtureType(["Strobe"]);
      expect(result).toBe(FixtureType.STROBE);
    });

    it("should map dimmer category to DIMMER", () => {
      const result = service.mapFixtureType(["Dimmer"]);
      expect(result).toBe(FixtureType.DIMMER);
    });

    it("should map color changer to LED_PAR", () => {
      const result = service.mapFixtureType(["Color Changer"]);
      expect(result).toBe(FixtureType.LED_PAR);
    });

    it("should map par to LED_PAR", () => {
      const result = service.mapFixtureType(["PAR"]);
      expect(result).toBe(FixtureType.LED_PAR);
    });

    it("should default to OTHER for unknown categories", () => {
      const result = service.mapFixtureType(["Unknown"]);
      expect(result).toBe(FixtureType.OTHER);
    });
  });

  describe("getMinMaxValues", () => {
    it("should return dmxRange if provided", () => {
      const result = service.getMinMaxValues({ type: "Test", dmxRange: [10, 200] });
      expect(result).toEqual({ min: 10, max: 200 });
    });

    it("should return default 0-255 if no dmxRange", () => {
      const result = service.getMinMaxValues({ type: "Test" });
      expect(result).toEqual({ min: 0, max: 255 });
    });
  });

  describe("getDefaultValue", () => {
    it("should return 0 for Intensity channels", () => {
      const result = service.getDefaultValue({ type: "Intensity" });
      expect(result).toBe(0);
    });

    it("should return 0 for ColorIntensity channels", () => {
      const result = service.getDefaultValue({ type: "ColorIntensity" });
      expect(result).toBe(0);
    });

    it("should return center value for Pan with dmxRange", () => {
      const result = service.getDefaultValue({ type: "Pan", dmxRange: [0, 200] });
      expect(result).toBe(100);
    });

    it("should return center value for Tilt with dmxRange", () => {
      const result = service.getDefaultValue({ type: "Tilt", dmxRange: [50, 250] });
      expect(result).toBe(150);
    });

    it("should return 127 for Pan without dmxRange", () => {
      const result = service.getDefaultValue({ type: "Pan" });
      expect(result).toBe(127);
    });

    it("should return min value for other channels with dmxRange", () => {
      const result = service.getDefaultValue({ type: "Other", dmxRange: [10, 100] });
      expect(result).toBe(10);
    });

    it("should return 0 for other channels without dmxRange", () => {
      const result = service.getDefaultValue({ type: "Other" });
      expect(result).toBe(0);
    });
  });

  describe("importFixture", () => {
    const validOflFixture = {
      name: "Test Fixture",
      categories: ["LED PAR"],
      availableChannels: {
        Intensity: {
          capability: {
            type: "Intensity",
            dmxRange: [0, 255] as [number, number],
          },
        },
        Red: {
          capability: {
            type: "ColorIntensity",
            color: "red",
            dmxRange: [0, 255] as [number, number],
          },
        },
      },
      modes: [
        {
          name: "2-Channel",
          channels: ["Intensity", "Red"],
        },
      ],
    };

    it("should reject invalid JSON", async () => {
      await expect(
        service.importFixture("TestManufacturer", "invalid json"),
      ).rejects.toThrow("Invalid JSON");
    });

    it("should reject fixture without name", async () => {
      const invalidFixture = { categories: ["LED PAR"] };
      await expect(
        service.importFixture("TestManufacturer", JSON.stringify(invalidFixture)),
      ).rejects.toThrow('OFL fixture must have a "name" field');
    });

    it("should reject fixture without categories", async () => {
      const invalidFixture = { name: "Test" };
      await expect(
        service.importFixture("TestManufacturer", JSON.stringify(invalidFixture)),
      ).rejects.toThrow('OFL fixture must have a "categories" array');
    });

    it("should reject fixture without availableChannels", async () => {
      const invalidFixture = { name: "Test", categories: ["LED PAR"] };
      await expect(
        service.importFixture("TestManufacturer", JSON.stringify(invalidFixture)),
      ).rejects.toThrow('OFL fixture must have "availableChannels"');
    });

    it("should reject fixture without modes", async () => {
      const invalidFixture = {
        name: "Test",
        categories: ["LED PAR"],
        availableChannels: { Test: { capability: { type: "Other" } } },
      };
      await expect(
        service.importFixture("TestManufacturer", JSON.stringify(invalidFixture)),
      ).rejects.toThrow('OFL fixture must have a "modes" array');
    });

    it("should reject duplicate fixture", async () => {
      (mockPrisma.fixtureDefinition.findUnique as jest.Mock).mockResolvedValue({
        id: "existing-id",
        manufacturer: "TestManufacturer",
        model: "Test Fixture",
        instances: [{ id: "instance-1" }],
      });

      await expect(
        service.importFixture("TestManufacturer", JSON.stringify(validOflFixture)),
      ).rejects.toThrow("FIXTURE_EXISTS:TestManufacturer Test Fixture:1");
    });

    it("should successfully import a valid fixture", async () => {
      (mockPrisma.fixtureDefinition.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.fixtureDefinition.create as jest.Mock).mockResolvedValue({
        id: "new-fixture-id",
        manufacturer: "TestManufacturer",
        model: "Test Fixture",
        type: "LED_PAR",
        channels: [
          { id: "ch1", name: "Intensity", offset: 0 },
          { id: "ch2", name: "Red", offset: 1 },
        ],
      });
      (mockPrisma.fixtureMode.create as jest.Mock).mockResolvedValue({
        id: "mode-id",
        name: "2-Channel",
        channelCount: 2,
      });

      const result = await service.importFixture(
        "TestManufacturer",
        JSON.stringify(validOflFixture),
      );

      expect(result).toEqual({
        id: "new-fixture-id",
        manufacturer: "TestManufacturer",
        model: "Test Fixture",
        type: FixtureType.LED_PAR,
      });

      // Verify database calls
      expect(mockPrisma.fixtureDefinition.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          manufacturer: "TestManufacturer",
          model: "Test Fixture",
          type: FixtureType.LED_PAR,
          isBuiltIn: false,
        }),
        include: {
          channels: true,
        },
      });

      expect(mockPrisma.fixtureMode.create).toHaveBeenCalled();
      expect(mockPrisma.modeChannel.create).toHaveBeenCalledTimes(2);
    });
  });
});
