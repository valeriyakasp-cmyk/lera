import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Ring } from '../../src/components/Ring';
import {
  Amount,
  Card,
  Empty,
  Giant,
  Label,
  Screen,
  SectionSpacer,
  Title,
} from '../../src/components/ui';
import {
  byCategory,
  expectedPayments,
  expectedTotal,
  lateCount,
  netThisMonth,
  spentThisMonth,
} from '../../src/finance';
import { money, monthKey, shortDate } from '../../src/format';
import { useStore } from '../../src/store';
import { colors, font, radius, space } from '../../src/theme';

export default function Home() {
  const { state } = useStore();
  const router = useRouter();
  const now = useMemo(() => new Date(), []);

  const timeline = expectedPayments(state, now);
  const expected = expectedTotal(state, now);
  const spent = spentThisMonth(state, now);
  const net = netThisMonth(state, now);
  const late = lateCount(state, now);
  const slices = byCategory(state, now);

  const currentMonth = monthKey(now);
  const summaryDue = now.getDate() === 1 && !state.allocatedMonths.includes(currentMonth);

  return (
    <Screen>
      {late > 0 ? (
        <Pressable onPress={() => router.push('/(tabs)/clients')} style={styles.alert}>
          <Text style={styles.alertText}>{late} באיחור</Text>
        </Pressable>
      ) : null}

      {summaryDue ? (
        <Pressable onPress={() => router.push('/monthly')} style={styles.alert}>
          <Text style={styles.alertText}>סיכום חודשי מוכן</Text>
        </Pressable>
      ) : null}

      <Label>צפוי להיכנס</Label>
      <Giant>{money(expected)}</Giant>

      {timeline.length === 0 ? (
        <Empty
          line="אין חשבוניות פתוחות"
          action={{ title: 'חשבונית חדשה', onPress: () => router.push('/invoice-new') }}
        />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.timeline}>
          {timeline.map((row, index) => (
            <Pressable
              key={`${row.invoiceId}-${index}`}
              onPress={() => router.push('/(tabs)/clients')}
              style={styles.point}>
              <View style={[styles.dot, row.late && styles.dotLate]} />
              <Text style={styles.pointDate}>{shortDate(row.dueAt)}</Text>
              <Text style={styles.pointAmount}>{money(row.amount)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <SectionSpacer />

      <Label>יצא החודש</Label>
      <View style={styles.spentRow}>
        <Giant>{money(spent)}</Giant>
        <Ring slices={slices} />
      </View>

      {slices.length > 0 ? (
        <Card style={styles.categories}>
          {slices.slice(0, 4).map((slice) => (
            <View key={slice.category} style={styles.categoryRow}>
              <Title style={styles.categoryName}>{slice.category}</Title>
              <Amount value={money(slice.amount)} />
            </View>
          ))}
        </Card>
      ) : null}

      <SectionSpacer />

      <Label>נטו</Label>
      <Giant>{money(net)}</Giant>
    </Screen>
  );
}

const styles = StyleSheet.create({
  alert: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    paddingVertical: 10,
    paddingHorizontal: space.sm,
    marginBottom: space.md,
  },
  alertText: { fontFamily: font.medium, fontSize: 14, color: colors.accent, textAlign: 'right' },
  timeline: { flexDirection: 'row-reverse', gap: space.lg, paddingVertical: space.md },
  point: { alignItems: 'flex-end', gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.text },
  dotLate: { backgroundColor: colors.accent },
  pointDate: { fontFamily: font.regular, fontSize: 12, color: colors.muted },
  pointAmount: {
    fontFamily: font.medium,
    fontSize: 14,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  spentRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  categories: { marginTop: space.md, gap: space.sm },
  categoryRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryName: { fontSize: 15 },
});
