import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { db } from "@/lib/db";
import { asNumber } from "@/lib/format";

const templatePath = path.join(process.cwd(), "storage", "templates", "default-health-report.docx");

type ReportRecord = {
  id: string;
  cellValues: { value: string | null; column: { label: string; key: string } }[];
};

type ReportData = Record<string, string>;

type ReportTemplateContext = {
  template: Buffer;
  documentXml: string;
};

let cachedTemplateContext: Promise<ReportTemplateContext> | null = null;

function normalizeLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9ก-๙]/g, "");
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function decodeXml(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
}

function visibleText(xml: string) {
  const text = Array.from(xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g))
    .map((match) => decodeXml(match[1]))
    .join("");
  const tabs = xml.match(/<w:tab\/>/g)?.length ?? 0;
  return `${text}${"\t".repeat(tabs)}`;
}

function createValueLookup(record: ReportRecord) {
  const entries = record.cellValues.map((cell) => ({
    value: cell.value?.trim() ?? "",
    label: normalizeLabel(cell.column.label),
    key: normalizeLabel(cell.column.key)
  }));

  return (names: string[]) => {
    const normalizedNames = names.map(normalizeLabel);
    const exact = entries.find((cell) => cell.value && (normalizedNames.includes(cell.label) || normalizedNames.includes(cell.key)));
    if (exact?.value) return exact.value;

    const fuzzy = entries.find((cell) => cell.value && normalizedNames.some((name) => cell.label.includes(name) || name.includes(cell.label)));
    return fuzzy?.value ?? "";
  };
}

function formatBmi(weight: string, height: string) {
  const weightKg = asNumber(weight);
  const heightCm = asNumber(height);
  if (!weightKg || !heightCm || heightCm <= 0) return "";
  return (weightKg / (heightCm / 100) ** 2).toFixed(2);
}

function reportDataFromRecord(record: ReportRecord): ReportData {
  const valueFrom = createValueLookup(record);
  const weight = valueFrom(["น้ำหนัก", "นำหนัก", "weight"]);
  const height = valueFrom(["ส่วนสูง", "height"]);
  const bmi = valueFrom(["ดัชนีมวลกาย", "bmi"]) || formatBmi(weight, height);

  return {
    fullName: valueFrom(["ชื่อนามสกุล", "ชื่อ-นามสกุล", "name"]),
    gender: valueFrom(["เพศ", "gender"]),
    age: valueFrom(["อายุ", "age"]).replace(/\s*ปี\s*$/, ""),
    citizenId: valueFrom(["เลขบัตรประชาชน", "เลขบัตร", "citizenid"]),
    weight,
    height,
    bmi,
    waist: valueFrom(["รอบเอว"]),
    pulse: valueFrom(["ชีพจร"]),
    bloodPressure: valueFrom(["ความดันโลหิต"]),
    chronicDisease: valueFrom(["โรคประจำตัว"]),
    glucoseFinger: valueFrom(["นำตาลปลายนิ้ว", "น้ำตาลปลายนิ้ว", "glucosefinger"]),
    anemia: valueFrom(["ภาวะซีด", "hb", "hemoglobin"]),
    specificGravity: valueFrom(["sp.gr.", "spgr"]),
    ph: valueFrom(["ph"]),
    protein: valueFrom(["protein"]),
    urineGlucose: valueFrom(["glucose"]),
    wbc: valueFrom(["wbc"]),
    rbc: valueFrom(["rbc"]),
    squamousEpi: valueFrom(["squamous epi.", "squamousepi"]),
    transitionalEpi: valueFrom(["transitional epi.", "transitionalepi"]),
    bacteria: valueFrom(["bacteria"]),
    crystal: valueFrom(["crystal"]),
    urineSediment: valueFrom(["ตะกอนปัสสาวะ"]),
    fecesResult: valueFrom(["ผลการตรวจfeces", "ผลการตรวจอุจจาระ"]),
    fecesMethod: valueFrom(["วิธีการตรวจ"]),
    reportDate: new Intl.DateTimeFormat("th-TH", { dateStyle: "long" }).format(new Date())
  };
}

function textRun(value: string, size = 32, bold = false) {
  const safe = escapeXml(value || "-");
  return `<w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK" w:eastAsia="TH SarabunPSK"/>${bold ? "<w:b/><w:bCs/>" : ""}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${safe}</w:t></w:r>`;
}

function multilineRun(value: string, size = 28) {
  const parts = (value || "-").split(/\r?\n/);
  return parts
    .map((part, index) => `${index ? "<w:br/>" : ""}<w:t xml:space="preserve">${escapeXml(part || "-")}</w:t>`)
    .join("");
}

function makeParagraph(original: string, runs: string) {
  const open = original.match(/^<w:p\b[^>]*>/)?.[0] ?? "<w:p>";
  const pPr = original.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? "";
  return `${open}${pPr}${runs}</w:p>`;
}

function setCellText(cellXml: string, value: string, size = 28) {
  const tcPr = cellXml.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/)?.[0] ?? "";
  return `<w:tc>${tcPr}<w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK" w:eastAsia="TH SarabunPSK"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>${multilineRun(value, size)}</w:r></w:p></w:tc>`;
}

function replaceCell(rowXml: string, cellIndex: number, value: string, size = 28) {
  let current = -1;
  return rowXml.replace(/<w:tc\b[\s\S]*?<\/w:tc>/g, (cell) => {
    current += 1;
    return current === cellIndex ? setCellText(cell, value, size) : cell;
  });
}

