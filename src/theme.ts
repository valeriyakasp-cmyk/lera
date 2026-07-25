/**
 * שפה ויזואלית: מונוכרום + מבטא אחד (בורדו עמוק).
 * שלושה גדלי טיפוגרפיה בלבד: מספר-ענק / כותרת / תווית.
 */

export const colors = {
  bg: '#FBFAF8',
  surface: '#FFFFFF',
  text: '#14110F',
  muted: '#8A8580',
  hairline: '#ECE8E3',
  accent: '#6B1E2E',
  accentSoft: '#F3E9EB',
} as const;

export const font = {
  regular: 'Heebo_400Regular',
  medium: 'Heebo_500Medium',
  bold: 'Heebo_700Bold',
} as const;

/** היררכיה של שלושה גדלים בלבד. */
export const type = {
  giant: { fontFamily: font.bold, fontSize: 44, lineHeight: 52, color: colors.text },
  title: { fontFamily: font.medium, fontSize: 18, lineHeight: 26, color: colors.text },
  label: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: colors.muted },
} as const;

export const space = {
  xs: 6,
  sm: 12,
  md: 20,
  lg: 32,
  xl: 48,
} as const;

export const radius = { sm: 10, md: 16, lg: 22 } as const;
