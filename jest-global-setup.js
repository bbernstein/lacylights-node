// This file runs BEFORE Jest initializes the test environment
// It sets up localStorage on the global object to prevent SecurityError

module.exports = async () => {
    // Mock localStorage on the global object
    const localStorageMock = {
        getItem: () => null,
        setItem: () => { },
        removeItem: () => { },
        clear: () => { },
    };

    // Set it on globalThis so it's available during Jest environment initialization
    globalThis.localStorage = localStorageMock;

    // Also set it on global for compatibility
    global.localStorage = localStorageMock;
};
