import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Card,
  Giant,
  Label,
  PrimaryButton,
  QuietButton,
  Screen,
  SectionSpacer,
  Title,
} from '../../src/components/ui';
import { netThisMonth } from '../../src/finance';
import { money, monthKey } from '../../src/format';
import { useStore } from '../../src/store';
import { colors, font, space } from '../../src/theme';

export default function Vaults() {
  const { state, resetToSeed } = useStore();
  const router = useRouter();
  const now = useMemo(() => new Date(), []);

  const pendingReceipts = state.expenses.filter((e) => e.hasReceipt && !e.sentToAccountant).length;
  const shoppingOpen = state.shopping.filter((s) => !s.bought).length;
  const net = netThisMonth(state, now);
  const allocated = state.allocatedMonths.includes(monthKey(now));

  const confirmReset = () => {
    Alert.alert('איפוס נתונים', 'הנתונים יחזרו למצב ההתחלתי.', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'איפוס', style: 'destructive', onPress: resetToSeed },
    ]);
  };

  return (
    <Screen>
      <Label>עסק</Label>
      <Giant>{money(state.vaults.business)}</Giant>

      <SectionSpacer />

      <Label>חיסכון אישי</Label>
      <Giant>{money(state.vaults.savings)}</Giant>
      <Label style={styles.goal}>יעד: {money(state.vaults.savingsGoal)}</Label>

      <View style={styles.action}>
        <PrimaryButton title="הפקדה" onPress={() => router.push('/deposit')} />
      </View>

      <SectionSpacer />

      <Card style={styles.rows}>
        <Pressable style={styles.row} onPress={() => router.push('/accountant')}>
          <Title style={styles.rowTitle}>רו״ח</Title>
          <Text style={styles.rowMeta}>
            {pendingReceipts > 0 ? `${pendingReceipts} לשליחה` : 'הכול נשלח'}
          </Text>
        </Pressable>

        <View style={styles.divider} />

        <Pressable style={styles.row} onPress={() => router.push('/shopping')}>
          <Title style={styles.rowTitle}>רשימת קניות</Title>
          <Text style={styles.rowMeta}>{shoppingOpen > 0 ? `${shoppingOpen} פריטים` : 'ריקה'}</Text>
        </Pressable>

        <View style={styles.divider} />

        <Pressable style={styles.row} onPress={() => router.push('/monthly')}>
          <Title style={styles.rowTitle}>סיכום חודשי</Title>
          <Text style={styles.rowMeta}>{allocated ? 'חולק' : money(net)}</Text>
        </Pressable>
      </Card>

      <SectionSpacer />
      <QuietButton title="איפוס נתונים" onPress={confirmReset} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  goal: { marginTop: space.xs },
  action: { marginTop: space.md },
  rows: { paddingVertical: space.xs },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  rowTitle: { fontSize: 16 },
  rowMeta: { fontFamily: font.regular, fontSize: 13, color: colors.muted },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline },
});
