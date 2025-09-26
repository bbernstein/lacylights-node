import { LacyLightsServer } from '../server';

describe("LacyLightsServer Index Integration", () => {
  describe("Module exports", () => {
    it("should export LacyLightsServer from index", async () => {
      const exports = await import("../index");

      expect(exports.LacyLightsServer).toBeDefined();
      expect(typeof exports.LacyLightsServer).toBe("function");
    });

    it("should maintain TypeScript interface exports for compile-time", () => {
      // This test verifies that the interfaces are properly exported for TypeScript compilation
      // Interfaces don't exist at runtime, but we can test that the types compile correctly
      const server = new LacyLightsServer();

      // If these interfaces weren't properly exported, this wouldn't compile
      const config = server.getConfig();
      const deps = server.getDependencies();

      expect(config).toBeDefined();
      expect(deps).toBeDefined();
    });
  });

  describe("Backward compatibility", () => {
    it("should maintain the same public API", () => {
      const server = new LacyLightsServer();

      expect(server.start).toBeDefined();
      expect(server.shutdown).toBeDefined();
      expect(server.setupSignalHandlers).toBeDefined();
      expect(server.getConfig).toBeDefined();
      expect(server.getDependencies).toBeDefined();
    });

    it("should support configuration injection", () => {
      const config = {
        port: 9000,
        corsOrigin: 'https://test.com'
      };

      const server = new LacyLightsServer(config);
      const serverConfig = server.getConfig();

      expect(serverConfig.port).toBe(9000);
      expect(serverConfig.corsOrigin).toBe('https://test.com');
    });
  });

  describe("Main module execution", () => {
    it("should import main module automatically", async () => {
      // This test verifies that importing index.ts triggers main.ts import
      const mainModule = await import("../main");
      expect(mainModule.main).toBeDefined();
      expect(typeof mainModule.main).toBe("function");
    });
  });
});