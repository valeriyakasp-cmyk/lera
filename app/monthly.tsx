import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ModalScreen } from '../src/components/ModalScreen';
import { Giant, Label, PrimaryButton } from '../src/components/ui';
import { netThisMonth } from '../src/finance';
import { money, monthKey } from '../src/format';
import { useStore } from '../src/store';
import { colors, font, radius, space } from '../src/theme';

type Key = 'savings' | 'business' | 'fun';

const ROWS: Array<{ key: Key; label: string }> = [
  { key: 'savings', label: 'חיסכון אישי' },
  { key: 'business', label: 'עסק' },
  { key: 'fun', label: 'בזבוזים' },
];

const STEPS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];

export default function Monthly() {
  const { state, setSplit, allocate } = useStore();
  const router = useRouter();
  const now = useMemo(() => new Date(), []);

  const [split, setLocalSplit] = useState(state.split);
  const [done, setDone] = useState(false);

  const net = Math.max(netThisMonth(state, now), 0);
  const key = monthKey(now);
  const already = state.allocatedMonths.includes(key);
  const total = split.savings + split.business + split.fun;

  /** שינוי פס אחד מאזן את השניים האחרים כך שהסכום נשאר 100. */
  const change = (target: Key, next: number) => {
    const others = ROWS.map((r) => r.key).filter((k) => k !== target) as [Key, Key];
    const remaining = 100 - next;
    const currentOthers = split[others[0]] + split[others[1]];

    const first =
      currentOthers === 0
        ? Math.round(remaining / 2)
        : Math.round((split[others[0]] / currentOthers) * remaining);

    setLocalSplit({
      [target]: next,
      [others[0]]: first,
      [others[1]]: remaining - first,
    } as unknown as typeof split);
  };

  if (done || already) {
    return (
      <ModalScreen title="סיכום חודשי">
        <Label>נוסף לקופות.</Label>
        <View style={{ height: space.lg }} />
        <PrimaryButton title="סגירה" onPress={() => router.back()} />
      </ModalScreen>
    );
  }

  return (
    <ModalScreen title="סיכום חודשי">
      <Label>נטו</Label>
      <Giant>{money(net)}</Giant>

      <View style={{ height: space.lg }} />

      {ROWS.map((row) => (
        <View key={row.key} style={styles.row}>
          <View style={styles.rowHead}>
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Text style={styles.rowAmount}>
              {money((net * split[row.key]) / 100)} · {split[row.key]}%
            </Text>
          </View>

          <View style={styles.track}>
            <View style={[styles.fill, { width: `${split[row.key]}%` }]} />
          </View>

          <View style={styles.steps}>
            {STEPS.map((step) => (
              <Pressable
                key={step}
                hitSlop={4}
                onPress={() => change(row.key, step)}
                style={styles.step}
              />
            ))}
          </View>
        </View>
      ))}

      <View style={{ height: space.md }} />
      <PrimaryButton
        title="בצעי חלוקה"
        disabled={total !== 100 || net <= 0}
        onPress={() => {
          setSplit(split);
          allocate(net, key);
          setDone(true);
        }}
      />
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: space.md },
  rowHead: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.xs,
  },
  rowLabel: { fontFamily: font.medium, fontSize: 16, color: colors.text },
  rowAmount: {
    fontFamily: font.regular,
    fontSize: 14,
    color: colors.muted,
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.hairline,
    overflow: 'hidden',
    flexDirection: 'row-reverse',
  },
  fill: { height: 8, backgroundColor: colors.accent },
  steps: { flexDirection: 'row-reverse', marginTop: 4 },
  step: { flex: 1, height: 18 },
});
