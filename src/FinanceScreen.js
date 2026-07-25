import React, { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Card,
  ChoiceRow,
  DocumentTile,
  EmptyState,
  Field,
  IconButton,
  Page,
  PrimaryButton,
  SectionTitle,
  Segment,
  Sheet,
  StatusPill,
} from "./ui";
import {
  colors,
  formatCurrency,
  formatDate,
  makeId,
  todayIso,
} from "./theme";
import { pickAndStoreDocument } from "./storage";
import { Text } from "./Typography";

const monthKey = (value) => String(value || "").slice(0, 7);

export function FinanceScreen({
  data,
  setData,
  initialTab,
  initialFund,
  onTabConsumed,
}) {
  const [tab, setTab] = useState(initialTab || "expenses");
  const [expenseKind, setExpenseKind] = useState("business");
  const [fund, setFund] = useState(initialFund || "business");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [fixedOpen, setFixedOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(null);
  const [goalOpen, setGoalOpen] = useState(false);

  React.useEffect(() => {
    if (initialTab) setTab(initialTab);
    if (initialFund) setFund(initialFund);
    if (initialTab || initialFund) onTabConsumed?.();
  }, [initialTab, initialFund, onTabConsumed]);

  return (
    <Page title="פיננסים">
      <Segment
        options={[
          { value: "expenses", label: "הוצאות" },
          { value: "savings", label: "חסכונות" },
        ]}
        value={tab}
        onChange={setTab}
        style={{ marginBottom: 16 }}
      />

      {tab === "expenses" ? (
        <ExpensesView
          data={data}
          setData={setData}
          kind={expenseKind}
          setKind={setExpenseKind}
          openExpense={() => setExpenseOpen(true)}
          openFixed={() => setFixedOpen(true)}
        />
      ) : (
        <SavingsView
          data={data}
          setData={setData}
          fund={fund}
          setFund={setFund}
          openCash={setCashOpen}
          openGoal={() => setGoalOpen(true)}
        />
      )}

      <ExpenseSheet
        visible={expenseOpen}
        onClose={() => setExpenseOpen(false)}
        isPersonal={expenseKind === "personal"}
        setData={setData}
      />
      <FixedSheet
        visible={fixedOpen}
        onClose={() => setFixedOpen(false)}
        setData={setData}
      />
      <CashSheet
        visible={!!cashOpen}
        type={cashOpen}
        fund={fund}
        onClose={() => setCashOpen(null)}
        setData={setData}
      />
      <GoalSheet
        visible={goalOpen}
        fund={fund}
        onClose={() => setGoalOpen(false)}
        setData={setData}
      />
    </Page>
  );
}

function ExpensesView({
  data,
  kind,
  setKind,
  openExpense,
  openFixed,
}) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const expenses = data.expenses
    .filter((item) => item.isPersonal === (kind === "personal"))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const monthTotal = expenses
    .filter((item) => monthKey(item.date) === currentMonth)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const paidProjects = data.projects
    .filter(
      (item) =>
        item.status === "paid" && monthKey(item.paidAt || item.date) === currentMonth,
    )
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const spendingAvailable = Math.max(
    0,
    Number(data.budgetCarry || 0) + paidProjects * 0.25 - monthTotal,
  );

  return (
    <>
      <Segment
        options={[
          { value: "business", label: "עסקיות" },
          { value: "personal", label: "אישיות" },
        ]}
        value={kind}
        onChange={setKind}
        style={styles.kindSegment}
      />

      {kind === "personal" && (
        <Card style={styles.availableCard}>
          <Text style={styles.availableLabel}>זמין לבזבוזים</Text>
          <Text style={styles.availableValue}>
            {formatCurrency(spendingAvailable)}
          </Text>
        </Card>
      )}

      {kind === "business" && (
        <>
          <View style={styles.fixedHeader}>
            <Text style={styles.fixedTitle}>
              מנויים והוצאות קבועות · כל חודש
            </Text>
            <Pressable onPress={openFixed} hitSlop={8}>
              <Text style={styles.addSubscription}>+ מנוי</Text>
            </Pressable>
          </View>
          {data.fixed.length ? (
            <View style={styles.chips}>
              {data.fixed.map((item) => (
                <StatusPill
                  key={item.id}
                  label={`${item.name} · ${formatCurrency(item.amount)}`}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.noFixed}>אין מנויים קבועים</Text>
          )}
        </>
      )}

      <View style={styles.monthTotal}>
        <Text style={styles.monthTotalLabel}>החודש</Text>
        <View style={styles.monthTotalActions}>
          <Text style={styles.monthTotalValue}>{formatCurrency(monthTotal)}</Text>
          <IconButton
            icon="add"
            onPress={openExpense}
            label="הוספת הוצאה"
            style={styles.smallIcon}
          />
        </View>
      </View>

      {expenses.length ? (
        <Card style={styles.expenseList}>
          {expenses.map((item, index) => (
            <View
              key={item.id}
              style={[
                styles.expenseRow,
                index < expenses.length - 1 && styles.rowBorder,
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.expenseTitle}>{item.description}</Text>
                <Text style={styles.expenseMeta}>
                  {formatDate(item.date)}
                  {item.receipt ? " · קבלה שמורה" : ""}
                </Text>
              </View>
              <Text style={styles.expenseAmount}>
                {formatCurrency(item.amount)}
              </Text>
            </View>
          ))}
        </Card>
      ) : (
        <EmptyState icon="receipt-outline" label="אין הוצאות" />
      )}
    </>
  );
}

function SavingsView({
  data,
  fund,
  setFund,
  openCash,
  openGoal,
}) {
  const transactions = data.savings
    .filter((item) => item.fund === fund)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const balance = transactions.reduce(
    (sum, item) =>
      sum +
      (item.type === "deposit"
        ? Number(item.amount || 0)
        : -Number(item.amount || 0)),
    0,
  );
  const goals = data.goals.filter((item) => item.fund === fund);

  return (
    <>
      <Segment
        options={[
          { value: "business", label: "קופת עסק" },
          { value: "personal", label: "חיסכון אישי" },
        ]}
        value={fund}
        onChange={setFund}
        style={styles.kindSegment}
      />

      <Card
        style={[
          styles.balanceCard,
          fund === "personal" && { backgroundColor: "#F3F0FE" },
        ]}
      >
        <Text style={styles.balanceLabel}>
          {fund === "personal" ? "חיסכון אישי" : "קופת עסק"}
        </Text>
        <Text
          style={[
            styles.balanceValue,
            { color: fund === "personal" ? colors.purple : colors.blue },
          ]}
        >
          {formatCurrency(balance)}
        </Text>
        <View style={styles.cashActions}>
          <Pressable
            onPress={() => openCash("deposit")}
            style={[
              styles.cashButton,
              fund === "personal" && { borderColor: "rgba(125,107,251,.28)" },
            ]}
          >
            <Ionicons
              name="arrow-down"
              size={18}
              color={fund === "personal" ? colors.purple : colors.blue}
            />
            <Text
              style={[
                styles.cashButtonText,
                { color: fund === "personal" ? colors.purple : colors.blue },
              ]}
            >
              הפקדה
            </Text>
          </Pressable>
          <Pressable
            onPress={() => openCash("withdrawal")}
            style={styles.cashButton}
          >
            <Ionicons name="arrow-up" size={18} color={colors.muted} />
            <Text style={styles.cashButtonText}>משיכה</Text>
          </Pressable>
        </View>
      </Card>

      <SectionTitle title="תנועות" />
      {transactions.length ? (
        <Card style={{ paddingVertical: 4 }}>
          {transactions.map((item, index) => (
            <View
              key={item.id}
              style={[
                styles.transaction,
                index < transactions.length - 1 && styles.rowBorder,
              ]}
            >
              <View
                style={[
                  styles.transactionIcon,
                  {
                    backgroundColor:
                      item.type === "deposit"
                        ? fund === "personal"
                          ? "#EEEAFD"
                          : "#E5F6FC"
                        : "#F3F4F7",
                  },
                ]}
              >
                <Ionicons
                  name={
                    item.type === "deposit"
                      ? "arrow-down-outline"
                      : "arrow-up-outline"
                  }
                  size={17}
                  color={
                    item.type === "deposit"
                      ? fund === "personal"
                        ? colors.purple
                        : colors.blue
                      : colors.muted
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.transactionTitle}>
                  {item.description ||
                    (item.type === "deposit" ? "הפקדה" : "משיכה")}
                </Text>
                <Text style={styles.transactionMeta}>
                  {formatDate(item.createdAt)} ·{" "}
                  {new Date(item.createdAt).toLocaleTimeString("he-IL", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
              <Text
                style={[
                  styles.transactionAmount,
                  {
                    color:
                      item.type === "deposit"
                        ? fund === "personal"
                          ? colors.purple
                          : colors.green
                        : colors.ink,
                  },
                ]}
              >
                {item.type === "deposit" ? "+" : "-"}
                {formatCurrency(item.amount)}
              </Text>
            </View>
          ))}
        </Card>
      ) : (
        <EmptyState icon="swap-vertical-outline" label="אין תנועות" />
      )}

      <SectionTitle
        title="יעדי קופה"
        action={
          <IconButton
            icon="add"
            onPress={openGoal}
            label="הוספת יעד"
            style={styles.smallIcon}
          />
        }
      />
      {goals.length ? (
        goals.map((goal) => {
          const progress = Math.min(1, balance / Number(goal.target || 1));
          return (
            <Card key={goal.id}>
              <View style={styles.goalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.goalTitle}>{goal.title}</Text>
                  <Text style={styles.goalMeta}>
                    {formatCurrency(balance)} מתוך{" "}
                    {formatCurrency(goal.target)}
                  </Text>
                </View>
                <StatusPill
                  label={
                    balance >= goal.target ? "אפשר לקנות" : "ממשיכים לחסוך"
                  }
                  tone={balance >= goal.target ? "green" : "blue"}
                />
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${progress * 100}%`,
                      backgroundColor:
                        fund === "personal" ? colors.purple : colors.blue,
                    },
                  ]}
                />
              </View>
            </Card>
          );
        })
      ) : (
        <EmptyState icon="flag-outline" label="אין יעדי חיסכון" />
      )}
    </>
  );
}

function ExpenseSheet({ visible, onClose, isPersonal, setData }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [receipt, setReceipt] = useState(null);

  const save = () => {
    if (!description.trim() || !Number(amount)) return;
    const item = {
      id: makeId("expense"),
      description: description.trim(),
      amount: Number(amount),
      date,
      isPersonal,
      receipt,
      createdAt: new Date().toISOString(),
    };
    setData((current) => ({
      ...current,
      expenses: [item, ...current.expenses],
    }));
    setDescription("");
    setAmount("");
    setDate(todayIso());
    setReceipt(null);
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={isPersonal ? "הוצאה אישית" : "הוצאה עסקית"}
    >
      <Field
        label="תיאור"
        value={description}
        onChangeText={setDescription}
        placeholder="מה קנית?"
      />
      <Field
        label="סכום"
        value={amount}
        onChangeText={setAmount}
        placeholder="₪"
        keyboardType="numeric"
      />
      <Field
        label="תאריך"
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
      />
      {!isPersonal && (
        <DocumentTile
          label="קבלה"
          file={receipt}
          onPress={async () =>
            setReceipt(await pickAndStoreDocument("receipt"))
          }
        />
      )}
      <View style={{ height: 14 }} />
      <PrimaryButton
        label="שמירה"
        icon="checkmark"
        onPress={save}
        disabled={!description.trim() || !Number(amount)}
      />
    </Sheet>
  );
}

function FixedSheet({ visible, onClose, setData }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [receipt, setReceipt] = useState(null);
  const save = () => {
    if (!name.trim() || !Number(amount)) return;
    setData((current) => ({
      ...current,
      fixed: [
        {
          id: makeId("fixed"),
          name: name.trim(),
          amount: Number(amount),
          receipt,
          createdAt: new Date().toISOString(),
        },
        ...current.fixed,
      ],
    }));
    setName("");
    setAmount("");
    setReceipt(null);
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="מנוי חדש">
      <Field
        label="שם"
        value={name}
        onChangeText={setName}
        placeholder="לדוגמה Adobe"
      />
      <Field
        label="סכום חודשי"
        value={amount}
        onChangeText={setAmount}
        placeholder="₪"
        keyboardType="numeric"
      />
      <DocumentTile
        label="קבלה"
        file={receipt}
        onPress={async () =>
          setReceipt(await pickAndStoreDocument("subscription"))
        }
      />
      <View style={{ height: 14 }} />
      <PrimaryButton
        label="שמירה"
        icon="checkmark"
        onPress={save}
        disabled={!name.trim() || !Number(amount)}
      />
    </Sheet>
  );
}

function CashSheet({ visible, onClose, type, fund, setData }) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [receipt, setReceipt] = useState(null);
  const save = () => {
    if (!Number(amount)) return;
    setData((current) => ({
      ...current,
      savings: [
        {
          id: makeId("cash"),
          fund,
          type,
          amount: Number(amount),
          description: description.trim(),
          receipt,
          createdAt: new Date().toISOString(),
        },
        ...current.savings,
      ],
    }));
    setAmount("");
    setDescription("");
    setReceipt(null);
    onClose();
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={type === "deposit" ? "הפקדה" : "משיכה"}
    >
      <Field
        label="סכום"
        value={amount}
        onChangeText={setAmount}
        placeholder="₪"
        keyboardType="numeric"
      />
      <Field
        label="תיאור"
        value={description}
        onChangeText={setDescription}
        placeholder="לא חובה"
      />
      {type === "withdrawal" && fund === "business" && (
        <DocumentTile
          label="קבלה"
          file={receipt}
          onPress={async () =>
            setReceipt(await pickAndStoreDocument("withdrawal"))
          }
        />
      )}
      <View style={{ height: 14 }} />
      <PrimaryButton
        label={type === "deposit" ? "הפקדה" : "משיכה"}
        icon={type === "deposit" ? "arrow-down" : "arrow-up"}
        variant={fund === "personal" && type === "deposit" ? "purple" : "blue"}
        onPress={save}
        disabled={!Number(amount)}
      />
    </Sheet>
  );
}

function GoalSheet({ visible, onClose, fund, setData }) {
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const save = () => {
    if (!title.trim() || !Number(target)) return;
    setData((current) => ({
      ...current,
      goals: [
        {
          id: makeId("goal"),
          fund,
          title: title.trim(),
          target: Number(target),
          createdAt: new Date().toISOString(),
        },
        ...current.goals,
      ],
    }));
    setTitle("");
    setTarget("");
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="יעד חדש">
      <Field
        label="מטרה"
        value={title}
        onChangeText={setTitle}
        placeholder="לדוגמה מיקרופון"
      />
      <Field
        label="מחיר"
        value={target}
        onChangeText={setTarget}
        placeholder="₪"
        keyboardType="numeric"
      />
      <PrimaryButton
        label="שמירה"
        icon="flag-outline"
        onPress={save}
        disabled={!title.trim() || !Number(target)}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  kindSegment: {
    width: 230,
    alignSelf: "flex-end",
    marginBottom: 15,
  },
  availableCard: {
    minHeight: 84,
    paddingVertical: 17,
    paddingHorizontal: 20,
    borderRadius: 24,
    alignItems: "flex-end",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,.62)",
  },
  availableLabel: {
    color: colors.muted,
    fontSize: 13.5,
    fontWeight: "500",
    writingDirection: "rtl",
  },
  availableValue: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: "600",
    letterSpacing: -0.8,
    marginTop: 1,
  },
  fixedHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 5,
    marginBottom: 9,
  },
  fixedTitle: {
    color: colors.soft,
    fontSize: 13,
    fontWeight: "600",
    writingDirection: "rtl",
  },
  addSubscription: {
    color: colors.blueBright,
    fontSize: 13,
    fontWeight: "700",
    writingDirection: "rtl",
  },
  chips: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 7,
    marginBottom: 12,
  },
  noFixed: {
    color: colors.soft,
    fontSize: 12,
    textAlign: "right",
    marginBottom: 12,
    marginRight: 5,
    writingDirection: "rtl",
  },
  smallIcon: {
    width: 40,
    height: 40,
  },
  monthTotal: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 6,
    marginTop: 4,
    marginBottom: 12,
  },
  monthTotalActions: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
  },
  monthTotalLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "500",
    writingDirection: "rtl",
  },
  monthTotalValue: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "600",
  },
  expenseList: {
    padding: 0,
    overflow: "hidden",
  },
  expenseRow: {
    minHeight: 68,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
  },
  expenseTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "right",
    writingDirection: "rtl",
  },
  expenseMeta: {
    color: colors.soft,
    fontSize: 12.5,
    textAlign: "right",
    marginTop: 3,
    writingDirection: "rtl",
  },
  expenseAmount: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "600",
  },
  balanceCard: {
    minHeight: 184,
    alignItems: "flex-end",
    backgroundColor: "#EAF8FD",
  },
  balanceLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
    writingDirection: "rtl",
  },
  balanceValue: {
    fontSize: 38,
    fontWeight: "800",
    marginTop: 4,
  },
  cashActions: {
    width: "100%",
    flexDirection: "row-reverse",
    gap: 8,
    marginTop: 18,
  },
  cashButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(110,190,232,.24)",
    backgroundColor: "rgba(255,255,255,.74)",
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  cashButtonText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
    writingDirection: "rtl",
  },
  transaction: {
    minHeight: 68,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  transactionIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  transactionTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "right",
    writingDirection: "rtl",
  },
  transactionMeta: {
    color: colors.soft,
    fontSize: 10,
    marginTop: 3,
    textAlign: "right",
    writingDirection: "rtl",
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: "800",
  },
  goalHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 9,
  },
  goalTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "right",
    writingDirection: "rtl",
  },
  goalMeta: {
    color: colors.soft,
    fontSize: 11,
    marginTop: 3,
    textAlign: "right",
    writingDirection: "rtl",
  },
  progressTrack: {
    height: 9,
    borderRadius: 5,
    backgroundColor: "#E4EAF1",
    marginTop: 15,
    overflow: "hidden",
  },
  progressFill: {
    height: 9,
    borderRadius: 5,
  },
});
