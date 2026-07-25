import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { ModalScreen } from '../src/components/ModalScreen';
import { Chips, Field, Label, PrimaryButton } from '../src/components/ui';
import type { PaymentTerms } from '../src/types';
import { useStore } from '../src/store';
import { space } from '../src/theme';

const OPTIONS = ['שוטף+30', 'שוטף+60', '50/50', 'מותאם'] as const;
type Option = (typeof OPTIONS)[number];

function toTerms(option: Option, customDays: string): PaymentTerms {
  if (option === 'שוטף+30') return { kind: 'net', days: 30 };
  if (option === 'שוטף+60') return { kind: 'net', days: 60 };
  if (option === '50/50') return { kind: 'half', days: 30 };
  return { kind: 'custom', days: Number(customDays) || 30 };
}

export default function ClientNew() {
  const { addClient } = useStore();
  const router = useRouter();

  const [name, setName] = useState('');
  const [option, setOption] = useState<Option>('שוטף+30');
  const [customDays, setCustomDays] = useState('45');

  const canSave = name.trim().length > 0;

  return (
    <ModalScreen title="לקוח חדש">
      <Field
        label="שם"
        value={name}
        onChangeText={setName}
        autoFocus
        returnKeyType="done"
      />

      <Label>איך משלמים לך?</Label>
      <View style={{ height: space.sm }} />
      <Chips options={OPTIONS} value={option} onChange={setOption} />

      {option === 'מותאם' ? (
        <View style={{ marginTop: space.md }}>
          <Field
            label="ימים"
            value={customDays}
            onChangeText={setCustomDays}
            keyboardType="number-pad"
          />
        </View>
      ) : null}

      <View style={{ height: space.lg }} />
      <PrimaryButton
        title="שמירה"
        disabled={!canSave}
        onPress={() => {
          addClient(name, toTerms(option, customDays));
          router.back();
        }}
      />
    </ModalScreen>
  );
}
