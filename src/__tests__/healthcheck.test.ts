// Mock the http module before any imports
const mockRequest = {
  on: jest.fn(),
  end: jest.fn(),
  destroy: jest.fn(),
};

const mockHttpRequest = jest.fn().mockReturnValue(mockRequest);

jest.mock("http", () => ({
  request: mockHttpRequest,
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
  beforeEach(() => {
    jest.clearAllMocks();
    mockProcessExit.mockClear();
    mockRequest.on.mockClear();
    mockRequest.end.mockClear();
    mockRequest.destroy.mockClear();
    mockHttpRequest.mockClear();

    // Reset the exit code tracker
    capturedExitCode = null;
  });

  it("should exit with code 0 when health check returns status 200", async () => {
    const mockResponse = { statusCode: 200 };

    // Configure mock to call callback immediately with successful response
    mockHttpRequest.mockImplementation((_options, callback) => {
      callback(mockResponse);
      return mockRequest;
    });

    // Import the healthcheck module to trigger execution
    await import("../healthcheck");

    expect(mockProcessExit).toHaveBeenCalledWith(0);
    expect(capturedExitCode).toBe(0);

    expect(mockHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: "localhost",
        port: process.env.PORT || 4000,
        path: "/health",
        method: "GET",
        timeout: 2000,
      }),
      expect.any(Function),
    );
    expect(mockRequest.end).toHaveBeenCalled();
  });

  it("should exit with code 1 when health check returns non-200 status", async () => {
    const mockResponse = { statusCode: 500 };

    // Configure mock to call callback with error response
    mockHttpRequest.mockImplementation((_options, callback) => {
      callback(mockResponse);
      return mockRequest;
    });

    await import("../healthcheck");

    expect(mockProcessExit).toHaveBeenCalledWith(1);
    expect(capturedExitCode).toBe(1);
  });

  it("should exit with code 1 on request error", async () => {
    // Configure mock to return request object without calling callback
    mockHttpRequest.mockImplementation(() => mockRequest);

    await import("../healthcheck");

    // Find and trigger the error callback
    expect(mockRequest.on).toHaveBeenCalledWith("error", expect.any(Function));
    const errorCallback = mockRequest.on.mock.calls.find(
      (call: any[]) => call[0] === "error",
    )[1];

    errorCallback(new Error("Connection failed"));

    expect(mockProcessExit).toHaveBeenCalledWith(1);
    expect(capturedExitCode).toBe(1);
  });

  it("should exit with code 1 on request timeout", async () => {
    // Configure mock to return request object
    mockHttpRequest.mockImplementation(() => mockRequest);

    await import("../healthcheck");

    // Find and trigger the timeout callback
    expect(mockRequest.on).toHaveBeenCalledWith("timeout", expect.any(Function));
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

    mockHttpRequest.mockReturnValue(mockRequest);

    await import("../healthcheck");

    expect(mockHttpRequest).toHaveBeenCalledWith(
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
    mockHttpRequest.mockReturnValue(mockRequest);

    await import("../healthcheck");

    expect(mockRequest.end).toHaveBeenCalled();
  });
});