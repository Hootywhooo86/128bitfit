import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import React from 'react';
import { CLERK_PUBLISHABLE_KEY, clerkConfigured } from '@/lib/clerk';

/**
 * Wraps the app in Clerk only when a key is set. Clerk never gates the app: nothing
 * waits on it, and signed out (or offline) everything works exactly as it did.
 */
export function ClerkGate({ children }: { children: React.ReactNode }) {
  if (!clerkConfigured) return <>{children}</>;
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      {children}
    </ClerkProvider>
  );
}
