import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
import { expectedPayments, openAmountFor, termsLabel } from '../../src/finance';
import { money, shortDate } from '../../src/format';
import { useStore } from '../../src/store';
import { colors, font, space } from '../../src/theme';

export default function Clients() {
  const { state, togglePaid } = useStore();
  const router = useRouter();
  const now = useMemo(() => new Date(), []);

  const open = expectedPayments(state, now);
  const totalOpen = open.reduce((sum, row) => sum + row.amount, 0);

  return (
    <Screen>
      <Label>פתוח</Label>
      <Giant>{money(totalOpen)}</Giant>

      <SectionSpacer />

      {state.clients.length === 0 ? (
        <Empty
          line="אין עדיין לקוחות"
          action={{ title: 'לקוח חדש', onPress: () => router.push('/client-new') }}
        />
      ) : (
        <Card style={styles.list}>
          {state.clients.map((client, index) => (
            <View key={client.id}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <View style={styles.clientRow}>
                <View style={styles.clientMain}>
                  <Title style={styles.clientName}>{client.name}</Title>
                  <Label>{termsLabel(client.terms)}</Label>
                </View>
                <Amount value={money(openAmountFor(state, client.id, now))} />
              </View>
            </View>
          ))}
        </Card>
      )}

      <SectionSpacer />

      <Label>חשבוניות פתוחות</Label>
      {state.invoices.filter((i) => i.status === 'open').length === 0 ? (
        <Empty
          line="אין חשבוניות פתוחות"
          action={{ title: 'חשבונית חדשה', onPress: () => router.push('/invoice-new') }}
        />
      ) : (
        <Card style={styles.list}>
          {state.invoices
            .filter((invoice) => invoice.status === 'open')
            .map((invoice, index) => {
              const client = state.clients.find((c) => c.id === invoice.clientId);
              const parts = open.filter((row) => row.invoiceId === invoice.id);
              const late = parts.some((row) => row.late);
              const nextDue = parts[0]?.dueAt;

              return (
                <View key={invoice.id}>
                  {index > 0 ? <View style={styles.divider} /> : null}
                  <Pressable
                    onPress={() => togglePaid(invoice.id)}
                    style={({ pressed }) => [styles.invoiceRow, pressed && { opacity: 0.6 }]}>
                    <View style={styles.clientMain}>
                      <Title style={styles.clientName}>{client?.name ?? 'לקוח'}</Title>
                      <Label>
                        {nextDue ? shortDate(nextDue) : ''}
                        {late ? ' · באיחור' : ''}
                      </Label>
                    </View>
                    <View style={styles.invoiceLeft}>
                      <Amount value={money(invoice.amount)} />
                      <Text style={styles.markPaid}>סמני שולמה</Text>
                    </View>
                  </Pressable>
                </View>
              );
            })}
        </Card>
      )}

      {state.invoices.some((i) => i.status === 'paid') ? (
        <>
          <SectionSpacer />
          <Label>שולמו</Label>
          <Card style={styles.list}>
            {state.invoices
              .filter((invoice) => invoice.status === 'paid')
              .map((invoice, index) => {
                const client = state.clients.find((c) => c.id === invoice.clientId);
                return (
                  <View key={invoice.id}>
                    {index > 0 ? <View style={styles.divider} /> : null}
                    <Pressable
                      onPress={() => togglePaid(invoice.id)}
                      style={({ pressed }) => [styles.invoiceRow, pressed && { opacity: 0.6 }]}>
                      <View style={styles.clientMain}>
                        <Title style={[styles.clientName, styles.paid]}>
                          {client?.name ?? 'לקוח'}
                        </Title>
                        <Label>{invoice.paidAt ? shortDate(invoice.paidAt) : ''}</Label>
                      </View>
                      <Amount value={money(invoice.amount)} muted />
                    </Pressable>
                  </View>
                );
              })}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: space.xs },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline },
  clientRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  invoiceRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  invoiceLeft: { alignItems: 'flex-start', gap: 2 },
  clientMain: { gap: 2, flexShrink: 1 },
  clientName: { fontSize: 16 },
  paid: { color: colors.muted },
  markPaid: { fontFamily: font.regular, fontSize: 11, color: colors.muted },
});
