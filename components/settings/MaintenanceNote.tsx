import { Text, View } from 'react-native';
import {
  basalMetabolicRate,
  suggestCalorieTarget,
  totalDailyEnergy,
  type ActivityLevel,
  type CalorieProfile,
  type Goal,
} from '@/lib/body';
import { settingsStyles as styles } from './settings-styles';

/**
 * What these two choices actually do to the numbers.
 *
 * Shown live, because "×1.55" means nothing on its own and the point of the
 * setting is the calorie figure at the end of it. Renders nothing when the
 * profile is too incomplete to compute one — a maintenance figure invented
 * from a missing height and age would be exactly the made-up measurement the
 * app exists to avoid.
 */
export function MaintenanceNote({
  profile,
  activity,
  goal,
}: {
  profile: CalorieProfile | null;
  activity: ActivityLevel;
  goal: Goal;
}) {
  if (!profile) return null;
  const withActivity = { ...profile, activity };
  const bmr = basalMetabolicRate(withActivity);
  const tdee = totalDailyEnergy(withActivity);
  if (bmr == null || tdee == null) {
    return (
      <Text style={styles.muted}>
        Add your height, birthday and a weigh-in and this will show what you burn in a day.
      </Text>
    );
  }
  const target = suggestCalorieTarget(withActivity, goal);
  return (
    <View style={styles.calcCard}>
      <Text style={styles.calcRow}>
        Resting burn <Text style={styles.calcNum}>{Math.round(bmr).toLocaleString()}</Text> kcal
      </Text>
      <Text style={styles.calcRow}>
        Maintenance <Text style={styles.calcNum}>{Math.round(tdee).toLocaleString()}</Text> kcal
      </Text>
      <Text style={styles.calcRow}>
        Suggested target <Text style={styles.calcNum}>{target.toLocaleString()}</Text> kcal
      </Text>
      <Text style={styles.optDetail}>
        An estimate from height, weight, age and how active you say you are — not a
        measurement. Set the target field above to this if you want it. Whatever you enter,
        it is never allowed below your resting burn.
      </Text>
    </View>
  );
}
