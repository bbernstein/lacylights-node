import http from "http";

// Mock the http module
jest.mock("http", () => ({
  request: jest.fn(),
}));

// Track exit codes
let capturedExitCode: string | number | null | undefined = null;

// Mock process.exit to return instead of throwing
const mockProcessExit = jest
  .spyOn(process, "exit")
  .mockImplementation((_code?: string | number | null | undefined) => {
    // Store the exit code but don't actually exit or throw
    capturedExitCode = _code;
    return undefined as never;
  });

describe("healthcheck", () => {
  let mockRequest: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProcessExit.mockClear();
    // Reset the exit code tracker
    capturedExitCode = null;

    mockRequest = {
      on: jest.fn(),
      end: jest.fn(),
      destroy: jest.fn(),
    };

    (http.request as jest.Mock).mockReturnValue(mockRequest);
  });

  const dynamicImport = async () => {
    // Clear module cache and import healthcheck
    jest.resetModules();
    await import("../healthcheck");
  };

  it("should exit with code 0 when health check returns status 200", async () => {
    const mockResponse = { statusCode: 200 };

    // Mock the request callback to be called with successful response
    (http.request as jest.Mock).mockImplementation((_options, callback) => {
      // Call the callback immediately with successful response
      callback(mockResponse);
      return mockRequest;
    });

    await dynamicImport();

    expect(mockProcessExit).toHaveBeenCalledWith(0);
    expect(capturedExitCode).toBe(0);

    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: "localhost",
        port: process.env.PORT || 4000,
        path: "/health",
        method: "GET",
        timeout: 2000,
      }),
      expect.any(Function),
    );
  });

  it("should exit with code 1 when health check returns non-200 status", async () => {
    const mockResponse = { statusCode: 500 };

    // Mock the request callback to be called with error response
    (http.request as jest.Mock).mockImplementation((_options, callback) => {
      callback(mockResponse);
      return mockRequest;
    });

    await dynamicImport();

    expect(mockProcessExit).toHaveBeenCalledWith(1);
    expect(capturedExitCode).toBe(1);
  });

  it("should exit with code 1 on request error", async () => {
    (http.request as jest.Mock).mockImplementation((_options, _callback) => {
      return mockRequest;
    });

    await dynamicImport();

    // Simulate error event
    const errorCallback = mockRequest.on.mock.calls.find(
      (call: any[]) => call[0] === "error",
    )[1];

    errorCallback(new Error("Connection failed"));

    expect(mockProcessExit).toHaveBeenCalledWith(1);
    expect(capturedExitCode).toBe(1);
  });

  it("should exit with code 1 on request timeout", async () => {
    (http.request as jest.Mock).mockImplementation((_options, _callback) => {
      return mockRequest;
    });

    await dynamicImport();

    // Simulate timeout event
    const timeoutCallback = mockRequest.on.mock.calls.find(
      (call: any[]) => call[0] === "timeout",
    )[1];

    timeoutCallback();

    expect(mockProcessExit).toHaveBeenCalledWith(1);
    expect(capturedExitCode).toBe(1);
    expect(mockRequest.destroy).toHaveBeenCalled();
  });

  it("should use PORT environment variable when set", async () => {
    const originalPort = process.env.PORT;
    process.env.PORT = "8080";

    (http.request as jest.Mock).mockReturnValue(mockRequest);

    await dynamicImport();

    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        port: "8080",
      }),
      expect.any(Function),
    );

    // Restore original PORT
    if (originalPort) {
      process.env.PORT = originalPort;
    } else {
      delete process.env.PORT;
    }
  });

  it("should call request.end() to send the request", async () => {
    (http.request as jest.Mock).mockReturnValue(mockRequest);

    await dynamicImport();

    expect(mockRequest.end).toHaveBeenCalled();
  });
});