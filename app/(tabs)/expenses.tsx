import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Amount,
  Card,
  Chips,
  Empty,
  Giant,
  Label,
  PrimaryButton,
  Screen,
  SectionSpacer,
  Title,
} from '../../src/components/ui';
import { byCategory, spentThisMonth } from '../../src/finance';
import { money, shortDate } from '../../src/format';
import { categories } from '../../src/seed';
import { useStore } from '../../src/store';
import { colors, font, radius, space } from '../../src/theme';

export default function Expenses() {
  const { state, setExpenseCategory, toggleExpenseScope } = useStore();
  const router = useRouter();
  const now = useMemo(() => new Date(), []);
  const [editing, setEditing] = useState<string | null>(null);

  const spent = spentThisMonth(state, now);
  const slices = byCategory(state, now);
  const editingExpense = state.expenses.find((e) => e.id === editing) ?? null;

  return (
    <Screen>
      <Label>יצא החודש</Label>
      <Giant>{money(spent)}</Giant>

      <SectionSpacer />

      {state.expenses.length === 0 ? (
        <Empty
          line="אין עדיין הוצאות"
          action={{ title: 'הוצאה חדשה', onPress: () => router.push('/expense-new') }}
        />
      ) : (
        <Card style={styles.list}>
          {state.expenses.map((expense, index) => (
            <View key={expense.id}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <View style={styles.row}>
                <Pressable style={styles.rowMain} onPress={() => setEditing(expense.id)}>
                  <Title style={styles.vendor}>{expense.vendor}</Title>
                  <Label>
                    {expense.category} · {shortDate(expense.at)}
                  </Label>
                </Pressable>
                <View style={styles.rowEnd}>
                  <Amount
                    value={money(expense.amount)}
                    muted={expense.scope === 'personal'}
                  />
                  <Pressable onPress={() => toggleExpenseScope(expense.id)} hitSlop={8}>
                    <Text style={styles.scope}>
                      {expense.scope === 'business' ? 'עסקי' : 'אישי'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
        </Card>
      )}

      {slices.length > 0 ? (
        <>
          <SectionSpacer />
          <Label>קטגוריות</Label>
          <Card style={styles.list}>
            {slices.map((slice, index) => (
              <View key={slice.category}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <View style={styles.row}>
                  <Title style={styles.vendor}>{slice.category}</Title>
                  <Amount value={money(slice.amount)} />
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <Modal
        visible={editingExpense !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setEditing(null)}>
        <Pressable style={styles.backdrop} onPress={() => setEditing(null)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <Label>{editingExpense?.vendor ?? ''}</Label>
            <View style={{ height: space.md }} />
            <Chips
              options={categories}
              value={(editingExpense?.category ?? 'אחר') as (typeof categories)[number]}
              onChange={(next) => {
                if (editingExpense) setExpenseCategory(editingExpense.id, next);
                setEditing(null);
              }}
            />
            <View style={{ height: space.md }} />
            <PrimaryButton title="סגירה" onPress={() => setEditing(null)} />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: space.xs },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  rowMain: { gap: 2, flexShrink: 1 },
  rowEnd: { alignItems: 'flex-start', gap: 2 },
  vendor: { fontSize: 16 },
  scope: { fontFamily: font.regular, fontSize: 11, color: colors.muted },
  backdrop: { flex: 1, backgroundColor: 'rgba(20,17,15,0.25)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.md,
    paddingBottom: space.lg,
  },
});
