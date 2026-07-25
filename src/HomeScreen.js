import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, {
  Defs,
  LinearGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { Card, EmptyState, Page, SectionTitle, StatusPill } from "./ui";
import { colors, formatCurrency, formatDate } from "./theme";
import { Text } from "./Typography";

const monthKey = (value) => String(value || "").slice(0, 7);

export function HomeScreen({ data, onOpenClient, onOpenSavings }) {
  const now = new Date();
  const [viewDate, setViewDate] = useState(
    new Date(now.getFullYear(), now.getMonth(), 1),
  );
  const currentMonth = `${viewDate.getFullYear()}-${String(
    viewDate.getMonth() + 1,
  ).padStart(2, "0")}`;
  const monthLabel = viewDate.toLocaleDateString("he-IL", { month: "long" });
  const moveMonth = (change) =>
    setViewDate(
      (value) =>
        new Date(value.getFullYear(), value.getMonth() + change, 1),
    );

  const values = useMemo(() => {
    const currentProjects = data.projects.filter(
      (item) =>
        monthKey(item.paidAt || item.date || item.sentDate) === currentMonth,
    );
    const received = currentProjects
      .filter((item) => item.status === "paid" || item.depositPaid)
      .reduce(
        (sum, item) =>
          sum +
          (item.status === "paid"
            ? Number(item.amount || 0)
            : Number(item.depositAmount || 0)),
        0,
      );
    const pending = data.projects
      .filter((item) => item.status === "pending")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const costs = currentProjects.reduce(
      (sum, item) => sum + Number(item.costs || 0),
      0,
    );
    const businessExpenses = data.expenses
      .filter(
        (item) => !item.isPersonal && monthKey(item.date) === currentMonth,
      )
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const net = Math.max(0, received - costs - businessExpenses);
    const personalSavings = net * 0.5;
    const businessSavings = net * 0.25;
    const spending = net * 0.25;
    const upcoming = data.projects
      .filter((item) => item.status === "pending")
      .sort((a, b) =>
        String(a.expectedPaymentDate || "").localeCompare(
          String(b.expectedPaymentDate || ""),
        ),
      )
      .slice(0, 4);
    return {
      received,
      pending,
      net,
      costs: costs + businessExpenses,
      personalSavings,
      businessSavings,
      spending,
      upcoming,
    };
  }, [data, currentMonth]);

  const greeting =
    now.getHours() < 12
      ? "בוקר טוב, ולריה"
      : now.getHours() < 18
        ? "צהריים טובים, ולריה"
        : "ערב טוב, ולריה";

  return (
    <Page
      title={greeting}
      titleStyle={styles.homeTitle}
      action={
        <View style={styles.monthSwitch}>
          <Pressable
            accessibilityLabel="החודש הקודם"
            onPress={() => moveMonth(-1)}
            style={styles.monthButton}
          >
            <Ionicons name="chevron-forward" size={14} color={colors.muted} />
          </Pressable>
          <Pressable onPress={() => setViewDate(new Date())}>
            <Text style={styles.monthText}>{monthLabel}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="החודש הבא"
            onPress={() => moveMonth(1)}
            style={styles.monthButton}
          >
            <Ionicons name="chevron-back" size={14} color={colors.muted} />
          </Pressable>
        </View>
      }
      contentStyle={styles.content}
    >
      <Card style={styles.hero}>
        <HeroBackground />
        <Text style={styles.eyebrow}>הכנסה · {monthLabel}</Text>
        <Text style={styles.heroAmount}>
          {formatCurrency(values.received + values.pending)}
        </Text>
        <View style={styles.pillRow}>
          <StatusPill
            label={`התקבל ${formatCurrency(values.received)}`}
            tone="green"
          />
          <StatusPill
            label={`ממתין ${formatCurrency(values.pending)}`}
            tone="amber"
          />
        </View>
      </Card>

      <Card>
        <View style={styles.between}>
          <Text style={styles.label}>נשאר לחלוקה</Text>
          <Text style={styles.net}>{formatCurrency(values.net)}</Text>
        </View>
        {values.costs > 0 && (
          <Text style={styles.deduction}>
            ניכויים {formatCurrency(values.costs)}
          </Text>
        )}
        <View style={styles.bar}>
          <View style={[styles.barPart, { flex: 2, backgroundColor: "#0A84FF" }]} />
          <View style={[styles.barPart, { flex: 1, backgroundColor: "#8BD8F5" }]} />
          <View style={[styles.barPart, { flex: 1, backgroundColor: "#C6EFF9" }]} />
        </View>
        <Allocation
          color="#0A84FF"
          label="חיסכון אישי"
          percent="50%"
          value={values.personalSavings}
        />
        <Allocation
          color="#8BD8F5"
          label="קופת עסק"
          percent="25%"
          value={values.businessSavings}
        />
        <Allocation
          color="#C6EFF9"
          label="בזבוזים"
          percent="25%"
          value={values.spending}
        />
      </Card>

      <View style={styles.twoCards}>
        <Card style={styles.miniCard} onPress={() => onOpenSavings("business")}>
          <View style={styles.miniHeader}>
            <View style={[styles.dot, { backgroundColor: "#55C8F2" }]} />
            <Text style={styles.miniLabel}>קופת עסק</Text>
          </View>
          <Text style={[styles.miniAmount, { color: colors.blue }]}>
            {formatCurrency(values.businessSavings)}
          </Text>
        </Card>
        <Card style={styles.miniCard} onPress={() => onOpenSavings("personal")}>
          <View style={styles.miniHeader}>
            <View style={[styles.dot, { backgroundColor: colors.purple }]} />
            <Text style={styles.miniLabel}>חיסכון אישי</Text>
          </View>
          <Text style={[styles.miniAmount, { color: colors.purple }]}>
            {formatCurrency(values.personalSavings)}
          </Text>
        </Card>
      </View>

      <SectionTitle
        title="תשלומים קרובים"
        action={
          values.pending > 0 ? (
            <Text style={styles.pendingTotal}>
              {formatCurrency(values.pending)}
            </Text>
          ) : null
        }
      />
      {values.upcoming.length ? (
        <Card style={{ paddingVertical: 6 }}>
          {values.upcoming.map((project, index) => {
            const client = data.clients.find(
              (item) => item.id === project.clientId,
            );
            return (
              <View
                key={project.id}
                style={[
                  styles.upcoming,
                  index < values.upcoming.length - 1 && styles.upcomingBorder,
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.upcomingTitle}>{project.title}</Text>
                  <Text style={styles.upcomingMeta}>
                    {client?.name || "לקוח"} ·{" "}
                    {formatDate(project.expectedPaymentDate)}
                  </Text>
                </View>
                <Text style={styles.upcomingAmount}>
                  {formatCurrency(project.amount)}
                </Text>
                <Ionicons
                  name="chevron-back"
                  size={16}
                  color={colors.soft}
                  onPress={() => onOpenClient(project.clientId)}
                />
              </View>
            );
          })}
        </Card>
      ) : (
        <EmptyState icon="time-outline" label="אין תשלומים קרובים" />
      )}
    </Page>
  );
}

function HeroBackground() {
  return (
    <Svg
      pointerEvents="none"
      style={StyleSheet.absoluteFillObject}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <Defs>
        <LinearGradient id="homeHero" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.8" />
          <Stop offset="0.4" stopColor="#FAFCFD" stopOpacity="0.73" />
          <Stop offset="0.72" stopColor="#E0F3F7" stopOpacity="0.66" />
          <Stop offset="1" stopColor="#C7E8EE" stopOpacity="0.58" />
        </LinearGradient>
      </Defs>
      <Rect width="100" height="100" fill="url(#homeHero)" />
    </Svg>
  );
}

function Allocation({ color, label, percent, value }) {
  return (
    <View style={styles.allocation}>
      <View style={styles.allocationName}>
        <View style={[styles.square, { backgroundColor: color }]} />
        <Text style={styles.allocationLabel}>{label}</Text>
      </View>
      <Text style={styles.percent}>{percent}</Text>
      <Text style={styles.allocationAmount}>{formatCurrency(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 10,
  },
  homeTitle: {
    fontSize: 23,
    fontWeight: "600",
  },
  monthSwitch: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 4,
    paddingVertical: 3,
    backgroundColor: "rgba(255,255,255,.60)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.85)",
    shadowColor: "#203146",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
  },
  monthButton: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  monthText: {
    minWidth: 56,
    textAlign: "center",
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  hero: {
    padding: 24,
    backgroundColor: "transparent",
    borderColor: "rgba(255,255,255,.85)",
    borderRadius: 32,
    overflow: "hidden",
  },
  eyebrow: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "500",
    textAlign: "right",
    writingDirection: "rtl",
  },
  heroAmount: {
    color: colors.ink,
    fontSize: 40,
    fontWeight: "600",
    letterSpacing: -1.2,
    textAlign: "right",
    marginTop: 5,
  },
  pillRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 15,
  },
  between: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "500",
    writingDirection: "rtl",
  },
  net: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "600",
  },
  deduction: {
    color: colors.red,
    fontSize: 12,
    textAlign: "right",
    marginTop: 4,
    writingDirection: "rtl",
  },
  bar: {
    height: 10,
    flexDirection: "row-reverse",
    borderRadius: 6,
    gap: 3,
    overflow: "hidden",
    marginVertical: 17,
  },
  barPart: {
    borderRadius: 6,
  },
  allocation: {
    flexDirection: "row-reverse",
    alignItems: "center",
    minHeight: 35,
  },
  allocationName: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 9,
  },
  square: {
    width: 9,
    height: 9,
    borderRadius: 3,
  },
  allocationLabel: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "500",
    writingDirection: "rtl",
  },
  percent: {
    width: 48,
    color: colors.soft,
    fontSize: 12,
    textAlign: "center",
  },
  allocationAmount: {
    minWidth: 72,
    color: colors.ink,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "left",
  },
  twoCards: {
    flexDirection: "row-reverse",
    gap: 10,
  },
  miniCard: {
    flex: 1,
    minHeight: 108,
    padding: 16,
  },
  miniHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 7,
  },
  miniLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "500",
    writingDirection: "rtl",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  miniAmount: {
    fontSize: 22,
    fontWeight: "600",
    textAlign: "right",
    marginTop: 8,
  },
  pendingTotal: {
    color: colors.amber,
    fontSize: 13,
    fontWeight: "600",
  },
  upcoming: {
    minHeight: 68,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
  },
  upcomingBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  upcomingTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "right",
    writingDirection: "rtl",
  },
  upcomingMeta: {
    color: colors.soft,
    fontSize: 11,
    marginTop: 3,
    textAlign: "right",
    writingDirection: "rtl",
  },
  upcomingAmount: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "600",
  },
});