function replaceTableRows(tableXml: string, replacements: Record<number, Record<number, string>>) {
  let rowIndex = -1;
  return tableXml.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, (row) => {
    rowIndex += 1;
    const rowReplacements = replacements[rowIndex];
    if (!rowReplacements) return row;

    return Object.entries(rowReplacements).reduce((updated, [cellIndex, value]) => replaceCell(updated, Number(cellIndex), value), row);
  });
}

function applyReportData(documentXml: string, data: ReportData) {
  let xml = documentXml;
  const paragraphReplacements = [
    {
      matches: (text: string) => text.includes("ชื่อ") && text.includes("นามสกุล") && text.includes("เพศ"),
      build: (paragraph: string) =>
        makeParagraph(
          paragraph,
          textRun("ชื่อ - นามสกุล: ", 32, true) +
            textRun(data.fullName, 32) +
            textRun("     เพศ: ", 32, true) +
            textRun(data.gender, 32)
        )
    },
    {
      matches: (text: string) => text.includes("อายุ") && text.includes("เลขบัตรประชาชน"),
      build: (paragraph: string) =>
        makeParagraph(
          paragraph,
          textRun("อายุ: ", 32, true) +
            textRun(data.age, 32) +
            textRun(" ปี     เลขบัตรประชาชน: ", 32, true) +
            textRun(data.citizenId, 32)
        )
    },
    {
      matches: (text: string) => text.includes("น้ำหนัก") && text.includes("ส่วนสูง") && text.includes("ดัชนีมวลกาย") && text.includes("รอบเอว"),
      build: (paragraph: string) =>
        makeParagraph(
          paragraph,
          textRun("น้ำหนัก ", 32, true) +
            textRun(data.weight, 32) +
            textRun(" กก.     ส่วนสูง ", 32, true) +
            textRun(data.height, 32) +
            textRun(" ซม.     ดัชนีมวลกาย ", 32, true) +
            textRun(data.bmi, 32) +
            textRun(" กก./ม2     รอบเอว ", 32, true) +
            textRun(data.waist, 32) +
            textRun(" ซม.", 32)
        )
    },
    {
      matches: (text: string) => text.includes("ชีพจร") && text.includes("ความดันโลหิต") && text.includes("โรคประจำตัว"),
      build: (paragraph: string) =>
        makeParagraph(
          paragraph,
          textRun("ชีพจร ", 32, true) +
            textRun(data.pulse, 32) +
            textRun(" ครั้ง/นาที     ความดันโลหิต ", 32, true) +
            textRun(data.bloodPressure, 32) +
            textRun(" มม.ปรอท     โรคประจำตัว ", 32, true) +
            textRun(data.chronicDisease, 32)
        )
    },
    {
      matches: (text: string) => text.includes("รายงานตะกอนปัสสาวะ"),
      build: (paragraph: string) => makeParagraph(paragraph, textRun("รายงานตะกอนปัสสาวะ: ", 28, true) + textRun(data.urineSediment, 28))
    }
  ];

  xml = xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraph) => {
    const text = visibleText(paragraph);
    const replacement = paragraphReplacements.find((item) => item.matches(text));
    return replacement ? replacement.build(paragraph) : paragraph;
  });

  const urineResults = [
    data.specificGravity,
    data.ph,
    data.protein,
    data.urineGlucose,
    data.wbc,
    data.rbc,
    data.squamousEpi,
    data.transitionalEpi,
    data.bacteria,
    data.crystal
  ].map((value) => value || "-").join("\n");

  let tableIndex = -1;
  xml = xml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, (table) => {
    tableIndex += 1;
    if (tableIndex === 0) return replaceTableRows(table, { 1: { 1: data.glucoseFinger }, 2: { 1: data.anemia } });
    if (tableIndex === 1) return replaceTableRows(table, { 1: { 1: urineResults } });
    if (tableIndex === 2) return replaceTableRows(table, { 1: { 0: data.fecesMethod, 1: data.fecesResult } });
    return table;
  });

  return xml;
}

export async function getReportRecord(recordId: string, projectId: string) {
  return db.record.findFirst({
    where: { id: recordId, projectId },
    select: {
      id: true,
      cellValues: {
        select: {
          value: true,
          column: {
            select: { label: true, key: true }
          }
        }
      }
    }
  });
}

async function loadReportTemplateContext() {
  const template = await fs.readFile(templatePath);
  const zip = await JSZip.loadAsync(template);
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error("DOCX template is missing word/document.xml");

  return {
    template,
    documentXml: await documentFile.async("string")
  };
}

export function prepareReportData(record: ReportRecord) {
  return reportDataFromRecord(record);
}

export function reportFileNameFromData(record: Pick<ReportRecord, "id">, data: ReportData) {
  const name = data.fullName || data.citizenId || record.id;
  const safeName = name.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "-").slice(0, 80);
  return `รายงานผล-${safeName || "record"}.docx`;
}

export async function prepareReportTemplateContext() {
  cachedTemplateContext ??= loadReportTemplateContext();
  return cachedTemplateContext;
}

export async function buildHealthReportDocx(record: ReportRecord, options: { context?: ReportTemplateContext; data?: ReportData; compression?: "STORE" | "DEFLATE" } = {}) {
  const context = options.context ?? (await prepareReportTemplateContext());
  const data = options.data ?? reportDataFromRecord(record);
  const zip = await JSZip.loadAsync(context.template);
  zip.file("word/document.xml", applyReportData(context.documentXml, data));
  return zip.generateAsync({ type: "nodebuffer", compression: options.compression ?? "DEFLATE" });
}

export function reportFileName(record: ReportRecord, data = reportDataFromRecord(record)) {
  return reportFileNameFromData(record, data);
}
