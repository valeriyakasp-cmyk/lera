import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { ModalScreen } from '../src/components/ModalScreen';
import { Chips, Field, Label, PrimaryButton } from '../src/components/ui';
import { categories } from '../src/seed';
import { useStore } from '../src/store';
import { space } from '../src/theme';

const SCOPES = ['עסקי', 'אישי'] as const;

export default function ExpenseNew() {
  const { addExpense, guessCategory } = useStore();
  const router = useRouter();
  const params = useLocalSearchParams<{ receipt?: string }>();
  const fromReceipt = params.receipt === '1';

  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [scope, setScope] = useState<(typeof SCOPES)[number]>('עסקי');
  const [override, setOverride] = useState<string | null>(null);

  // הקטגוריה נקבעת לבד; התיקון הידני נשמר ונלמד.
  const guessed = useMemo(() => guessCategory(vendor), [vendor, guessCategory]);
  const category = override ?? guessed;

  const value = Number(amount);
  const canSave = vendor.trim().length > 0 && Number.isFinite(value) && value > 0;

  return (
    <ModalScreen title={fromReceipt ? 'קבלה' : 'הוצאה חדשה'}>
      <Field label="עסק" value={vendor} onChangeText={setVendor} autoFocus />
      <Field
        label="סכום"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
      />

      <Label>קטגוריה</Label>
      <View style={{ height: space.sm }} />
      <Chips options={categories} value={category as (typeof categories)[number]} onChange={setOverride} />

      <View style={{ height: space.md }} />
      <Label>סוג</Label>
      <View style={{ height: space.sm }} />
      <Chips options={SCOPES} value={scope} onChange={setScope} />

      <View style={{ height: space.lg }} />
      <PrimaryButton
        title="שמירה"
        disabled={!canSave}
        onPress={() => {
          addExpense({
            vendor,
            amount: value,
            category,
            scope: scope === 'עסקי' ? 'business' : 'personal',
            hasReceipt: fromReceipt,
          });
          router.back();
        }}
      />
    </ModalScreen>
  );
}
