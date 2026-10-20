/**
 * Clerk sign-in, offered next to the 128bit family (Supabase) account rather than
 * replacing it. The publishable key is public (it ships in every build); without one
 * the app runs as before and Settings → Clerk account says sign-in isn't set up.
 */
export const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';

export const clerkConfigured = CLERK_PUBLISHABLE_KEY.startsWith('pk_');
