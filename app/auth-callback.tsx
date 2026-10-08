import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { Screen } from '@/components/ui';
import { colors } from '@/lib/theme';

/**
 * bitfit://auth-callback: Google / Apple sign-in coming back. The in-app browser
 * session in lib/family already has the code; this route only exists so the
 * router doesn't show "not found" when Android also delivers the link here.
 */
export default function AuthCallback() {
  const router = useRouter();
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/settings/family');
  }, [router]);
  return (
    <Screen section="128bit family">
      <ActivityIndicator color={colors.accent} />
    </Screen>
  );
}
