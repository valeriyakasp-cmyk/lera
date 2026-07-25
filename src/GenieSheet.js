import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Field, PrimaryButton, Sheet, StatusPill } from "./ui";
import { colors, makeId, todayIso } from "./theme";
import { pickManyDocuments } from "./storage";
import { Text } from "./Typography";

const businessPattern =
  /computer|laptop|mac|pc|ksp|office|adobe|gemini|canva|suno|claude|software|camera|microphone|מחשב|ציוד|משרד|תוכנה|מצלמה|מיקרופון/i;

export function GenieSheet({ visible, onClose, setData }) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [answer, setAnswer] = useState(
    "אפשר להעלות צילומי מסך או קבלות. אני אסדר אותן לפני השמירה.",
  );

  const upload = async () => {
    setBusy(true);
    try {
      const picked = await pickManyDocuments();
      const prepared = picked.map((file) => ({
        ...file,
        id: makeId("genie"),
        isPersonal: !businessPattern.test(file.name),
        amount: "",
        description: file.name.replace(/\.[^.]+$/, ""),
      }));
      setFiles(prepared);
      setAnswer(
        prepared.length
          ? `מצאתי ${prepared.length} קבצים. אפשר לתקן סיווג וסכום לפני השמירה.`
          : "לא נבחרו קבצים.",
      );
    } catch {
      setAnswer("לא הצלחתי לפתוח את הקבצים. נסי שוב.");
    } finally {
      setBusy(false);
    }
  };

  const updateFile = (id, patch) =>
    setFiles((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );

  const save = () => {
    const ready = files.filter(
      (item) => item.description.trim() && Number(item.amount),
    );
    if (!ready.length) {
      setAnswer("צריך להוסיף לפחות סכום אחד לפני השמירה.");
      return;
    }
    setData((current) => ({
      ...current,
      expenses: [
        ...ready.map((item) => ({
          id: makeId("expense"),
          description: item.description.trim(),
          amount: Number(item.amount),
          date: todayIso(),
          isPersonal: item.isPersonal,
          receipt: {
            name: item.name,
            uri: item.uri,
            mimeType: item.mimeType,
            size: item.size,
            savedAt: item.savedAt,
          },
          createdAt: new Date().toISOString(),
          importedByGenie: true,
        })),
        ...current.expenses,
      ],
    }));
    setFiles([]);
    setAnswer("ההוצאות נשמרו במקום הנכון.");
  };

  const sendText = () => {
    const value = text.trim();
    if (!value) return;
    setText("");
    setAnswer(
      value.includes("הוצאה")
        ? "כדי לשמור הוצאה צרפי קבלה או צילום מסך והוסיפי סכום."
        : "הבנתי. אפשר להמשיך להעלות מסמכים או לעבור למסך הרלוונטי.",
    );
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="ג׳יני">
      <View style={styles.answer}>
        <View style={styles.genieIcon}>
          <Ionicons
            name="sparkles-outline"
            size={19}
            color={colors.blue}
          />
        </View>
        <Text style={styles.answerText}>{answer}</Text>
      </View>

      <Pressable onPress={upload} style={styles.upload}>
        {busy ? (
          <ActivityIndicator size="small" color={colors.blue} />
        ) : (
          <Ionicons
            name="cloud-upload-outline"
            size={21}
            color={colors.blue}
          />
        )}
        <Text style={styles.uploadText}>העלאת קבצים</Text>
      </Pressable>

      {files.map((file) => (
        <View key={file.id} style={styles.fileCard}>
          <View style={styles.fileHeader}>
            <Text numberOfLines={1} style={styles.fileName}>
              {file.name}
            </Text>
            <Pressable
              onPress={() =>
                updateFile(file.id, { isPersonal: !file.isPersonal })
              }
            >
              <StatusPill
                label={file.isPersonal ? "אישית" : "עסקית"}
                tone={file.isPersonal ? "purple" : "blue"}
              />
            </Pressable>
          </View>
          <Field
            value={file.description}
            onChangeText={(value) =>
              updateFile(file.id, { description: value })
            }
            placeholder="תיאור"
          />
          <Field
            value={file.amount}
            onChangeText={(value) => updateFile(file.id, { amount: value })}
            placeholder="₪ סכום"
            keyboardType="numeric"
          />
        </View>
      ))}

      {!!files.length && (
        <PrimaryButton
          label="שמירת הוצאות"
          icon="checkmark"
          onPress={save}
        />
      )}

      <View style={styles.chatRow}>
        <Pressable onPress={sendText} style={styles.send}>
          <Ionicons name="arrow-up" size={18} color={colors.white} />
        </Pressable>
        <Field
          value={text}
          onChangeText={setText}
          placeholder="כתבי לג׳יני"
          style={styles.chatField}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  answer: {
    minHeight: 74,
    borderRadius: 20,
    backgroundColor: "#EAF7FD",
    padding: 13,
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
  },
  genieIcon: {
    width: 36,
    height: 36,
    borderRadius: 15,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  answerText: {
    flex: 1,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "right",
    writingDirection: "rtl",
  },
  upload: {
    minHeight: 54,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "rgba(7,135,212,.22)",
    backgroundColor: "rgba(255,255,255,.76)",
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 12,
  },
  uploadText: {
    color: colors.blue,
    fontSize: 14,
    fontWeight: "700",
    writingDirection: "rtl",
  },
  fileCard: {
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,.72)",
    borderWidth: 1,
    borderColor: "rgba(126,158,184,.14)",
    padding: 12,
    marginBottom: 10,
  },
  fileHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 9,
    marginBottom: 10,
  },
  fileName: {
    flex: 1,
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
  },
  chatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
  },
  chatField: {
    flex: 1,
    marginBottom: 0,
  },
  send: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
  },
});
