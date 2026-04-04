/**
 * @format
 * MittiCard — Soil Health Advisory App
 */

// MUST be first import for @react-navigation/stack to work
import 'react-native-gesture-handler';

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
