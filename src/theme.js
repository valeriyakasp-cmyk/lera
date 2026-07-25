import { Platform, StyleSheet } from "react-native";

export const colors = {
  ink: "#111827",
  muted: "#626A78",
  soft: "#9299A5",
  blue: "#007AFF",
  blueBright: "#007AFF",
  paleBlue: "#D9F2FC",
  green: "#149361",
  amber: "#C77E0A",
  red: "#D84949",
  purple: "#7D6BFB",
  background: "#F3F6FB",
  card: "rgba(255,255,255,0.62)",
  cardStrong: "#FFFFFF",
  border: "rgba(255,255,255,0.82)",
  line: "rgba(17,24,39,0.06)",
  white: "#FFFFFF",
};

export const shadows = Platform.select({
  ios: {
    shadowColor: "#24354A",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.09,
    shadowRadius: 36,
  },
  android: {
    elevation: 3,
  },
  default: {},
});

export const ui = StyleSheet.create({
  rtl: {
    writingDirection: "rtl",
    textAlign: "right",
  },
  card: {
    backgroundColor: colors.card,
    borderColor: "rgba(255,255,255,0.82)",
    borderWidth: 1,
    borderRadius: 28,
    ...shadows,
  },
  rowRtl: {
    flexDirection: "row-reverse",
    alignItems: "center",
  },
});

export const formatCurrency = (value = 0) =>
  `₪${Math.round(Math.abs(Number(value) || 0)).toLocaleString("he-IL")}`;

export const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(
    String(value).includes("T") ? value : `${value}T12:00:00`,
  );
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("he-IL", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
};

export const todayIso = () => new Date().toISOString().slice(0, 10);

export const makeId = (prefix = "id") =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
