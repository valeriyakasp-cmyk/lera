import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  Amount,
  Card,
  Empty,
  Label,
  PrimaryButton,
  Screen,
  SectionSpacer,
  Title,
} from '../src/components/ui';
import { money, shortDate } from '../src/format';
import { useStore } from '../src/store';
import { colors, font, space } from '../src/theme';

export default function Accountant() {
  const { state, markSentToAccountant } = useStore();

  const receipts = state.expenses.filter((e) => e.hasReceipt);
  const invoices = state.invoices;
  const pending = receipts.filter((e) => !e.sentToAccountant).length;

  const send = () => {
    const count = markSentToAccountant();
    Alert.alert(count > 0 ? `${count} נשלחו.` : 'אין מה לשלוח.');
  };

  return (
    <Screen>
      <Label>קבלות רכישה</Label>
      {receipts.length === 0 ? (
        <Empty line="אין עדיין קבלות" />
      ) : (
        <Card style={styles.list}>
          {receipts.map((expense, index) => (
            <View key={expense.id}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <View style={styles.row}>
                <View style={styles.main}>
                  <Title style={styles.name}>{expense.vendor}</Title>
                  <Label>{shortDate(expense.at)}</Label>
                </View>
                <View style={styles.end}>
                  <Amount value={money(expense.amount)} />
                  {expense.sentToAccountant ? <Text style={styles.tag}>נשלח</Text> : null}
                </View>
              </View>
            </View>
          ))}
        </Card>
      )}

      <SectionSpacer />

      <Label>חשבוניות שהוצאתי</Label>
      {invoices.length === 0 ? (
        <Empty line="אין עדיין חשבוניות" />
      ) : (
        <Card style={styles.list}>
          {invoices.map((invoice, index) => {
            const client = state.clients.find((c) => c.id === invoice.clientId);
            return (
              <View key={invoice.id}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <View style={styles.row}>
                  <View style={styles.main}>
                    <Title style={styles.name}>{client?.name ?? 'לקוח'}</Title>
                    <Label>{shortDate(invoice.issuedAt)}</Label>
                  </View>
                  <Amount value={money(invoice.amount)} />
                </View>
              </View>
            );
          })}
        </Card>
      )}

      <SectionSpacer />
      <PrimaryButton title="שלחי לרו״ח" onPress={send} disabled={pending === 0} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: space.xs, marginTop: space.sm },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  main: { gap: 2, flexShrink: 1 },
  end: { alignItems: 'flex-start', gap: 2 },
  name: { fontSize: 16 },
  tag: { fontFamily: font.regular, fontSize: 11, color: colors.muted },
});
