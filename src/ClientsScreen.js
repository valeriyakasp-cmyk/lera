import React, { useMemo, useState } from "react";
import {
  Alert,
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

const clientTypes = [
  { value: "company", label: "חברה" },
  { value: "business", label: "בעל עסק" },
  { value: "student", label: "תלמיד" },
  { value: "consulting", label: "ייעוץ" },
];

const paymentTypes = [
  { value: "net60", label: "שוטף 60" },
  { value: "net30", label: "שוטף 30" },
  { value: "half_half", label: "50 / 50" },
  { value: "upfront", label: "מלא מראש" },
  { value: "custom", label: "מותאם" },
];

const typeLabel = (value) =>
  clientTypes.find((item) => item.value === value)?.label || "לקוח";
const paymentLabel = (value) =>
  paymentTypes.find((item) => item.value === value)?.label || "מותאם";

const endOfPaymentMonth = (sentDate, payment) => {
  const date = new Date(`${sentDate || todayIso()}T12:00:00`);
  if (payment === "net60") date.setDate(date.getDate() + 60);
  if (payment === "net30") date.setDate(date.getDate() + 30);
  if (payment === "net60" || payment === "net30") {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12)
      .toISOString()
      .slice(0, 10);
  }
  return sentDate || todayIso();
};

const statusInfo = (project) => {
  if (project.docType === "quote") {
    if (project.status === "expired") return ["פג תוקף", "neutral"];
    if (project.depositPaid) return ["מקדמה התקבלה", "green"];
    if (project.approved) return ["ממתין להעברת מקדמה", "purple"];
    return ["ממתין לאישור והעברת מקדמה", "purple"];
  }
  if (project.status === "paid") return ["שולם", "green"];
  return ["ממתין לתשלום", "amber"];
};

export function ClientsScreen({
  data,
  setData,
  selectedClientId,
  setSelectedClientId,
}) {
  if (selectedClientId) {
    const client = data.clients.find((item) => item.id === selectedClientId);
    if (client) {
      return (
        <ClientDetail
          client={client}
          data={data}
          setData={setData}
          onBack={() => setSelectedClientId(null)}
        />
      );
    }
  }

  return (
    <ClientsList
      data={data}
      setData={setData}
      onOpen={setSelectedClientId}
    />
  );
}

function ClientsList({ data, setData, onOpen }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [clientType, setClientType] = useState("company");
  const [paymentType, setPaymentType] = useState("net60");

  const reset = () => {
    setName("");
    setClientType("company");
    setPaymentType("net60");
  };

  const save = () => {
    if (!name.trim()) return;
    const client = {
      id: makeId("client"),
      name: name.trim(),
      clientType,
      paymentType,
      createdAt: new Date().toISOString(),
      masterContract: null,
    };
    setData((current) => ({
      ...current,
      clients: [client, ...current.clients],
    }));
    setOpen(false);
    reset();
  };

  return (
    <Page
      title="לקוחות"
      action={
        <IconButton
          icon="add"
          onPress={() => setOpen(true)}
          label="הוספת לקוח"
        />
      }
    >
      {data.clients.length ? (
        data.clients.map((client) => {
          const projects = data.projects.filter(
            (project) => project.clientId === client.id,
          );
          const pending = projects
            .filter((project) => project.status === "pending")
            .reduce((sum, project) => sum + Number(project.amount || 0), 0);
          return (
            <Card
              key={client.id}
              onPress={() => onOpen(client.id)}
              style={styles.clientRow}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {String(client.name).slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.clientName}>{client.name}</Text>
                <Text style={styles.clientMeta}>
                  {typeLabel(client.clientType)} ·{" "}
                  {paymentLabel(client.paymentType)}
                </Text>
              </View>
              <View style={styles.clientAmount}>
                <Text style={styles.clientAmountValue}>
                  {formatCurrency(pending)}
                </Text>
                <Text style={styles.clientAmountLabel}>ממתין</Text>
              </View>
            </Card>
          );
        })
      ) : (
        <EmptyState icon="people-outline" label="אין לקוחות עדיין" />
      )}

      <Sheet visible={open} onClose={() => setOpen(false)} title="לקוח חדש">
        <Field
          label="שם"
          value={name}
          onChangeText={setName}
          placeholder="שם הלקוח"
        />
        <Text style={styles.formLabel}>סוג לקוח</Text>
        <ChoiceRow
          options={clientTypes}
          value={clientType}
          onChange={setClientType}
        />
        <Text style={styles.formLabel}>תשלום</Text>
        <ChoiceRow
          options={paymentTypes}
          value={paymentType}
          onChange={setPaymentType}
        />
        <PrimaryButton
          label="שמירה"
          icon="checkmark"
          onPress={save}
          disabled={!name.trim()}
        />
      </Sheet>
    </Page>
  );
}

