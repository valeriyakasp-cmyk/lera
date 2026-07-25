import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { ModalScreen } from '../src/components/ModalScreen';
import { Chips, Empty, Field, Label, PrimaryButton } from '../src/components/ui';
import { scheduleFor, termsLabel } from '../src/finance';
import { money, shortDate } from '../src/format';
import { useStore } from '../src/store';
import { space } from '../src/theme';

export default function InvoiceNew() {
  const { state, addInvoice } = useStore();
  const router = useRouter();

  const [clientName, setClientName] = useState(state.clients[0]?.name ?? '');
  const [amount, setAmount] = useState('');

  const client = state.clients.find((c) => c.name === clientName) ?? state.clients[0];
  const value = Number(amount);
  const canSave = Boolean(client) && Number.isFinite(value) && value > 0;

  // תאריך הצפי מחושב לבד מתנאי הלקוח — המשתמשת רק רואה אותו.
  const preview =
    client && canSave
      ? scheduleFor(
          {
            id: 'preview',
            clientId: client.id,
            amount: value,
            issuedAt: new Date().toISOString(),
            status: 'open',
          },
          client.terms,
        )
      : [];

  if (state.clients.length === 0) {
    return (
      <ModalScreen title="חשבונית חדשה">
        <Empty
          line="אין עדיין לקוחות"
          action={{ title: 'לקוח חדש', onPress: () => router.replace('/client-new') }}
        />
      </ModalScreen>
    );
  }

  return (
    <ModalScreen title="חשבונית חדשה">
      <Label>לקוח</Label>
      <View style={{ height: space.sm }} />
      <Chips
        options={state.clients.map((c) => c.name)}
        value={clientName}
        onChange={setClientName}
      />

      <View style={{ height: space.md }} />
      <Field
        label="סכום"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        autoFocus
      />

      {client ? <Label>{termsLabel(client.terms)}</Label> : null}

      {preview.length > 0 ? (
        <View style={{ marginTop: space.md, gap: 4 }}>
          {preview.map((part, index) => (
            <Label key={index}>
              {shortDate(part.dueAt.toISOString())} · {money(part.amount)}
            </Label>
          ))}
        </View>
      ) : null}

      <View style={{ height: space.lg }} />
      <PrimaryButton
        title="שמירה"
        disabled={!canSave}
        onPress={() => {
          if (!client) return;
          addInvoice(client.id, value);
          router.back();
        }}
      />
    </ModalScreen>
  );
}
