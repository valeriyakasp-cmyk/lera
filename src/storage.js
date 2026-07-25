import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";

const DATA_KEY = "bizflow.native.data.v1";
const BACKUP_KEY = "bizflow.native.backup.v1";
const FILES_DIR = `${FileSystem.documentDirectory}BizFlow/`;

export const emptyData = () => ({
  clients: [],
  projects: [],
  expenses: [],
  fixed: [],
  savings: [],
  goals: [],
  inspirations: [],
  budgetCarry: 0,
});

const normalize = (value) => ({
  ...emptyData(),
  ...(value || {}),
  clients: Array.isArray(value?.clients) ? value.clients : [],
  projects: Array.isArray(value?.projects) ? value.projects : [],
  expenses: Array.isArray(value?.expenses) ? value.expenses : [],
  fixed: Array.isArray(value?.fixed) ? value.fixed : [],
  savings: Array.isArray(value?.savings) ? value.savings : [],
  goals: Array.isArray(value?.goals) ? value.goals : [],
  inspirations: Array.isArray(value?.inspirations)
    ? value.inspirations
    : [],
});

export async function loadSavedData() {
  try {
    const [primary, backup] = await AsyncStorage.multiGet([
      DATA_KEY,
      BACKUP_KEY,
    ]);
    const candidates = [primary?.[1], backup?.[1]]
      .filter(Boolean)
      .map((item) => {
        try {
          return JSON.parse(item);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    return normalize(candidates[0]?.data);
  } catch {
    return emptyData();
  }
}

export async function saveData(data) {
  const payload = JSON.stringify({ data: normalize(data), updatedAt: Date.now() });
  await AsyncStorage.multiSet([
    [DATA_KEY, payload],
    [BACKUP_KEY, payload],
  ]);
}

const safeName = (name = "document") =>
  String(name)
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

export async function pickAndStoreDocument(prefix = "document") {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  await FileSystem.makeDirectoryAsync(FILES_DIR, { intermediates: true });
  const fileName = `${Date.now()}-${safeName(asset.name || prefix)}`;
  const destination = `${FILES_DIR}${fileName}`;
  await FileSystem.copyAsync({ from: asset.uri, to: destination });

  return {
    name: asset.name || prefix,
    uri: destination,
    mimeType: asset.mimeType || "application/octet-stream",
    size: asset.size || 0,
    savedAt: new Date().toISOString(),
  };
}

export async function pickManyDocuments() {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: true,
    type: ["image/*", "application/pdf"],
  });
  if (result.canceled || !result.assets?.length) return [];

  await FileSystem.makeDirectoryAsync(FILES_DIR, { intermediates: true });
  return Promise.all(
    result.assets.map(async (asset, index) => {
      const fileName = `${Date.now()}-${index}-${safeName(asset.name)}`;
      const destination = `${FILES_DIR}${fileName}`;
      await FileSystem.copyAsync({ from: asset.uri, to: destination });
      return {
        name: asset.name || `receipt-${index + 1}`,
        uri: destination,
        mimeType: asset.mimeType || "application/octet-stream",
        size: asset.size || 0,
        savedAt: new Date().toISOString(),
      };
    }),
  );
}
