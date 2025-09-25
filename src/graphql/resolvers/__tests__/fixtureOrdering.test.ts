import { fixtureOrderingResolvers } from "../fixtureOrdering";

// Mock context
const mockContext = {
  prisma: {
    fixtureInstance: {
      update: jest.fn(),
    },
    fixtureValue: {
      updateMany: jest.fn(),
    },
  },
};

describe("fixtureOrderingResolvers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Mutation.reorderProjectFixtures", () => {
    it("should reorder project fixtures successfully", async () => {
      const fixtureOrders = [
        { fixtureId: "fixture-1", order: 2 },
        { fixtureId: "fixture-2", order: 1 },
        { fixtureId: "fixture-3", order: 3 },
      ];

      mockContext.prisma.fixtureInstance.update.mockResolvedValue({});

      const result = await fixtureOrderingResolvers.Mutation.reorderProjectFixtures(
        {},
        { fixtureOrders },
        mockContext as any
      );

      expect(result).toBe(true);
      expect(mockContext.prisma.fixtureInstance.update).toHaveBeenCalledTimes(3);
      expect(mockContext.prisma.fixtureInstance.update).toHaveBeenCalledWith({
        where: { id: "fixture-1" },
        data: { projectOrder: 2 },
      });
      expect(mockContext.prisma.fixtureInstance.update).toHaveBeenCalledWith({
        where: { id: "fixture-2" },
        data: { projectOrder: 1 },
      });
      expect(mockContext.prisma.fixtureInstance.update).toHaveBeenCalledWith({
        where: { id: "fixture-3" },
        data: { projectOrder: 3 },
      });
    });

    it("should handle empty fixture orders array", async () => {
      const result = await fixtureOrderingResolvers.Mutation.reorderProjectFixtures(
        {},
        { fixtureOrders: [] },
        mockContext as any
      );

      expect(result).toBe(true);
      expect(mockContext.prisma.fixtureInstance.update).not.toHaveBeenCalled();
    });

    it("should handle database errors", async () => {
      const fixtureOrders = [{ fixtureId: "fixture-1", order: 1 }];
      const dbError = new Error("Database connection failed");

      mockContext.prisma.fixtureInstance.update.mockRejectedValue(dbError);

      await expect(
        fixtureOrderingResolvers.Mutation.reorderProjectFixtures(
          {},
          { fixtureOrders },
          mockContext as any
        )
      ).rejects.toThrow("Failed to reorder project fixtures: Database connection failed");
    });

    it("should handle non-Error objects", async () => {
      const fixtureOrders = [{ fixtureId: "fixture-1", order: 1 }];

      mockContext.prisma.fixtureInstance.update.mockRejectedValue("String error");

      await expect(
        fixtureOrderingResolvers.Mutation.reorderProjectFixtures(
          {},
          { fixtureOrders },
          mockContext as any
        )
      ).rejects.toThrow("Failed to reorder project fixtures: String error");
    });

    it("should handle partial failure scenarios", async () => {
      const fixtureOrders = [
        { fixtureId: "fixture-1", order: 1 },
        { fixtureId: "fixture-2", order: 2 },
      ];

      mockContext.prisma.fixtureInstance.update
        .mockResolvedValueOnce({}) // First call succeeds
        .mockRejectedValueOnce(new Error("Second update failed")); // Second call fails

      await expect(
        fixtureOrderingResolvers.Mutation.reorderProjectFixtures(
          {},
          { fixtureOrders },
          mockContext as any
        )
      ).rejects.toThrow("Failed to reorder project fixtures: Second update failed");
    });

    it("should handle large number of fixtures", async () => {
      const fixtureOrders = Array.from({ length: 100 }, (_, i) => ({
        fixtureId: `fixture-${i}`,
        order: i + 1,
      }));

      mockContext.prisma.fixtureInstance.update.mockResolvedValue({});

      const result = await fixtureOrderingResolvers.Mutation.reorderProjectFixtures(
        {},
        { fixtureOrders },
        mockContext as any
      );

      expect(result).toBe(true);
      expect(mockContext.prisma.fixtureInstance.update).toHaveBeenCalledTimes(100);
    });

    it("should handle duplicate fixture IDs", async () => {
      const fixtureOrders = [
        { fixtureId: "fixture-1", order: 1 },
        { fixtureId: "fixture-1", order: 2 }, // Duplicate ID with different order
      ];

      mockContext.prisma.fixtureInstance.update.mockResolvedValue({});

      const result = await fixtureOrderingResolvers.Mutation.reorderProjectFixtures(
        {},
        { fixtureOrders },
        mockContext as any
      );

      expect(result).toBe(true);
      expect(mockContext.prisma.fixtureInstance.update).toHaveBeenCalledTimes(2);
      expect(mockContext.prisma.fixtureInstance.update).toHaveBeenLastCalledWith({
        where: { id: "fixture-1" },
        data: { projectOrder: 2 },
      });
    });
  });

  describe("Mutation.reorderSceneFixtures", () => {
    it("should reorder scene fixtures successfully", async () => {
      const sceneId = "scene-1";
      const fixtureOrders = [
        { fixtureId: "fixture-1", order: 3 },
        { fixtureId: "fixture-2", order: 1 },
        { fixtureId: "fixture-3", order: 2 },
      ];

      mockContext.prisma.fixtureValue.updateMany.mockResolvedValue({ count: 1 });

      const result = await fixtureOrderingResolvers.Mutation.reorderSceneFixtures(
        {},
        { sceneId, fixtureOrders },
        mockContext as any
      );

      expect(result).toBe(true);
      expect(mockContext.prisma.fixtureValue.updateMany).toHaveBeenCalledTimes(3);
      expect(mockContext.prisma.fixtureValue.updateMany).toHaveBeenCalledWith({
        where: {
          sceneId: "scene-1",
          fixtureId: "fixture-1",
        },
        data: { sceneOrder: 3 },
      });
      expect(mockContext.prisma.fixtureValue.updateMany).toHaveBeenCalledWith({
        where: {
          sceneId: "scene-1",
          fixtureId: "fixture-2",
        },
        data: { sceneOrder: 1 },
      });
      expect(mockContext.prisma.fixtureValue.updateMany).toHaveBeenCalledWith({
        where: {
          sceneId: "scene-1",
          fixtureId: "fixture-3",
        },
        data: { sceneOrder: 2 },
      });
    });

    it("should handle empty fixture orders array", async () => {
      const result = await fixtureOrderingResolvers.Mutation.reorderSceneFixtures(
        {},
        { sceneId: "scene-1", fixtureOrders: [] },
        mockContext as any
      );

      expect(result).toBe(true);
      expect(mockContext.prisma.fixtureValue.updateMany).not.toHaveBeenCalled();
    });

    it("should handle database errors", async () => {
      const sceneId = "scene-1";
      const fixtureOrders = [{ fixtureId: "fixture-1", order: 1 }];
      const dbError = new Error("Constraint violation");

      mockContext.prisma.fixtureValue.updateMany.mockRejectedValue(dbError);

      await expect(
        fixtureOrderingResolvers.Mutation.reorderSceneFixtures(
          {},
          { sceneId, fixtureOrders },
          mockContext as any
        )
      ).rejects.toThrow("Failed to reorder scene fixtures: Constraint violation");
    });

    it("should handle non-Error objects", async () => {
      const sceneId = "scene-1";
      const fixtureOrders = [{ fixtureId: "fixture-1", order: 1 }];

      mockContext.prisma.fixtureValue.updateMany.mockRejectedValue({ code: "P2025" });

      await expect(
        fixtureOrderingResolvers.Mutation.reorderSceneFixtures(
          {},
          { sceneId, fixtureOrders },
          mockContext as any
        )
      ).rejects.toThrow("Failed to reorder scene fixtures: [object Object]");
    });

    it("should handle updateMany returning zero affected rows", async () => {
      const sceneId = "scene-1";
      const fixtureOrders = [{ fixtureId: "nonexistent-fixture", order: 1 }];

      mockContext.prisma.fixtureValue.updateMany.mockResolvedValue({ count: 0 });

      const result = await fixtureOrderingResolvers.Mutation.reorderSceneFixtures(
        {},
        { sceneId, fixtureOrders },
        mockContext as any
      );

      expect(result).toBe(true);
      expect(mockContext.prisma.fixtureValue.updateMany).toHaveBeenCalledTimes(1);
    });

    it("should handle negative order values", async () => {
      const sceneId = "scene-1";
      const fixtureOrders = [
        { fixtureId: "fixture-1", order: -1 },
        { fixtureId: "fixture-2", order: 0 },
      ];

      mockContext.prisma.fixtureValue.updateMany.mockResolvedValue({ count: 1 });

      const result = await fixtureOrderingResolvers.Mutation.reorderSceneFixtures(
        {},
        { sceneId, fixtureOrders },
        mockContext as any
      );

      expect(result).toBe(true);
      expect(mockContext.prisma.fixtureValue.updateMany).toHaveBeenCalledWith({
        where: {
          sceneId: "scene-1",
          fixtureId: "fixture-1",
        },
        data: { sceneOrder: -1 },
      });
      expect(mockContext.prisma.fixtureValue.updateMany).toHaveBeenCalledWith({
        where: {
          sceneId: "scene-1",
          fixtureId: "fixture-2",
        },
        data: { sceneOrder: 0 },
      });
    });

    it("should handle very large order values", async () => {
      const sceneId = "scene-1";
      const fixtureOrders = [
        { fixtureId: "fixture-1", order: Number.MAX_SAFE_INTEGER },
      ];

      mockContext.prisma.fixtureValue.updateMany.mockResolvedValue({ count: 1 });

      const result = await fixtureOrderingResolvers.Mutation.reorderSceneFixtures(
        {},
        { sceneId, fixtureOrders },
        mockContext as any
      );

      expect(result).toBe(true);
      expect(mockContext.prisma.fixtureValue.updateMany).toHaveBeenCalledWith({
        where: {
          sceneId: "scene-1",
          fixtureId: "fixture-1",
        },
        data: { sceneOrder: Number.MAX_SAFE_INTEGER },
      });
    });

    it("should handle concurrent updates", async () => {
      const sceneId = "scene-1";
      const fixtureOrders = Array.from({ length: 50 }, (_, i) => ({
        fixtureId: `fixture-${i}`,
        order: i,
      }));

      mockContext.prisma.fixtureValue.updateMany.mockResolvedValue({ count: 1 });

      const result = await fixtureOrderingResolvers.Mutation.reorderSceneFixtures(
        {},
        { sceneId, fixtureOrders },
        mockContext as any
      );

      expect(result).toBe(true);
      expect(mockContext.prisma.fixtureValue.updateMany).toHaveBeenCalledTimes(50);
    });

    it("should handle partial failure in concurrent updates", async () => {
      const sceneId = "scene-1";
      const fixtureOrders = [
        { fixtureId: "fixture-1", order: 1 },
        { fixtureId: "fixture-2", order: 2 },
        { fixtureId: "fixture-3", order: 3 },
      ];

      mockContext.prisma.fixtureValue.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockRejectedValueOnce(new Error("Update failed"))
        .mockResolvedValueOnce({ count: 1 });

      await expect(
        fixtureOrderingResolvers.Mutation.reorderSceneFixtures(
          {},
          { sceneId, fixtureOrders },
          mockContext as any
        )
      ).rejects.toThrow("Failed to reorder scene fixtures: Update failed");
    });
  });

  describe("edge cases", () => {
    it("should handle undefined parameters gracefully in reorderProjectFixtures", async () => {
      // This tests the resolver's robustness to malformed input
      await expect(
        fixtureOrderingResolvers.Mutation.reorderProjectFixtures(
          {},
          undefined as any,
          mockContext as any
        )
      ).rejects.toThrow();
    });

    it("should handle undefined parameters gracefully in reorderSceneFixtures", async () => {
      await expect(
        fixtureOrderingResolvers.Mutation.reorderSceneFixtures(
          {},
          undefined as any,
          mockContext as any
        )
      ).rejects.toThrow();
    });

    it("should handle malformed fixture orders", async () => {
      const malformedOrders = [
        { fixtureId: "fixture-1" }, // Missing order
        { order: 2 }, // Missing fixtureId
        { fixtureId: "fixture-3", order: "invalid" }, // Invalid order type
      ] as any;

      // The function should still attempt to process what it can
      mockContext.prisma.fixtureInstance.update.mockResolvedValue({});

      // This may throw an error depending on how Prisma handles the invalid data
      // We're testing that our error handling works
      try {
        await fixtureOrderingResolvers.Mutation.reorderProjectFixtures(
          {},
          { fixtureOrders: malformedOrders },
          mockContext as any
        );
      } catch (error) {
        expect(error).toEqual(expect.any(Error));
      }
    });
  });
});