import React from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, shadows, ui } from "./theme";
import { Text, TextInput } from "./Typography";

export function Page({
  children,
  title,
  subtitle,
  action,
  titleStyle,
  scroll = true,
  contentStyle,
}) {
  const content = (
    <>
      {(title || action) && (
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            {!!title && <Text style={[styles.title, titleStyle]}>{title}</Text>}
            {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
          {action}
        </View>
      )}
      {children}
    </>
  );

  if (!scroll) {
    return <View style={[styles.page, contentStyle]}>{content}</View>;
  }

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[styles.content, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {content}
    </ScrollView>
  );
}

export function Card({ children, style, onPress }) {
  const Component = onPress ? Pressable : View;
  return (
    <Component onPress={onPress} style={[ui.card, styles.card, style]}>
      {children}
    </Component>
  );
}

export function IconButton({
  icon = "add",
  onPress,
  color = colors.blue,
  size = 21,
  style,
  label,
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

export function Segment({ options, value, onChange, style }) {
  return (
    <View style={[styles.segment, style]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segmentItem, selected && styles.segmentItemActive]}
          >
            <Text
              style={[
                styles.segmentText,
                selected && styles.segmentTextActive,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Sheet({ visible, onClose, title, children, footer }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.modalRoot}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <IconButton
              icon="close"
              onPress={onClose}
              size={19}
              label="סגירה"
              style={styles.closeButton}
            />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sheetContent}
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.sheetFooter}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  style,
}) {
  return (
    <View style={[styles.fieldWrap, style]}>
      {!!label && <Text style={styles.fieldLabel}>{label}</Text>}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#AEB4BE"
        keyboardType={keyboardType}
        multiline={multiline}
        textAlign="right"
        style={[styles.field, multiline && styles.multiline]}
      />
    </View>
  );
}

export function ChoiceRow({ options, value, onChange }) {
  return (
    <View style={styles.choiceWrap}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.choice, selected && styles.choiceSelected]}
          >
            <Ionicons
              name={selected ? "checkmark-circle" : "ellipse-outline"}
              color={selected ? colors.blue : colors.soft}
              size={18}
            />
            <Text style={[styles.choiceText, selected && { color: colors.blue }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function PrimaryButton({
  label,
  icon,
  onPress,
  disabled,
  variant = "blue",
}) {
  const palette =
    variant === "purple"
      ? { bg: colors.purple, fg: colors.white }
      : variant === "ghost"
        ? { bg: "rgba(255,255,255,.72)", fg: colors.blue }
        : { bg: colors.blueBright, fg: colors.white };
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primary,
        { backgroundColor: palette.bg },
        disabled && { opacity: 0.42 },
        pressed && !disabled && styles.pressed,
      ]}
    >
      {!!icon && <Ionicons name={icon} size={18} color={palette.fg} />}
      <Text style={[styles.primaryText, { color: palette.fg }]}>{label}</Text>
    </Pressable>
  );
}

export function StatusPill({ label, tone = "neutral", icon }) {
  const tones = {
    green: { bg: "#E1F4EA", color: colors.green },
    amber: { bg: "#FFF0D7", color: colors.amber },
    blue: { bg: "#E2F3FC", color: colors.blue },
    purple: { bg: "#EEEAFD", color: colors.purple },
    red: { bg: "#FCE8E8", color: colors.red },
    neutral: { bg: "rgba(255,255,255,.74)", color: colors.muted },
  };
  const selected = tones[tone] || tones.neutral;
  return (
    <View style={[styles.pill, { backgroundColor: selected.bg }]}>
      {!!icon && <Ionicons name={icon} size={13} color={selected.color} />}
      <Text style={[styles.pillText, { color: selected.color }]}>{label}</Text>
    </View>
  );
}

export function EmptyState({ icon = "folder-open-outline", label }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={27} color="#B1BAC7" />
      <Text style={styles.emptyText}>{label}</Text>
    </View>
  );
}

