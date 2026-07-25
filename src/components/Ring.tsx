import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors } from '../theme';

/** טבעת קטגוריות מינימלית — עוצמה במקום צבעוניות. */
export function Ring({
  slices,
  size = 64,
  stroke = 8,
}: {
  slices: Array<{ amount: number }>;
  size?: number;
  stroke?: number;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = slices.reduce((sum, s) => sum + s.amount, 0);

  let consumed = 0;

  return (
    // הסיבוב נעשה על המעטפת ולא על ה-SVG, כדי לא לייצר transform-origin ב-DOM.
    <View style={{ width: size, height: size, transform: [{ rotate: '-90deg' }] }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.hairline}
          strokeWidth={stroke}
          fill="none"
        />
        {total > 0 &&
          slices.map((slice, index) => {
            const length = (slice.amount / total) * circumference;
            const offset = consumed;
            consumed += length;

            return (
              <Circle
                key={index}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={colors.accent}
                strokeOpacity={Math.max(1 - index * 0.16, 0.2)}
                strokeWidth={stroke}
                strokeDasharray={`${Math.max(length - 2, 0)} ${circumference}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
                fill="none"
              />
            );
          })}
      </Svg>
    </View>
  );
}
