import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ModalScreen } from '../src/components/ModalScreen';
import { colors, font, radius, space } from '../src/theme';

const ACTIONS: Array<{ title: string; href: string }> = [
  { title: 'צילום קבלה', href: '/expense-new?receipt=1' },
  { title: 'חשבונית חדשה', href: '/invoice-new' },
  { title: 'לקוח חדש', href: '/client-new' },
  { title: 'הפקדה', href: '/deposit' },
  { title: 'שמירת סרטון', href: '/video-new' },
];

export default function NewAction() {
  const router = useRouter();

  return (
    <ModalScreen title="הוספה">
      <View style={styles.list}>
        {ACTIONS.map((action, index) => (
          <Pressable
            key={action.href}
            onPress={() => router.replace(action.href as never)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
            <Text style={styles.rowText}>{action.title}</Text>
            {index < ACTIONS.length - 1 ? <View style={styles.divider} /> : null}
          </Pressable>
        ))}
      </View>
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  list: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    paddingHorizontal: space.md,
  },
  row: { paddingVertical: 18 },
  rowText: { fontFamily: font.regular, fontSize: 17, color: colors.text, textAlign: 'right' },
  divider: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    left: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
  },
});
