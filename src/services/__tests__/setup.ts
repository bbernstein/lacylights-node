// Mock setup for service tests that don't need database
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
};

// Simple test to validate the setup works
describe("Service Test Setup", () => {
  it("should mock console methods", () => {
    console.log("test message");
    expect(console.log).toHaveBeenCalledWith("test message");
  });
});
