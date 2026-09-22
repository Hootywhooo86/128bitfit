/**
 * The muscle-map artwork.
 *
 * Every mask is require()d statically because Metro resolves asset paths at
 * build time — a computed `require` would bundle nothing and the map would
 * silently render no colour at all.
 */
import type { ImageSourcePropType } from 'react-native';
import type { MuscleGroup } from './muscle-load';

export const FIGURE = {
  front: {
    body: require('@/assets/figure/front-body.png') as ImageSourcePropType,
    line: require('@/assets/figure/front-line.png') as ImageSourcePropType,
    width: 347,
    height: 760,
  },
  back: {
    body: require('@/assets/figure/back-body.png') as ImageSourcePropType,
    line: require('@/assets/figure/back-line.png') as ImageSourcePropType,
    width: 325,
    height: 760,
  },
} as const;

export const FRONT_MASKS: Partial<Record<MuscleGroup, ImageSourcePropType>> = {
  neck: require('@/assets/figure/front-neck.png'),
  traps: require('@/assets/figure/front-traps.png'),
  shoulders: require('@/assets/figure/front-shoulders.png'),
  chest: require('@/assets/figure/front-chest.png'),
  abdominals: require('@/assets/figure/front-abdominals.png'),
  biceps: require('@/assets/figure/front-biceps.png'),
  triceps: require('@/assets/figure/front-triceps.png'),
  forearms: require('@/assets/figure/front-forearms.png'),
  lats: require('@/assets/figure/front-lats.png'),
  abductors: require('@/assets/figure/front-abductors.png'),
  adductors: require('@/assets/figure/front-adductors.png'),
  quadriceps: require('@/assets/figure/front-quadriceps.png'),
  calves: require('@/assets/figure/front-calves.png'),
};

export const BACK_MASKS: Partial<Record<MuscleGroup, ImageSourcePropType>> = {
  neck: require('@/assets/figure/back-neck.png'),
  traps: require('@/assets/figure/back-traps.png'),
  shoulders: require('@/assets/figure/back-shoulders.png'),
  lats: require('@/assets/figure/back-lats.png'),
  'middle back': require('@/assets/figure/back-middle-back.png'),
  'lower back': require('@/assets/figure/back-lower-back.png'),
  triceps: require('@/assets/figure/back-triceps.png'),
  forearms: require('@/assets/figure/back-forearms.png'),
  glutes: require('@/assets/figure/back-glutes.png'),
  hamstrings: require('@/assets/figure/back-hamstrings.png'),
  calves: require('@/assets/figure/back-calves.png'),
  abductors: require('@/assets/figure/back-abductors.png'),
  adductors: require('@/assets/figure/back-adductors.png'),
};
