import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import JSZip from "jszip";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import {
  Card,
  EmptyState,
  Page,
  PrimaryButton,
} from "./ui";
import { colors, formatCurrency, formatDate } from "./theme";
import { Text } from "./Typography";

const safeName = (value = "file") =>
  String(value).replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();

export function AccountantScreen({ data }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [openGroup, setOpenGroup] = useState("receipts");
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");

  const report = useMemo(() => buildReport(data, year), [data, year]);

  const exportZip = async () => {
    if (report.missingCount) {
      setMessage(
        `חסרות ${report.missingCount} קבלות. השלימי אותן לפני הורדת התיקייה`,
      );
      return;
    }
    setExporting(true);
    setMessage("");
    try {
      const zip = new JSZip();
      const receiptFolder = zip.folder("01-קבלות-ללקוחות");
      const expenseFolder = zip.folder("02-הוצאות-מוכרות");

      await addFiles(receiptFolder, report.receipts);
      await addFiles(expenseFolder, report.expenses);

      const summary = [
        `BizFlow | סיכום לרואה חשבון | ${year}`,
        "",
        `סך קבלות ללקוחות: ${formatCurrency(report.receiptTotal)}`,
        `מספר קבלות: ${report.receipts.length}`,
        `סך הוצאות עסקיות: ${formatCurrency(report.expenseTotal)}`,
        `מסמכים חסרים: ${report.missingCount}`,
        "",
        "הסיכום מבוסס על המידע והקבצים השמורים באפליקציה.",
      ].join("\n");
      zip.file(`00-סיכום-${year}.txt`, summary);

      const base64 = await zip.generateAsync({
        type: "base64",
        compression: "DEFLATE",
        compressionOptions: { level: 5 },
      });
      const uri = `${FileSystem.cacheDirectory}BizFlow-${year}.zip`;
      await FileSystem.writeAsStringAsync(uri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await Sharing.shareAsync(uri, {
        mimeType: "application/zip",
        dialogTitle: `BizFlow ${year}`,
        UTI: "com.pkware.zip-archive",
      });
      setMessage("התיקייה מוכנה");
    } catch {
      setMessage("לא הצלחתי להכין את התיקייה");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Page
      title="רואה חשבון"
      titleStyle={styles.pageTitle}
      action={
        <View style={styles.yearRow}>
          <Pressable
            onPress={() => setYear((value) => value - 1)}
            style={styles.yearButton}
          >
            <Ionicons name="chevron-forward" size={14} color={colors.muted} />
          </Pressable>
          <Text style={styles.year}>{year}</Text>
          <Pressable
            disabled={year >= new Date().getFullYear()}
            onPress={() => setYear((value) => value + 1)}
            style={[
              styles.yearButton,
              year >= new Date().getFullYear() && { opacity: 0.3 },
            ]}
          >
            <Ionicons name="chevron-back" size={14} color={colors.muted} />
          </Pressable>
        </View>
      }
    >
      <Card style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>קבלות שהוצאו · {year}</Text>
        <Text style={styles.summaryValue}>
          {formatCurrency(report.receiptTotal)}
        </Text>
        <Text style={styles.receiptCount}>
          {report.receipts.length} קבלות
        </Text>
        <PrimaryButton
          label={
            exporting
              ? "מכינה תיקייה"
              : report.missingCount
                ? "השלימי קבלות"
                : "הורדת ZIP"
          }
          icon={exporting ? undefined : "download-outline"}
          onPress={exportZip}
          disabled={exporting || report.missingCount > 0}
        />
        {exporting && (
          <ActivityIndicator
            size="small"
            color={colors.blue}
            style={{ marginTop: 10 }}
          />
        )}
      </Card>

      <View style={styles.totalsRow}>
        <Card style={styles.totalCard}>
          <Text style={styles.totalLabel}>הוצאות עסקיות</Text>
          <Text style={styles.totalValue}>
            {formatCurrency(report.expenseTotal)}
          </Text>
        </Card>
        <Card style={styles.totalCard}>
          <Text style={styles.totalLabel}>קבלות חסרות</Text>
          <Text
            style={[
              styles.totalValue,
              report.missingCount > 0 && { color: colors.amber },
            ]}
          >
            {report.missingCount}
          </Text>
        </Card>
      </View>

      {!!message && (
        <Text
          style={[
            styles.message,
            report.missingCount ? { color: colors.amber } : null,
          ]}
        >
          {message}
        </Text>
      )}

      {report.groups.map((group) => {
        const open = openGroup === group.key;
        return (
          <Card key={group.key} style={styles.groupCard}>
            <Pressable
              onPress={() => setOpenGroup(open ? null : group.key)}
              style={styles.groupHeader}
            >
              <View style={styles.groupIcon}>
                <Ionicons name={group.icon} size={20} color={group.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.groupTitle}>{group.title}</Text>
                <Text style={styles.groupMeta}>
                  {group.rows.length} מסמכים
                </Text>
              </View>
              <Ionicons
                name={open ? "chevron-up" : "chevron-down"}
                size={18}
                color={colors.soft}
              />
            </Pressable>
            {open && (
              <View style={styles.groupRows}>
                {group.rows.length ? (
                  group.rows.map((row, index) => (
                    <View
                      key={`${group.key}-${row.id}-${index}`}
                      style={[
                        styles.documentRow,
                        index < group.rows.length - 1 && styles.border,
                      ]}
                    >
                      <Ionicons
                        name={
                          row.file
                            ? "checkmark-circle"
                            : "alert-circle-outline"
                        }
                        size={19}
                        color={row.file ? colors.green : colors.amber}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.documentTitle}>{row.title}</Text>
                        <Text style={styles.documentMeta}>
                          {formatDate(row.date)} ·{" "}
                          {formatCurrency(row.amount)}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.fileState,
                          { color: row.file ? colors.green : colors.amber },
                        ]}
                      >
                        {row.file ? "נשמר" : "חסרה"}
                      </Text>
                    </View>
                  ))
                ) : (
                  <EmptyState icon={group.icon} label="אין מסמכים" />
                )}
              </View>
            )}
          </Card>
        );
      })}
    </Page>
  );
}

