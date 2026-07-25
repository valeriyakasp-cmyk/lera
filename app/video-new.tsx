import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { ModalScreen } from '../src/components/ModalScreen';
import { Dots, Field, Label, PrimaryButton } from '../src/components/ui';
import { useStore } from '../src/store';
import { space } from '../src/theme';

/**
 * שני שדות ונגמר. אינסטגרם מגבילה משיכת תוכן מקישור,
 * ולכן הזרימה הידנית היא אזרח שווה ולא פלאן ב'.
 */
export default function VideoNew() {
  const { addVideo } = useStore();
  const router = useRouter();

  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [potential, setPotential] = useState(3);

  const canSave = title.trim().length > 0 || url.trim().length > 0;

  return (
    <ModalScreen title="שמירת סרטון">
      <Field
        label="קישור"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        keyboardType="url"
        placeholder="https://"
        autoFocus
      />
      <Field label="שם" value={title} onChangeText={setTitle} />
      <Field label="תיאור" value={note} onChangeText={setNote} multiline />

      <Label>פוטנציאל</Label>
      <View style={{ height: space.sm }} />
      <Dots value={potential} onChange={setPotential} />

      <View style={{ height: space.lg }} />
      <PrimaryButton
        title="שמירה"
        disabled={!canSave}
        onPress={() => {
          addVideo({ url, title: title.trim() || 'סרטון', note, potential });
          router.back();
        }}
      />
    </ModalScreen>
  );
}
