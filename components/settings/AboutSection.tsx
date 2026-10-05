import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { REPDB } from 'repdb-generated';
import { REPDB_CREDIT, REPDB_URL } from '@/lib/exercise-images';
import { spacing } from '@/lib/theme';
import { settingsStyles as styles } from './settings-styles';

const KOFI_URL = 'https://ko-fi.com/128bit';

/** The tip jar and the data credits, at the foot of Settings. */
export function AboutSection() {
  return (
    <>
      {/* A tip jar, nothing more: every feature stays free whether or not anyone uses it. */}
      <Pressable
        style={[styles.charCard, { marginTop: spacing.lg }]}
        onPress={() =>
          void Linking.openURL(KOFI_URL).catch(() =>
            Alert.alert('Could not open the browser', `The page is ${KOFI_URL}`)
          )
        }
        accessibilityRole="link"
        accessibilityLabel="Buy me a Ko-fi"
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.aiTitle}>Buy me a Ko-fi ☕</Text>
          <Text style={styles.muted}>Like the app? A tip helps keep it going. Optional — everything here stays free →</Text>
        </View>
      </Pressable>

      <View style={styles.aiCard}>
        <Text style={styles.aiTitle}>About / data licenses</Text>
        <Text style={styles.muted}>
          USDA FoodData Central powers the offline food database. Barcode products may also come
          from Open Food Facts and are available under the Open Database License (ODbL). Cached
          barcode results are stored on this phone only.
        </Text>
        <Text style={styles.muted}>
          Exercises: free-exercise-db (public domain).
          {REPDB.exercises.length > 0 ? ` ${REPDB.exercises.length} more, with pictures:` : ''}
        </Text>
        {REPDB.exercises.length > 0 ? (
          <Pressable onPress={() => void Linking.openURL(REPDB_URL)}>
            <Text style={[styles.muted, { textDecorationLine: 'underline' }]}>{REPDB_CREDIT}</Text>
          </Pressable>
        ) : null}
      </View>
    </>
  );
}
