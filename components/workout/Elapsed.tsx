import { useEffect, useState } from 'react';
import { Text, type TextStyle } from 'react-native';
import { formatElapsed } from '@/lib/session-stats';

/**
 * The elapsed clock, ticking on its own. It used to be state on the whole
 * screen, so every exercise card and number box redrew once a second — and a
 * redraw landing just after a keypress, while the number was highlighted,
 * threw the keypress away. Typing 50 over 45 took the 5 twice.
 */
export function Elapsed({ since, style }: { since: Date | null; style: TextStyle }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <Text style={style}>{formatElapsed(since ? now - since.getTime() : 0)}</Text>;
}
