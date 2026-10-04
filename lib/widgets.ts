/**
 * Connects widgetsChanged() (lib/widget-refresh) to the Android widgets.
 * Called once from index.ts on Android; nothing else imports this.
 */
import { requestWidgetUpdate } from 'react-native-android-widget';
import { setWidgetRefresher } from './widget-refresh';
import { WIDGET_NAMES, renderFor } from '@/widgets/task-handler';

export function startWidgetRefresh(): void {
  setWidgetRefresher(async () => {
    for (const name of WIDGET_NAMES) {
      await requestWidgetUpdate({
        widgetName: name,
        renderWidget: (info) => renderFor(name, info.width),
      }).catch(() => undefined);
    }
  });
}
