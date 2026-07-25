import React from "react";
import {
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
} from "react-native";

let customFontsAvailable = false;

export const setCustomFontsAvailable = (available) => {
  customFontsAvailable = Boolean(available);
};

const fontFamilyFor = (style) => {
  if (!customFontsAvailable) return undefined;
  const weight = Number(StyleSheet.flatten(style)?.fontWeight || 400);
  if (weight >= 800) return "Assistant_800ExtraBold";
  if (weight >= 700) return "Assistant_700Bold";
  if (weight >= 600) return "Assistant_600SemiBold";
  if (weight >= 500) return "Assistant_500Medium";
  return "Assistant_400Regular";
};

export function Text({ style, ...props }) {
  const fontFamily = fontFamilyFor(style);
  return (
    <NativeText
      {...props}
      style={[
        style,
        fontFamily && { fontFamily, fontWeight: "normal" },
      ]}
    />
  );
}

export const TextInput = React.forwardRef(function TextInput(
  { style, ...props },
  ref,
) {
  const fontFamily = fontFamilyFor(style);
  return (
    <NativeTextInput
      ref={ref}
      {...props}
      style={[
        style,
        fontFamily && { fontFamily, fontWeight: "normal" },
      ]}
    />
  );
});
