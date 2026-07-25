import React, { useMemo, useState } from "react";
import {
  Linking,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Card,
  ChoiceRow,
  EmptyState,
  Field,
  IconButton,
  Page,
  PrimaryButton,
  Segment,
  Sheet,
  StatusPill,
} from "./ui";
import { colors, formatDate, makeId } from "./theme";
import { Text } from "./Typography";

const sourceName = (url) => {
  const value = String(url || "").toLowerCase();
  if (value.includes("instagram")) return "Instagram";
  if (value.includes("tiktok")) return "TikTok";
  if (value.includes("youtube") || value.includes("youtu.be")) return "YouTube";
  return "קישור";
};

export function InspirationScreen({ data, setData }) {
  const [filter, setFilter] = useState("todo");
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [rating, setRating] = useState(3);
  const [done, setDone] = useState(false);

  const ideas = useMemo(() => {
    return data.inspirations
      .filter((item) =>
        filter === "all" ? true : filter === "done" ? item.done : !item.done,
      )
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }, [data.inspirations, filter]);

  const save = () => {
    if (!url.trim() || !description.trim()) return;
    const normalized = /^https?:\/\//i.test(url.trim())
      ? url.trim()
      : `https://${url.trim()}`;
    setData((current) => ({
      ...current,
      inspirations: [
        {
          id: makeId("idea"),
          url: normalized,
          description: description.trim(),
          rating,
          done,
          createdAt: new Date().toISOString(),
          doneAt: done ? new Date().toISOString() : null,
        },
        ...current.inspirations,
      ],
    }));
    setUrl("");
    setDescription("");
    setRating(3);
    setDone(false);
    setOpen(false);
  };

  const toggleDone = (id) =>
    setData((current) => ({
      ...current,
      inspirations: current.inspirations.map((item) =>
        item.id === id
          ? {
              ...item,
              done: !item.done,
              doneAt: !item.done ? new Date().toISOString() : null,
            }
          : item,
      ),
    }));

  return (
    <Page
      title="השראה"
      titleStyle={styles.pageTitle}
      subtitle={`${data.inspirations.filter((item) => !item.done).length} רעיונות לביצוע`}
      action={
        <IconButton
          icon="add"
          onPress={() => setOpen(true)}
          label="הוספת רעיון"
        />
      }
    >
      <Segment
        options={[
          { value: "todo", label: "לביצוע" },
          { value: "done", label: "בוצעו" },
          { value: "all", label: "הכול" },
        ]}
        value={filter}
        onChange={setFilter}
        style={{ marginBottom: 16 }}
      />

      {ideas.length ? (
        ideas.map((idea) => (
          <Card key={idea.id} style={styles.ideaCard}>
            <View style={styles.ideaTop}>
              <View style={{ flex: 1 }}>
                <View style={styles.sourceRow}>
                  <Ionicons
                    name="link-outline"
                    size={16}
                    color={colors.blue}
                  />
                  <Text style={styles.source}>{sourceName(idea.url)}</Text>
                </View>
                <Text style={styles.description}>{idea.description}</Text>
              </View>
              <Pressable
                onPress={() => toggleDone(idea.id)}
                style={[
                  styles.doneButton,
                  idea.done && styles.doneButtonActive,
                ]}
              >
                <Ionicons
                  name={idea.done ? "checkmark" : "ellipse-outline"}
                  size={18}
                  color={idea.done ? colors.white : colors.soft}
                />
              </Pressable>
            </View>
            <View style={styles.ideaFooter}>
              <View style={styles.stars}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Ionicons
                    key={star}
                    name={star <= idea.rating ? "star" : "star-outline"}
                    size={16}
                    color={star <= idea.rating ? "#F0B12D" : "#BBC2CC"}
                  />
                ))}
              </View>
              <View style={styles.footerActions}>
                <StatusPill
                  label={idea.done ? "בוצע" : "לביצוע"}
                  tone={idea.done ? "green" : "blue"}
                />
                <Pressable
                  onPress={() => Linking.openURL(idea.url)}
                  style={styles.openLink}
                >
                  <Ionicons
                    name="open-outline"
                    size={17}
                    color={colors.blue}
                  />
                </Pressable>
              </View>
            </View>
            <Text style={styles.date}>{formatDate(idea.createdAt)}</Text>
          </Card>
        ))
      ) : (
        <EmptyState icon="bulb-outline" label="אין רעיונות בכרטיסייה הזו" />
      )}

      <Sheet visible={open} onClose={() => setOpen(false)} title="רעיון חדש">
        <Field
          label="קישור"
          value={url}
          onChangeText={setUrl}
          placeholder="Instagram, TikTok או YouTube"
          keyboardType="url"
        />
        <Field
          label="מה קורה בסרטון?"
          value={description}
          onChangeText={setDescription}
          placeholder="תיאור קצר"
          multiline
        />
        <Text style={styles.formLabel}>פוטנציאל הצלחה</Text>
        <View style={styles.ratingPicker}>
          {[1, 2, 3, 4, 5].map((star) => (
            <Pressable key={star} onPress={() => setRating(star)}>
              <Ionicons
                name={star <= rating ? "star" : "star-outline"}
                size={30}
                color={star <= rating ? "#F0B12D" : "#BBC2CC"}
              />
            </Pressable>
          ))}
        </View>
        <Text style={styles.formLabel}>סטטוס</Text>
        <ChoiceRow
          options={[
            { value: false, label: "לביצוע" },
            { value: true, label: "בוצע" },
          ]}
          value={done}
          onChange={setDone}
        />
        <PrimaryButton
          label="שמירה"
          icon="checkmark"
          onPress={save}
          disabled={!url.trim() || !description.trim()}
        />
      </Sheet>
    </Page>
  );
}

const styles = StyleSheet.create({
  pageTitle: {
    fontSize: 30,
  },
  ideaCard: {
    padding: 16,
  },
  ideaTop: {
    flexDirection: "row-reverse",
    gap: 10,
  },
  sourceRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
  },
  source: {
    color: colors.blue,
    fontSize: 12,
    fontWeight: "700",
  },
  description: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 23,
    marginTop: 8,
    textAlign: "right",
    writingDirection: "rtl",
  },
  doneButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "rgba(120,145,166,.18)",
    backgroundColor: "rgba(255,255,255,.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  doneButtonActive: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  ideaFooter: {
    marginTop: 16,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stars: {
    flexDirection: "row",
    gap: 2,
  },
  footerActions: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  openLink: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E9F6FC",
    alignItems: "center",
    justifyContent: "center",
  },
  date: {
    color: colors.soft,
    fontSize: 10,
    textAlign: "right",
    marginTop: 10,
  },
  formLabel: {
    color: colors.soft,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "right",
    writingDirection: "rtl",
    marginRight: 8,
    marginBottom: 8,
  },
  ratingPicker: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: "rgba(136,163,187,.18)",
    marginBottom: 14,
  },
});