async function addFiles(folder, rows) {
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row.file?.uri) continue;
    const base64 = await FileSystem.readAsStringAsync(row.file.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    folder.file(
      `${String(index + 1).padStart(2, "0")}-${safeName(
        `${row.date}-${row.title}-${row.file.name}`,
      )}`,
      base64,
      { base64: true },
    );
  }
}

function buildReport(data, year) {
  const isYear = (value) => {
    const date = new Date(
      String(value || "").includes("T")
        ? value
        : `${value || "1970-01-01"}T12:00:00`,
    );
    return date.getFullYear() === year;
  };
  const clientName = (id) =>
    data.clients.find((item) => item.id === id)?.name || "לקוח";

  const receipts = [];
  const documents = [];
  const expenses = [];

  data.projects.forEach((project) => {
    if (!isYear(project.date || project.createdAt)) return;
    const fileKey = project.docType === "quote" ? "quote" : "invoice";
    documents.push({
      id: project.id,
      title: `${project.title} · ${clientName(project.clientId)}`,
      date: project.date,
      amount: project.amount,
      file: project.documents?.[fileKey] || null,
    });
    if (project.status === "paid" || project.depositPaid) {
      receipts.push({
        id: project.id,
        title: `${project.title} · ${clientName(project.clientId)}`,
        date: project.paidAt || project.depositPaidAt || project.date,
        amount:
          project.status === "paid"
            ? project.amount
            : project.depositAmount || project.amount * 0.5,
        file: project.documents?.receipt || null,
      });
    }
  });

  data.expenses
    .filter((item) => !item.isPersonal && isYear(item.date))
    .forEach((item) =>
      expenses.push({
        id: item.id,
        title: item.description,
        date: item.date,
        amount: item.amount,
        file: item.receipt || null,
      }),
    );

  data.fixed.forEach((item) =>
    expenses.push({
      id: item.id,
      title: `${item.name} · מנוי חודשי`,
      date: `${year}-12-31`,
      amount: Number(item.amount || 0) * 12,
      file: item.receipt || null,
    }),
  );

  data.savings
    .filter(
      (item) =>
        item.fund === "business" &&
        item.type === "withdrawal" &&
        isYear(item.createdAt),
    )
    .forEach((item) =>
      expenses.push({
        id: item.id,
        title: item.description || "משיכת קופת עסק",
        date: item.createdAt,
        amount: item.amount,
        file: item.receipt || null,
      }),
    );

  const required = [...receipts, ...expenses];
  return {
    receipts,
    documents,
    expenses,
    missingCount: required.filter((item) => !item.file?.uri).length,
    receiptTotal: receipts.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0,
    ),
    expenseTotal: expenses.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0,
    ),
    groups: [
      {
        key: "receipts",
        title: "קבלות ללקוחות",
        rows: receipts,
        icon: "receipt-outline",
        color: colors.green,
      },
      {
        key: "expenses",
        title: "הוצאות מוכרות",
        rows: expenses,
        icon: "briefcase-outline",
        color: colors.blue,
      },
      {
        key: "documents",
        title: "חשבוניות והצעות מחיר",
        rows: documents,
        icon: "documents-outline",
        color: colors.purple,
      },
    ],
  };
}

