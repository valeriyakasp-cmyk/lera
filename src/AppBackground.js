import React from "react";
import { StyleSheet } from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  Rect,
  Stop,
} from "react-native-svg";

export function AppBackground() {
  return (
    <Svg
      pointerEvents="none"
      style={StyleSheet.absoluteFillObject}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <Defs>
        <LinearGradient id="base" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FAFBFE" />
          <Stop offset="0.56" stopColor="#F3F6FB" />
          <Stop offset="1" stopColor="#EEF4FA" />
        </LinearGradient>

        <LinearGradient id="blueWash" x1="1" y1="0.25" x2="0" y2="0.72">
          <Stop offset="0" stopColor="#A7DAFA" stopOpacity="0.26" />
          <Stop offset="0.46" stopColor="#C9E8FB" stopOpacity="0.12" />
          <Stop offset="1" stopColor="#C9E8FB" stopOpacity="0" />
        </LinearGradient>
      </Defs>

      <Rect width="100" height="100" fill="url(#base)" />
      <Rect width="100" height="100" fill="url(#blueWash)" />
    </Svg>
  );
}
