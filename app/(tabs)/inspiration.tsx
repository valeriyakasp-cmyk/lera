import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Dots, Empty, Giant, Label, Screen, SectionSpacer, Title } from '../../src/components/ui';
import { useStore } from '../../src/store';
import { colors, font, radius, space } from '../../src/theme';

type Filter = 'הכול' | 'טרם נעשה';

export default function Inspiration() {
  const { state, toggleVideoDone, setVideoPotential } = useStore();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('הכול');

  /** ברירת מחדל: הפוטנציאל הגבוה שלא נעשה — למעלה. */
  const videos = useMemo(() => {
    const rows = filter === 'טרם נעשה' ? state.videos.filter((v) => !v.done) : state.videos;
    return [...rows].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return b.potential - a.potential;
    });
  }, [state.videos, filter]);

  const pending = state.videos.filter((v) => !v.done).length;

  return (
    <Screen>
      <Label>ממתינים</Label>
      <Giant>{pending}</Giant>

      <View style={styles.filters}>
        {(['הכול', 'טרם נעשה'] as Filter[]).map((option) => (
          <Pressable key={option} onPress={() => setFilter(option)} hitSlop={6}>
            <Text style={[styles.filter, filter === option && styles.filterActive]}>
              {option}
            </Text>
          </Pressable>
        ))}
      </View>

      <SectionSpacer />

      {videos.length === 0 ? (
        <Empty
          line="אין עדיין סרטונים"
          action={{ title: 'שמירת סרטון', onPress: () => router.push('/video-new') }}
        />
      ) : (
        <View style={styles.grid}>
          {videos.map((video) => (
            <Card key={video.id} style={[styles.tile, video.done && styles.tileDone]}>
              <Pressable
                onPress={() => video.url && Linking.openURL(video.url).catch(() => {})}
                style={styles.thumb}>
                <Text style={styles.thumbGlyph}>▷</Text>
              </Pressable>

              <Title style={styles.tileTitle} numberOfLines={2}>
                {video.title}
              </Title>
              {video.note ? (
                <Label style={styles.tileNote} numberOfLines={2}>
                  {video.note}
                </Label>
              ) : null}

              <View style={styles.tileFooter}>
                <Dots
                  value={video.potential}
                  onChange={(next) => setVideoPotential(video.id, next)}
                />
                <Pressable onPress={() => toggleVideoDone(video.id)} hitSlop={8}>
                  <Text style={[styles.status, video.done && styles.statusDone]}>
                    {video.done ? '● עשיתי' : '○ לא עשיתי'}
                  </Text>
                </Pressable>
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row-reverse', gap: space.md, marginTop: space.sm },
  filter: { fontFamily: font.regular, fontSize: 13, color: colors.muted },
  filterActive: { fontFamily: font.medium, color: colors.accent },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: space.sm },
  tile: { width: '48%', gap: space.xs, padding: space.sm },
  tileDone: { opacity: 0.45 },
  thumb: {
    height: 96,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  thumbGlyph: { fontSize: 22, color: colors.accent },
  tileTitle: { fontSize: 14, lineHeight: 20 },
  tileNote: { fontSize: 12 },
  tileFooter: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xs,
  },
  status: { fontFamily: font.regular, fontSize: 11, color: colors.muted },
  statusDone: { color: colors.accent },
});
