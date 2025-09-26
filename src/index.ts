// Re-export the main functionality for backward compatibility
export { LacyLightsServer, ServerConfig, ServerDependencies, ServerInstances } from './server';

// Import and run main function to maintain current behavior (only if this is the main module)
if (require.main === module) {
  // Use async import for the main module
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./main').main();
}
