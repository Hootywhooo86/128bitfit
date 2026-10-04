/**
 * App entry. Expo Router as before; on Android it also registers the
 * home-screen widgets' background task and their refresh. The widget library
 * talks to an Android-only native module, so it is never loaded elsewhere.
 */
import 'expo-router/entry';
import { AppState, Platform } from 'react-native';

if (Platform.OS === 'android') {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { registerWidgetTaskHandler } = require('react-native-android-widget') as typeof import('react-native-android-widget');
  const { widgetTaskHandler } = require('./widgets/task-handler') as typeof import('./widgets/task-handler');
  const { startWidgetRefresh } = require('./lib/widgets') as typeof import('./lib/widgets');
  /* eslint-enable @typescript-eslint/no-require-imports */
  registerWidgetTaskHandler(widgetTaskHandler);
  startWidgetRefresh();
  // Coming back to the app, or leaving it, is when Health Connect's numbers
  // can be read fresh; the widgets pick them up then too.
  const { widgetsChanged } = require('./lib/widget-refresh') as typeof import('./lib/widget-refresh'); // eslint-disable-line @typescript-eslint/no-require-imports
  AppState.addEventListener('change', (state) => {
    if (state === 'active' || state === 'background') widgetsChanged();
  });
}
