import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, font } from '../../src/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_BAR_HEIGHT = 58;

const TABS: Array<{ name: string; title: string; icon: IconName }> = [
  { name: 'index', title: 'בית', icon: 'home-outline' },
  { name: 'clients', title: 'לקוחות', icon: 'people-outline' },
  { name: 'expenses', title: 'הוצאות', icon: 'card-outline' },
  { name: 'inspiration', title: 'השראה', icon: 'play-outline' },
  { name: 'vaults', title: 'קופות', icon: 'wallet-outline' },
];

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.muted,
          tabBarLabelStyle: { fontFamily: font.regular, fontSize: 11 },
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.hairline,
            borderTopWidth: StyleSheet.hairlineWidth,
            height: TAB_BAR_HEIGHT + insets.bottom,
            paddingTop: 6,
            paddingBottom: insets.bottom,
          },
          sceneStyle: { backgroundColor: colors.bg },
        }}>
        {TABS.map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.title,
              tabBarIcon: ({ color }) => <Ionicons name={tab.icon} size={22} color={color} />,
            }}
          />
        ))}
      </Tabs>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="הוספה"
        onPress={() => router.push('/new')}
        // מרחף מעל סרגל הניווט ולא עליו — אחרת הוא חוסם את הטאב האמצעי.
        style={({ pressed }) => [
          styles.plus,
          { bottom: insets.bottom + TAB_BAR_HEIGHT + 12 },
          pressed && { opacity: 0.75 },
        ]}>
        <Text style={styles.plusGlyph}>＋</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  plus: {
    position: 'absolute',
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  plusGlyph: {
    color: '#FFFFFF',
    fontSize: 26,
    lineHeight: 30,
    fontFamily: font.regular,
  },
});