function ClientDetail({ client, data, setData, onBack }) {
  const [period, setPeriod] = useState("year");
  const [section, setSection] = useState("projects");
  const [projectOpen, setProjectOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [costProject, setCostProject] = useState(null);
  const [costValue, setCostValue] = useState("");
  const [costDescription, setCostDescription] = useState("");

  const [projectTitle, setProjectTitle] = useState("");
  const [projectAmount, setProjectAmount] = useState("");
  const [docType, setDocType] = useState("invoice");
  const [date, setDate] = useState(todayIso());
  const [validUntil, setValidUntil] = useState("");
  const [agreement, setAgreement] = useState(null);

  const projects = useMemo(
    () => data.projects.filter((item) => item.clientId === client.id),
    [data.projects, client.id],
  );
  const filteredProjects = useMemo(() => {
    if (section === "projects") return projects;
    if (section === "invoices")
      return projects.filter((item) => item.docType !== "quote");
    return projects.filter((item) => item.docType === "quote");
  }, [projects, section]);

  const totals = useMemo(() => {
    const now = new Date();
    const inPeriod = projects.filter((item) => {
      const value = new Date(`${item.date || todayIso()}T12:00:00`);
      return period === "year"
        ? value.getFullYear() === now.getFullYear()
        : value.getFullYear() === now.getFullYear() &&
            value.getMonth() === now.getMonth();
    });
    const received = inPeriod
      .filter((item) => item.status === "paid" || item.depositPaid)
      .reduce(
        (sum, item) =>
          sum +
          (item.status === "paid"
            ? Number(item.amount || 0)
            : Number(item.depositAmount || 0)),
        0,
      );
    const pending = inPeriod
      .filter(
        (item) =>
          item.status === "pending" ||
          (item.docType === "quote" && item.approved && !item.depositPaid),
      )
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const costs = inPeriod.reduce(
      (sum, item) => sum + Number(item.costs || 0),
      0,
    );
    return { received, pending, profit: Math.max(0, received - costs) };
  }, [projects, period]);

  const updateClient = (patch) =>
    setData((current) => ({
      ...current,
      clients: current.clients.map((item) =>
        item.id === client.id ? { ...item, ...patch } : item,
      ),
    }));

  const updateProject = (id, patch) =>
    setData((current) => ({
      ...current,
      projects: current.projects.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }));

  const uploadContract = async () => {
    const file = await pickAndStoreDocument("contract");
    if (file) updateClient({ masterContract: file });
  };

  const uploadProjectDocument = async (project, key) => {
    const file = await pickAndStoreDocument(key);
    if (!file) return;
    const documents = { ...(project.documents || {}), [key]: file };
    const patch = { documents };
    if (key === "receipt") {
      patch.status = "paid";
      patch.paidAt = new Date().toISOString();
    }
    updateProject(project.id, patch);
  };

  const addProject = () => {
    const amount = Number(projectAmount);
    if (!projectTitle.trim() || !amount) return;
    const depositRate =
      client.paymentType === "upfront"
        ? 100
        : client.paymentType === "half_half"
          ? 50
          : 0;
    const project = {
      id: makeId("project"),
      clientId: client.id,
      title: projectTitle.trim(),
      amount,
      date,
      sentDate: date,
      expectedPaymentDate: endOfPaymentMonth(date, client.paymentType),
      paymentType: client.paymentType,
      status: docType === "quote" ? "quote_pending" : "pending",
      docType,
      validUntil:
        docType === "quote"
          ? validUntil ||
            new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
          : null,
      approved: false,
      depositPaid: false,
      depositRate,
      depositAmount: amount * (depositRate / 100),
      agreementSigned: false,
      projectComplete: false,
      costs: 0,
      documents: agreement ? { agreement } : {},
      createdAt: new Date().toISOString(),
    };
    setData((current) => ({
      ...current,
      projects: [project, ...current.projects],
    }));
    setProjectOpen(false);
    setProjectTitle("");
    setProjectAmount("");
    setDate(todayIso());
    setValidUntil("");
    setAgreement(null);
  };

  const addCost = () => {
    const amount = Number(costValue);
    if (!costProject || !amount) return;
    const existing = projects.find((item) => item.id === costProject);
    updateProject(costProject, {
      costs: Number(existing?.costs || 0) + amount,
      costItems: [
        ...(existing?.costItems || []),
        {
          id: makeId("cost"),
          amount,
          description: costDescription.trim() || "עלות",
          date: todayIso(),
        },
      ],
    });
    setCostProject(null);
    setCostValue("");
    setCostDescription("");
  };

  return (
    <Page
      contentStyle={styles.detailContent}
    >
      <View style={styles.detailTopActions}>
        <IconButton
          icon="arrow-forward"
          onPress={onBack}
          label="חזרה"
          style={styles.detailIconButton}
        />
        <IconButton
          icon="options-outline"
          color={colors.ink}
          onPress={() => setSettingsOpen(true)}
          label="הגדרות לקוח"
          style={styles.detailIconButton}
        />
      </View>
      <View style={styles.detailHeading}>
        <Text style={styles.detailTitle}>{client.name}</Text>
        <Text style={styles.detailSubtitle}>
          {typeLabel(client.clientType)} · {paymentLabel(client.paymentType)}
        </Text>
      </View>

      <Card style={styles.profitCard}>
        <Segment
          style={styles.periodSegment}
          options={[
            { value: "year", label: "שנה" },
            { value: "month", label: "חודש" },
          ]}
          value={period}
          onChange={setPeriod}
        />
        <Text style={styles.profitLabel}>רווח נקי</Text>
        <Text style={styles.profitValue}>{formatCurrency(totals.profit)}</Text>
      </Card>

      <View style={styles.summaryRow}>
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>ממתין</Text>
          <Text style={styles.summaryAmount}>
            {formatCurrency(totals.pending)}
          </Text>
        </Card>
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>התקבל</Text>
          <Text style={styles.summaryAmount}>
            {formatCurrency(totals.received)}
          </Text>
        </Card>
      </View>

      {(client.clientType === "company" || client.masterContract) && (
        <Card style={styles.contractCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.contractTitle}>חוזה קבוע</Text>
            <Text numberOfLines={1} style={styles.contractName}>
              {client.masterContract?.name || "טרם הועלה חוזה"}
            </Text>
          </View>
          <IconButton
            icon="cloud-upload-outline"
            onPress={uploadContract}
            label="העלאת חוזה"
            style={styles.smallIcon}
          />
        </Card>
      )}

      <View style={styles.sectionControls}>
        <Segment
          style={styles.sectionSegment}
          options={[
            { value: "projects", label: "פרויקטים" },
            { value: "invoices", label: "חשבוניות" },
            { value: "quotes", label: "הצעות מחיר" },
          ]}
          value={section}
          onChange={setSection}
        />
        <IconButton
          icon="add"
          onPress={() => setProjectOpen(true)}
          label="הוספת פרויקט"
          style={styles.sectionAdd}
        />
      </View>

      {filteredProjects.length ? (
        filteredProjects.map((project) => {
          const [status, tone] = statusInfo(project);
          const expanded = expandedId === project.id;
          return (
            <Card key={project.id} style={styles.projectCard}>
              <Pressable
                onPress={() => setExpandedId(expanded ? null : project.id)}
                style={styles.projectTop}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.projectTitle}>{project.title}</Text>
                  <Text style={styles.projectMeta}>
                    {project.docType === "quote" ? "הצעת מחיר" : "פרויקט"} ·{" "}
                    {formatDate(project.expectedPaymentDate || project.date)}
                  </Text>
                </View>
                <View style={styles.projectSide}>
                  <Text style={styles.projectAmount}>
                    {formatCurrency(project.amount)}
                  </Text>
                  <Ionicons
                    name={expanded ? "chevron-up" : "chevron-down"}
                    color={colors.soft}
                    size={18}
                  />
                </View>
              </Pressable>
              <View style={styles.projectPills}>
                <StatusPill label={status} tone={tone} />
                {Number(project.costs || 0) > 0 && (
                  <StatusPill
                    label={`עלויות ${formatCurrency(project.costs)}`}
                    tone="neutral"
                  />
                )}
              </View>
              {expanded && (
                <View style={styles.projectDetails}>
                  <View style={styles.actionRow}>
                    {project.docType === "quote" && !project.approved && (
                      <PrimaryButton
                        label="אישור"
                        icon="checkmark"
                        onPress={() =>
                          updateProject(project.id, { approved: true })
                        }
                      />
                    )}
                    {project.docType === "quote" &&
                      project.approved &&
                      !project.depositPaid && (
                        <PrimaryButton
                          label="מקדמה התקבלה"
                          icon="card-outline"
                          variant="purple"
                          onPress={() =>
                            updateProject(project.id, {
                              depositPaid: true,
                              depositPaidAt: new Date().toISOString(),
                            })
                          }
                        />
                      )}
                    {project.docType !== "quote" &&
                      project.status !== "paid" && (
                        <PrimaryButton
                          label="סימון כשולם"
                          icon="checkmark-circle-outline"
                          onPress={() =>
                            updateProject(project.id, {
                              status: "paid",
                              paidAt: new Date().toISOString(),
                            })
                          }
                        />
                      )}
                  </View>
                  <Text style={styles.detailLabel}>מסמכים</Text>
                  <View style={styles.docsGrid}>
                    <DocumentTile
                      label={
                        project.docType === "quote"
                          ? "הצעת מחיר"
                          : "חשבונית"
                      }
                      file={
                        project.documents?.[
                          project.docType === "quote" ? "quote" : "invoice"
                        ]
                      }
                      onPress={() =>
                        uploadProjectDocument(
                          project,
                          project.docType === "quote" ? "quote" : "invoice",
                        )
                      }
                    />
                    <DocumentTile
                      label="קבלה"
                      required={project.status === "paid"}
                      file={project.documents?.receipt}
                      onPress={() =>
                        uploadProjectDocument(project, "receipt")
                      }
                    />
                    <DocumentTile
                      label="NDA"
                      file={project.documents?.nda}
                      onPress={() => uploadProjectDocument(project, "nda")}
                    />
                    {client.name.toLowerCase() !== "samsung" && (
                      <DocumentTile
                        label="הסכם"
                        file={project.documents?.agreement}
                        onPress={() =>
                          uploadProjectDocument(project, "agreement")
                        }
                      />
                    )}
                  </View>
                  <View style={styles.costHeader}>
                    <Text style={styles.detailLabel}>עלויות הפרויקט</Text>
                    <Pressable
                      onPress={() => setCostProject(project.id)}
                      style={styles.textAction}
                    >
                      <Ionicons
                        name="add-circle-outline"
                        size={18}
                        color={colors.blue}
                      />
                      <Text style={styles.textActionLabel}>הוספה</Text>
                    </Pressable>
                  </View>
                  {(project.costItems || []).map((cost) => (
                    <View key={cost.id} style={styles.costRow}>
                      <Text style={styles.costDescription}>
                        {cost.description}
                      </Text>
                      <Text style={styles.costAmount}>
                        -{formatCurrency(cost.amount)}
                      </Text>
                    </View>
                  ))}
                  <View style={styles.profitRow}>
                    <Text style={styles.profitRowLabel}>רווח</Text>
                    <Text style={styles.profitRowAmount}>
                      {formatCurrency(
                        Number(project.amount || 0) -
                          Number(project.costs || 0),
                      )}
                    </Text>
                  </View>
                </View>
              )}
            </Card>
          );
        })
      ) : (
        <EmptyState
          icon="briefcase-outline"
          label={
            section === "quotes"
              ? "אין הצעות מחיר"
              : section === "invoices"
                ? "אין חשבוניות"
                : "אין פרויקטים"
          }
        />
      )}

      <Sheet
        visible={projectOpen}
        onClose={() => setProjectOpen(false)}
        title="פרויקט חדש"
      >
        <Field
          label="שם"
          value={projectTitle}
          onChangeText={setProjectTitle}
          placeholder="שם הפרויקט"
        />
        <Field
          label="סכום"
          value={projectAmount}
          onChangeText={setProjectAmount}
          placeholder="₪"
          keyboardType="numeric"
        />
        <Text style={styles.formLabel}>סוג</Text>
        <ChoiceRow
          options={[
            { value: "invoice", label: "פרויקט" },
            { value: "quote", label: "הצעת מחיר" },
          ]}
          value={docType}
          onChange={setDocType}
        />
        <Field
          label="תאריך שליחה"
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
        />
        {docType === "quote" && (
          <Field
            label="תוקף עד"
            value={validUntil}
            onChangeText={setValidUntil}
            placeholder="YYYY-MM-DD"
          />
        )}
        {client.name.toLowerCase() !== "samsung" && (
          <DocumentTile
            label="הסכם עבודה"
            file={agreement}
            onPress={async () =>
              setAgreement(await pickAndStoreDocument("agreement"))
            }
          />
        )}
        <View style={{ height: 14 }} />
        <PrimaryButton
          label="יצירה"
          icon="add"
          onPress={addProject}
          disabled={!projectTitle.trim() || !Number(projectAmount)}
        />
      </Sheet>

      <ClientSettingsSheet
        client={client}
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        updateClient={updateClient}
        projectCount={projects.length}
      />

      <Sheet
        visible={!!costProject}
        onClose={() => setCostProject(null)}
        title="עלות פרויקט"
      >
        <Field
          label="תיאור"
          value={costDescription}
          onChangeText={setCostDescription}
          placeholder="לדוגמה קריינות"
        />
        <Field
          label="סכום"
          value={costValue}
          onChangeText={setCostValue}
          placeholder="₪"
          keyboardType="numeric"
        />
        <PrimaryButton
          label="הוספה"
          icon="add"
          onPress={addCost}
          disabled={!Number(costValue)}
        />
      </Sheet>
    </Page>
  );
}

