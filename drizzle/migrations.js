// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_init.sql';
import m0001 from './0001_busy_lenny_balinger.sql';
import m0002 from './0002_fuel_food_logging.sql';
import m0003 from './0003_sharp_bromley.sql';
import m0004 from './0004_public_garia.sql';
import m0005 from './0005_blue_mulholland_black.sql';

export default {
  journal,
  migrations: {
    m0000,
    m0001,
    m0002,
    m0003,
    m0004,
    m0005,
  },
};