const styles = StyleSheet.create({
  pageTitle: {
    fontSize: 30,
  },
  yearRow: {
    minWidth: 112,
    minHeight: 35,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,.60)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.86)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  yearButton: {
    width: 27,
    height: 27,
    alignItems: "center",
    justifyContent: "center",
  },
  year: {
    flex: 1,
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  summaryCard: {
    borderRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 20,
    backgroundColor: "rgba(255,255,255,.66)",
    borderColor: "rgba(255,255,255,.88)",
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 13.5,
    fontWeight: "600",
    textAlign: "right",
    writingDirection: "rtl",
  },
  summaryValue: {
    color: colors.ink,
    fontSize: 38,
    lineHeight: 43,
    fontWeight: "700",
    letterSpacing: -1.3,
    marginTop: 4,
    textAlign: "right",
  },
  receiptCount: {
    color: colors.soft,
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 16,
    textAlign: "right",
    writingDirection: "rtl",
  },
  totalsRow: {
    flexDirection: "row-reverse",
    gap: 10,
    marginBottom: 8,
  },
  totalCard: {
    flex: 1,
    minHeight: 78,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,.62)",
  },
  totalLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
    textAlign: "right",
    writingDirection: "rtl",
  },
  totalValue: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: "700",
    marginTop: 4,
    textAlign: "right",
  },
  groupCard: {
    padding: 0,
    overflow: "hidden",
  },
  groupHeader: {
    minHeight: 78,
    padding: 14,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 11,
  },
  groupIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,.78)",
    alignItems: "center",
    justifyContent: "center",
  },
  groupTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "right",
    writingDirection: "rtl",
  },
  groupMeta: {
    color: colors.soft,
    fontSize: 11,
    marginTop: 3,
    textAlign: "right",
    writingDirection: "rtl",
  },
  groupRows: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    padding: 10,
  },
  documentRow: {
    minHeight: 64,
    paddingHorizontal: 8,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 9,
  },
  border: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  documentTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
    writingDirection: "rtl",
  },
  documentMeta: {
    color: colors.soft,
    fontSize: 10,
    marginTop: 3,
    textAlign: "right",
    writingDirection: "rtl",
  },
  fileState: {
    fontSize: 11,
    fontWeight: "700",
    writingDirection: "rtl",
  },
  message: {
    color: colors.green,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    writingDirection: "rtl",
    marginVertical: 10,
  },
});
