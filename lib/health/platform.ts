/**
 * What the phone's health store is called, for every sentence the app shows.
 * Android has Health Connect; iPhone has Apple Health.
 */
import { Platform } from 'react-native';

export const HEALTH_APP = Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';

/**
 * Why there is no health data at all on this phone. On an iPhone, Apple Health
 * is always there; what is missing is the entitlement, which a copy sideloaded
 * with a free Apple ID cannot have.
 */
export const HEALTH_UNAVAILABLE =
  Platform.OS === 'ios'
    ? "Apple Health can't be used in this copy of the app. Test copies installed with a free Apple ID aren't allowed to use it."
    : 'Health Connect is not available on this phone.';
