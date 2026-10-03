import React, { useEffect, useRef, useState } from 'react';
import { TextInput, type StyleProp, type TextStyle } from 'react-native';
import { colors } from '@/lib/theme';

/**
 * A number field that never loses a keypress.
 *
 * The usual controlled TextInput with selectTextOnFocus drops the first key on
 * Android: the field highlights its number, you type, and any redraw that
 * lands before the new text reaches JS hands the native field the old value
 * back — so the key you pressed vanishes. At 45 lb, typing 5 for 50 needed the
 * 5 twice.
 *
 * So while you type, the field owns its text (uncontrolled, `defaultValue`),
 * and the highlight-everything-on-focus is done by hand rather than by the
 * native flag. A change from outside — a +/- tap, a reload — shows through by
 * remounting the field with the new number.
 */
export function NumberBox({
  value,
  onChangeText,
  onDone,
  decimal = false,
  style,
  placeholder = '–',
}: {
  value: string;
  onChangeText?: (text: string) => void;
  /** Called with the final text when editing ends. */
  onDone: (text: string) => void;
  decimal?: boolean;
  style?: StyleProp<TextStyle>;
  placeholder?: string;
}) {
  const ref = useRef<TextInput>(null);
  const text = useRef(value);
  const [version, setVersion] = useState(0);

  // Only a value that differs from what was typed is "from outside".
  useEffect(() => {
    if (value !== text.current) {
      text.current = value;
      setVersion((v) => v + 1);
    }
  }, [value]);

  return (
    <TextInput
      key={version}
      ref={ref}
      style={style}
      defaultValue={value}
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
      placeholder={placeholder}
      placeholderTextColor={colors.textDim}
      onFocus={() => {
        // After the focus has settled, so the keyboard's own cursor placement
        // does not undo it.
        requestAnimationFrame(() => ref.current?.setSelection(0, text.current.length));
      }}
      onChangeText={(t) => {
        text.current = t;
        onChangeText?.(t);
      }}
      onEndEditing={() => onDone(text.current)}
    />
  );
}
