import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { InteractionManager } from 'react-native';
import { syncFamily } from './index';

/**
 * Sends to the family feed when this screen comes into view — after the
 * screen has settled, never ahead of its own loading. Throttled inside
 * syncFamily; does nothing when signed out or with sharing off.
 */
export function useFamilySync(): void {
  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        void syncFamily();
      });
      return () => task.cancel();
    }, [])
  );
}
