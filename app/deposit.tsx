import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { ModalScreen } from '../src/components/ModalScreen';
import { Chips, Field, Label, PrimaryButton } from '../src/components/ui';
import { useStore } from '../src/store';
import { space } from '../src/theme';

const TARGETS = ['חיסכון אישי', 'עסק'] as const;

export default function Deposit() {
  const { deposit } = useStore();
  const router = useRouter();

  const [target, setTarget] = useState<(typeof TARGETS)[number]>('חיסכון אישי');
  const [amount, setAmount] = useState('');

  const value = Number(amount);
  const canSave = Number.isFinite(value) && value > 0;

  return (
    <ModalScreen title="הפקדה">
      <Label>לאן</Label>
      <View style={{ height: space.sm }} />
      <Chips options={TARGETS} value={target} onChange={setTarget} />

      <View style={{ height: space.md }} />
      <Field
        label="סכום"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        autoFocus
      />

      <View style={{ height: space.lg }} />
      <PrimaryButton
        title="אישור"
        disabled={!canSave}
        onPress={() => {
          deposit(target === 'עסק' ? 'business' : 'savings', value);
          router.back();
        }}
      />
    </ModalScreen>
  );
}
