export const editableColumns = [
  { key: "firstName", label: "ชื่อ", type: "text" },
  { key: "lastName", label: "นามสกุล", type: "text" },
  { key: "age", label: "อายุ", type: "number" },
  { key: "gender", label: "เพศ", type: "text" },
  { key: "weightKg", label: "น้ำหนัก (กก.)", type: "number" },
  { key: "heightCm", label: "ส่วนสูง (ซม.)", type: "number" },
  { key: "occupation", label: "อาชีพ", type: "text" }
] as const;

export type EditableColumnKey = (typeof editableColumns)[number]["key"];
export type ColumnDefinition = {
  key: string;
  label: string;
  type: string;
  position?: number;
};

export const editableColumnKeys = editableColumns.map((column) => column.key);

export function isEditableColumnKey(value: string): value is EditableColumnKey {
  return editableColumnKeys.includes(value as EditableColumnKey);
}

export function getColumnLabel(key: string) {
  return editableColumns.find((column) => column.key === key)?.label ?? key;
}

export function normalizeColumnKey(label: string) {
  const trimmed = label.trim();
  const known = editableColumns.find((column) => column.label === trimmed || column.key === trimmed);
  if (known) return known.key;

  const ascii = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (ascii) return `csv_${ascii}`;

  const encoded = Array.from(trimmed)
    .map((char) => char.codePointAt(0)?.toString(16) ?? "")
    .join("")
    .slice(0, 32);
  return `csv_${encoded}`;
}

export function normalizeHeaderLabel(label: string | null | undefined) {
  return String(label ?? "").trim().replace(/^\uFEFF/, "");
}

export function normalizeSemanticLabel(label: string | null | undefined) {
  return normalizeHeaderLabel(label).toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9ก-๙]/g, "");
}

export function isIdHeader(label: string) {
  const normalized = normalizeHeaderLabel(label).toLowerCase();
  return normalized === "id" || normalized === "รหัส" || normalized === "รหัสข้อมูล";
}

export const defaultColumnDefinitions: ColumnDefinition[] = editableColumns.map((column, index) => ({
  key: column.key,
  label: column.label,
  type: column.type,
  position: index
}));

export function isBmiColumn(label: string, key: string) {
  const values = [label, key].map(normalizeSemanticLabel);
  return values.some((value) => value === "bmi" || value.includes("ดัชนีมวลกาย"));
}

export function isHeightColumn(label: string, key: string) {
  const values = [label, key].map(normalizeSemanticLabel);
  return values.some((value) => value.includes("height") || value.includes("ส่วนสูง"));
}

export function isWeightColumn(label: string, key: string) {
  const values = [label, key].map(normalizeSemanticLabel);
  return values.some(
    (value) =>
      value.includes("weight") ||
      value.includes("น้ำหนัก") ||
      value.includes("นำหนัก") ||
      /น[้ำำ]?หนัก/.test(value)
  );
}