function ClientSettingsSheet({
  client,
  visible,
  onClose,
  updateClient,
  projectCount,
}) {
  const [name, setName] = useState(client.name);
  const [clientType, setClientType] = useState(client.clientType);
  const [paymentType, setPaymentType] = useState(client.paymentType);

  React.useEffect(() => {
    if (visible) {
      setName(client.name);
      setClientType(client.clientType);
      setPaymentType(client.paymentType);
    }
  }, [visible, client]);

  return (
    <Sheet visible={visible} onClose={onClose} title="פרופיל לקוח">
      <View style={styles.profileMeta}>
        <StatusPill
          label={`נפתח ${formatDate(client.createdAt)}`}
          icon="calendar-outline"
        />
        <StatusPill
          label={`${projectCount} פרויקטים`}
          icon="briefcase-outline"
        />
      </View>
      <Field label="שם" value={name} onChangeText={setName} />
      <Text style={styles.formLabel}>סוג לקוח</Text>
      <ChoiceRow
        options={clientTypes}
        value={clientType}
        onChange={setClientType}
      />
      <Text style={styles.formLabel}>תשלום</Text>
      <ChoiceRow
        options={paymentTypes}
        value={paymentType}
        onChange={setPaymentType}
      />
      <PrimaryButton
        label="שמירה"
        icon="checkmark"
        onPress={() => {
          if (!name.trim()) return;
          updateClient({ name: name.trim(), clientType, paymentType });
          onClose();
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  clientRow: {
    minHeight: 82,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 24,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 14,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 18,
    backgroundColor: "#D0F3FC",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.blue,
    fontSize: 19,
    fontWeight: "600",
  },
  clientName: {
    color: colors.ink,
    fontSize: 16.5,
    fontWeight: "600",
    textAlign: "right",
    writingDirection: "rtl",
  },
  clientMeta: {
    color: colors.soft,
    fontSize: 13,
    fontWeight: "500",
    marginTop: 3,
    textAlign: "right",
    writingDirection: "rtl",
  },
  clientAmount: {
    alignItems: "flex-start",
  },
  clientAmountValue: {
    color: colors.ink,
    fontSize: 15.5,
    fontWeight: "600",
  },
  clientAmountLabel: {
    color: colors.amber,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  formLabel: {
    color: colors.soft,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    marginRight: 8,
    textAlign: "right",
    writingDirection: "rtl",
  },
  detailContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  detailTopActions: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 36,
  },
  detailIconButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    borderColor: "rgba(255,255,255,.94)",
    backgroundColor: "rgba(255,255,255,.66)",
  },
  detailHeading: {
    marginHorizontal: 2,
    marginBottom: 23,
  },
  detailTitle: {
    color: colors.ink,
    fontSize: 40,
    lineHeight: 43,
    fontWeight: "500",
    letterSpacing: -1.4,
    textAlign: "right",
    writingDirection: "rtl",
  },
  detailSubtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "500",
    marginTop: 12,
    textAlign: "right",
    writingDirection: "rtl",
  },
  profitCard: {
    minHeight: 188,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,.68)",
    borderColor: "rgba(255,255,255,.90)",
  },
  periodSegment: {
    width: 128,
    alignSelf: "flex-start",
    marginBottom: 38,
  },
  profitLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "right",
    writingDirection: "rtl",
  },
  profitValue: {
    color: colors.ink,
    fontSize: 38,
    lineHeight: 40,
    fontWeight: "700",
    letterSpacing: -1.3,
    textAlign: "right",
    marginTop: 14,
  },
  summaryRow: {
    flexDirection: "row-reverse",
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    minHeight: 86,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,.64)",
    borderColor: "rgba(255,255,255,.86)",
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "500",
    textAlign: "right",
    writingDirection: "rtl",
  },
  summaryAmount: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "right",
    marginTop: 10,
  },
  contractCard: {
    minHeight: 76,
    paddingVertical: 13,
    paddingHorizontal: 17,
    borderRadius: 22,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 13,
  },
  contractTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "right",
    writingDirection: "rtl",
  },
  contractName: {
    color: colors.soft,
    fontSize: 11,
    marginTop: 3,
    textAlign: "right",
  },
  sectionControls: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 9,
    marginTop: 8,
    marginBottom: 12,
  },
  sectionSegment: {
    flex: 1,
  },
  sectionAdd: {
    width: 42,
    height: 42,
  },
  smallIcon: {
    width: 40,
    height: 40,
  },
  projectCard: {
    padding: 0,
    overflow: "hidden",
  },
  projectTop: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    padding: 17,
    paddingBottom: 10,
  },
  projectTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "right",
    writingDirection: "rtl",
  },
  projectMeta: {
    color: colors.soft,
    fontSize: 11,
    marginTop: 3,
    textAlign: "right",
    writingDirection: "rtl",
  },
  projectSide: {
    alignItems: "flex-start",
    gap: 8,
  },
  projectAmount: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  projectPills: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 7,
    paddingHorizontal: 17,
    paddingBottom: 14,
  },
  projectDetails: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    padding: 16,
  },
  actionRow: {
    gap: 8,
    marginBottom: 14,
  },
  detailLabel: {
    color: colors.soft,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
    writingDirection: "rtl",
    marginBottom: 8,
  },
  docsGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  costHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  textAction: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    padding: 6,
  },
  textActionLabel: {
    color: colors.blue,
    fontSize: 12,
    fontWeight: "700",
    writingDirection: "rtl",
  },
  costRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  costDescription: {
    color: colors.muted,
    fontSize: 13,
    writingDirection: "rtl",
  },
  costAmount: {
    color: colors.red,
    fontSize: 13,
    fontWeight: "700",
  },
  profitRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
  },
  profitRowLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
    writingDirection: "rtl",
  },
  profitRowAmount: {
    color: colors.green,
    fontSize: 16,
    fontWeight: "800",
  },
  profileMeta: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
});
