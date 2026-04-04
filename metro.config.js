const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * Windows fix: Metro FallbackWatcher crashes trying to watch non-existent
 * directories inside @react-native/gradle-plugin (Java build output folders).
 * blockList excludes them from the file watcher — JS bundling is unaffected.
 */
const config = {
  resolver: {
    blockList: [
      // Exclude gradle plugin compiled output folders that don't exist on Windows
      /.*\\@react-native\\gradle-plugin\\.*\.bin\\.*/,
      /.*\/node_modules\/@react-native\/gradle-plugin\/.*\/bin\/.*/,
    ],
  },
  watchFolders: [],
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
