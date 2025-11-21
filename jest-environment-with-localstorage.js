const NodeEnvironment = require('jest-environment-node').TestEnvironment;

class CustomEnvironment extends NodeEnvironment {
    constructor(config, context) {
        // CRITICAL: Set localStorage on globalThis BEFORE calling super()
        // This prevents SecurityError when jest-environment-node copies Node.js globals
        // that try to access localStorage (like debug, util-deprecate packages)
        const localStorageMock = {
            getItem: () => null,
            setItem: () => { },
            removeItem: () => { },
            clear: () => { },
        };

        globalThis.localStorage = localStorageMock;
        global.localStorage = localStorageMock;

        // Now call parent constructor which will copy globals
        super(config, context);

        // Also set it on the test global environment
        this.global.localStorage = localStorageMock;
    }

    async setup() {
        await super.setup();
    }

    async teardown() {
        await super.teardown();
    }
}

module.exports = CustomEnvironment;
