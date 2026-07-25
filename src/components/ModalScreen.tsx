import { useRouter } from 'expo-router';
import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, font, space } from '../theme';

/** מסך מודאלי: כותרת קצרה, סגירה, ופעולה אחת בתחתית. */
export function ModalScreen({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Text style={styles.title}>{title}</Text>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.close}>סגירה</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.lg }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingBottom: space.md,
  },
  title: { fontFamily: font.medium, fontSize: 18, color: colors.text },
  close: { fontFamily: font.regular, fontSize: 15, color: colors.muted },
  body: { paddingHorizontal: space.md },
});