export function DocumentTile({ label, file, onPress, required = false }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.documentTile,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons
        name={file ? "checkmark-circle" : "document-attach-outline"}
        size={19}
        color={file ? colors.green : required ? colors.amber : colors.muted}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.documentLabel}>{label}</Text>
        {!!file && (
          <Text numberOfLines={1} style={styles.documentName}>
            {file.name}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export function SectionTitle({ title, action, style }) {
  return (
    <View style={[styles.sectionTitle, style]}>
      <Text style={styles.sectionTitleText}>{title}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 100,
  },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  title: {
    color: colors.ink,
    fontSize: 32,
    fontWeight: "600",
    letterSpacing: -0.5,
    writingDirection: "rtl",
    textAlign: "right",
  },
  subtitle: {
    color: colors.soft,
    fontSize: 13,
    fontWeight: "500",
    marginTop: 2,
    writingDirection: "rtl",
    textAlign: "right",
  },
  card: {
    padding: 20,
    marginBottom: 12,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(110,190,232,.24)",
    backgroundColor: "rgba(255,255,255,.76)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#203146",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
  },
  closeButton: {
    width: 38,
    height: 38,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  segment: {
    minHeight: 44,
    padding: 4,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,.5)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.9)",
    flexDirection: "row-reverse",
  },
  segmentItem: {
    flex: 1,
    minHeight: 36,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  segmentItemActive: {
    backgroundColor: colors.white,
    shadowColor: "#203146",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
  },
  segmentText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
    writingDirection: "rtl",
  },
  segmentTextActive: {
    color: colors.ink,
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(20,31,46,.28)",
  },
  sheet: {
    maxHeight: "80%",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    backgroundColor: "rgba(255,255,255,.90)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.95)",
    paddingTop: 9,
  },
  handle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#D7DBE2",
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  sheetTitle: {
    flex: 1,
    color: colors.ink,
    fontSize: 21,
    fontWeight: "700",
    textAlign: "right",
    writingDirection: "rtl",
  },
  sheetContent: {
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
  sheetFooter: {
    padding: 14,
    paddingBottom: Platform.OS === "ios" ? 28 : 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: "rgba(248,250,253,.96)",
  },
  fieldWrap: {
    marginBottom: 12,
  },
  fieldLabel: {
    color: colors.soft,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    marginRight: 8,
    textAlign: "right",
    writingDirection: "rtl",
  },
  field: {
    minHeight: 50,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(136,163,187,.18)",
    backgroundColor: colors.white,
    paddingHorizontal: 15,
    color: colors.ink,
    fontSize: 16,
    writingDirection: "rtl",
  },
  multiline: {
    minHeight: 96,
    paddingTop: 14,
    textAlignVertical: "top",
  },
  choiceWrap: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  choice: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,.7)",
    paddingHorizontal: 13,
  },
  choiceSelected: {
    borderColor: "rgba(7,135,212,.28)",
    backgroundColor: "#EAF7FD",
  },
  choiceText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    writingDirection: "rtl",
  },
  primary: {
    minHeight: 52,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row-reverse",
    gap: 8,
    paddingHorizontal: 18,
    ...shadows,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: "700",
    writingDirection: "rtl",
  },
  pill: {
    minHeight: 30,
    borderRadius: 16,
    paddingHorizontal: 11,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "700",
    writingDirection: "rtl",
  },
  empty: {
    minHeight: 116,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,.5)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.9)",
  },
  emptyText: {
    color: colors.soft,
    fontSize: 14,
    fontWeight: "500",
    writingDirection: "rtl",
  },
  documentTile: {
    minHeight: 62,
    flex: 1,
    minWidth: "46%",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,.66)",
    paddingHorizontal: 13,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 9,
  },
  documentLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "right",
    writingDirection: "rtl",
  },
  documentName: {
    color: colors.soft,
    fontSize: 10,
    marginTop: 2,
    textAlign: "right",
  },
  sectionTitle: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionTitleText: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "right",
    writingDirection: "rtl",
  },
});
