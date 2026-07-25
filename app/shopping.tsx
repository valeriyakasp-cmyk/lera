import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Amount,
  Card,
  Empty,
  Field,
  Giant,
  Label,
  PrimaryButton,
  Screen,
  SectionSpacer,
  Title,
} from '../src/components/ui';
import { money } from '../src/format';
import { useStore } from '../src/store';
import { colors, font, space } from '../src/theme';

export default function Shopping() {
  const { state, addShoppingItem, markBought, removeShoppingItem } = useStore();

  const [name, setName] = useState('');
  const [estimate, setEstimate] = useState('');

  const open = state.shopping.filter((item) => !item.bought);
  const total = open.reduce((sum, item) => sum + item.estimate, 0);
  const value = Number(estimate);
  const canAdd = name.trim().length > 0 && Number.isFinite(value) && value > 0;

  return (
    <Screen>
      <Label>סה״כ</Label>
      <Giant>{money(total)}</Giant>

      <SectionSpacer />

      {state.shopping.length === 0 ? (
        <Empty line="הרשימה ריקה" />
      ) : (
        <Card style={styles.list}>
          {state.shopping.map((item, index) => (
            <View key={item.id}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <View style={styles.row}>
                <Pressable
                  style={styles.main}
                  onPress={() => (item.bought ? removeShoppingItem(item.id) : markBought(item.id))}>
                  <Title style={[styles.name, item.bought && styles.bought]}>{item.name}</Title>
                  <Text style={styles.hint}>{item.bought ? 'נקנה · הסרה' : 'סמני נקנה'}</Text>
                </Pressable>
                <Amount value={money(item.estimate)} muted={item.bought} />
              </View>
            </View>
          ))}
        </Card>
      )}

      <SectionSpacer />

      <Field label="פריט" value={name} onChangeText={setName} />
      <Field
        label="מחיר משוער"
        value={estimate}
        onChangeText={setEstimate}
        keyboardType="decimal-pad"
      />
      <PrimaryButton
        title="הוספה"
        disabled={!canAdd}
        onPress={() => {
          addShoppingItem(name, value);
          setName('');
          setEstimate('');
        }}
      />
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
  main: { gap: 2, flexShrink: 1 },
  name: { fontSize: 16 },
  bought: { color: colors.muted, textDecorationLine: 'line-through' },
  hint: { fontFamily: font.regular, fontSize: 11, color: colors.muted },
});
