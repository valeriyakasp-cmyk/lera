import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, font, radius, space, type } from '../theme';

/** מספר-ענק. תמיד הדבר הראשון במסך. */
export function Giant({ children }: { children: React.ReactNode }) {
  return (
    <Text style={[type.giant, styles.tabularNumbers]} numberOfLines={1} adjustsFontSizeToFit>
      {children}
    </Text>
  );
}

type TextBits = { children: React.ReactNode; style?: object | object[]; numberOfLines?: number };

export function Title({ children, style, numberOfLines }: TextBits) {
  return (
    <Text style={[type.title, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function Label({ children, style, numberOfLines }: TextBits) {
  return (
    <Text style={[type.label, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function Amount({ value, muted }: { value: string; muted?: boolean }) {
  return (
    <Text
      style={[
        styles.amount,
        styles.tabularNumbers,
        muted ? { color: colors.muted } : null,
      ]}>
      {value}
    </Text>
  );
}

export function Screen({
  children,
  scroll = true,
  padded = true,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: insets.top + space.md,
    paddingBottom: insets.bottom + 120,
    paddingHorizontal: padded ? space.md : 0,
  };

  if (!scroll) {
    return <View style={[styles.screen, padding]}>{children}</View>;
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={padding}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );
}

/** משטח עדין — בלי צל דרמטי. */
export function Card({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

export function Hairline() {
  return <View style={styles.hairline} />;
}

export function PrimaryButton({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.primary,
        disabled && styles.primaryDisabled,
        pressed && !disabled && styles.pressed,
      ]}>
      <Text style={styles.primaryText}>{title}</Text>
    </Pressable>
  );
}

export function QuietButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.quiet, pressed && styles.pressed]}>
      <Text style={styles.quietText}>{title}</Text>
    </Pressable>
  );
}

/** Empty state = שורה אחת + כפתור. לא איור, לא הסבר. */
export function Empty({ line, action }: { line: string; action?: { title: string; onPress: () => void } }) {
  return (
    <View style={styles.empty}>
      <Label>{line}</Label>
      {action ? (
        <View style={styles.emptyAction}>
          <PrimaryButton title={action.title} onPress={action.onPress} />
        </View>
      ) : null}
    </View>
  );
}

export function Field({
  label,
  style,
  ...rest
}: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Label>{label}</Label>
      <TextInput
        placeholderTextColor={colors.muted}
        style={[styles.input, style]}
        {...rest}
      />
    </View>
  );
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** פוטנציאל 1–5 — נקודות, לא כוכבים צעקניים. */
export function Dots({
  value,
  onChange,
}: {
  value: number;
  onChange?: (next: number) => void;
}) {
  return (
    <View style={styles.dots}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          disabled={!onChange}
          onPress={() => onChange?.(n)}
          hitSlop={6}
          style={[styles.dot, n <= value && styles.dotFilled]}
        />
      ))}
    </View>
  );
}

export function SectionSpacer() {
  return <View style={{ height: space.lg }} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  tabularNumbers: { fontVariant: ['tabular-nums'], writingDirection: 'rtl' },
  amount: { fontFamily: font.medium, fontSize: 17, color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryDisabled: { opacity: 0.35 },
  primaryText: { fontFamily: font.medium, fontSize: 16, color: '#FFFFFF' },
  quiet: { paddingVertical: 14, alignItems: 'center' },
  quietText: { fontFamily: font.regular, fontSize: 15, color: colors.muted },
  pressed: { opacity: 0.6 },
  empty: { paddingVertical: space.lg, alignItems: 'flex-start', gap: space.md },
  emptyAction: { alignSelf: 'stretch' },
  field: { gap: space.xs, marginBottom: space.md },
  input: {
    fontFamily: font.regular,
    fontSize: 17,
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipText: { fontFamily: font.regular, fontSize: 14, color: colors.muted },
  chipTextActive: { fontFamily: font.medium, color: colors.accent },
  dots: { flexDirection: 'row-reverse', gap: 6, alignItems: 'center' },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.muted,
  },
  dotFilled: { backgroundColor: colors.accent, borderColor: colors.accent },
});
