import type {
  CatalogEntry,
  Cie10CatalogCsvRow,
  Cie10ReferenceCsvRow,
  Cie10TranslatorCsvRow,
  ClinicalRecord,
} from "../types.js";

export function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeCie10Code(value: string | null | undefined): string {
  const normalized = normalizeText(value).toUpperCase().replace(/[–—]/g, "-");
  return /^[A-Z]\d{2}[0-9A-Z]{1,4}$/.test(normalized)
    ? `${normalized.slice(0, 3)}.${normalized.slice(3)}`
    : normalized;
}

function isReferenceCode(value: string): boolean {
  return /^[A-Z]\d{2}(?:\.[0-9A-Z]{1,4})?$/.test(value)
    || /^[A-Z]\d{2}-[A-Z0-9]{3}$/.test(value);
}

function normalizeSearchText(value: string): string {
  return normalizeText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export interface ReferenceCatalogEntry {
  codigo: string;
  descripcion: string;
  nivel: number;
  parentCodigo: string | null;
  ancestros: string[];
  jerarquia: string[];
  source: string;
}

export function referenceCatalogEntries(rows: Cie10ReferenceCsvRow[]): Map<string, ReferenceCatalogEntry> {
  const allRows = new Map<string, { descripcion: string; nivel: number; ancestros: string[]; source: string }>();
  for (const row of rows) {
    const codigo = normalizeCie10Code(row.code);
    const descripcion = normalizeText(row.description);
    const nivel = Number.parseInt(normalizeText(row.level), 10);
    if (!isReferenceCode(codigo) || !descripcion || !Number.isInteger(nivel) || nivel < 0 || nivel > 5) {
      throw new Error(`Invalid reference catalog row: ${codigo || "<empty>"}`);
    }
    const ancestros = [row.code_0, row.code_1, row.code_2, row.code_3, row.code_4]
      .map(normalizeCie10Code)
      .filter(Boolean);
    if (ancestros.length !== nivel) {
      throw new Error(`Inconsistent hierarchy for ${codigo}: level ${nivel} has ${ancestros.length} ancestors`);
    }
    const existing = allRows.get(codigo);
    if (existing && normalizeSearchText(existing.descripcion) !== normalizeSearchText(descripcion)) {
      throw new Error(`Conflicting duplicate reference code: ${codigo}`);
    }
    allRows.set(codigo, {
      descripcion,
      nivel,
      ancestros,
      source: normalizeText(row.source) || "verasativa/CIE-10",
    });
  }

  for (const [codigo, entry] of allRows) {
    for (const ancestor of entry.ancestros) {
      if (!allRows.has(ancestor)) throw new Error(`Missing ancestor ${ancestor} for ${codigo}`);
      if (ancestor === codigo) throw new Error(`Hierarchy cycle detected for ${codigo}`);
    }
    const parent = entry.ancestros.at(-1);
    if (parent) {
      const parentEntry = allRows.get(parent);
      if (!parentEntry || parentEntry.nivel !== entry.nivel - 1) {
        throw new Error(`Invalid parent ${parent} for ${codigo}`);
      }
      const expectedAncestors = [...parentEntry.ancestros, parent];
      if (expectedAncestors.join("|") !== entry.ancestros.join("|")) {
        throw new Error(`Inconsistent ancestor chain for ${codigo}`);
      }
    }
  }

  const entries = new Map<string, ReferenceCatalogEntry>();
  for (const [codigo, entry] of allRows) {
    if (!/^[A-Z]\d{2}(?:\.[0-9A-Z]{1,4})?$/.test(codigo)) continue;
    entries.set(codigo, {
      codigo,
      descripcion: entry.descripcion,
      nivel: entry.nivel,
      parentCodigo: entry.ancestros.at(-1) ?? null,
      ancestros: entry.ancestros,
      jerarquia: entry.ancestros.map((ancestor) => allRows.get(ancestor)?.descripcion ?? ancestor),
      source: entry.source,
    });
  }
  return entries;
}

export function catalogEntries(rows: Cie10CatalogCsvRow[]): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  const seenInternal = new Set<string>();
  const descriptionByCode = new Map<string, string>();
  for (const row of rows) {
    const codigoInterno = normalizeText(row.Codigo);
    const codigo = normalizeCie10Code(row.Codigo_Enfermedad);
    const nombre = normalizeText(row.Nombre);
    if (!codigoInterno || !codigo || !nombre || seenInternal.has(codigoInterno)) continue;
    if (!/^[A-Z]\d{2}(?:\.[0-9A-Z]{1,4})?$/.test(codigo)) continue;
    const previousDescription = descriptionByCode.get(codigo);
    if (previousDescription && normalizeSearchText(previousDescription) !== normalizeSearchText(nombre)) {
      throw new Error(`Conflicting institutional descriptions for ${codigo}`);
    }
    seenInternal.add(codigoInterno);
    descriptionByCode.set(codigo, nombre);
    entries.push({ codigoInterno, codigo, nombre });
  }
  return entries;
}

export function buildCatalogMaps(entries: CatalogEntry[]): {
  byCodigoInterno: Map<string, CatalogEntry>;
  byCodigo: Map<string, CatalogEntry>;
} {
  return {
    byCodigoInterno: new Map(entries.map((entry) => [entry.codigoInterno, entry])),
    byCodigo: new Map(entries.map((entry) => [entry.codigo, entry])),
  };
}

export function pendingRecords(
  rows: Cie10TranslatorCsvRow[],
  catalogMaps: { byCodigoInterno: Map<string, CatalogEntry>; byCodigo: Map<string, CatalogEntry> },
): ClinicalRecord[] {
  const pending: ClinicalRecord[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const codigoTraductor = normalizeText(row.Codigo);
    const diagnostico = normalizeText(row.Diagnostico);
    const cie10Original = normalizeText(row.CIE_10);
    if (!codigoTraductor || !diagnostico || seen.has(codigoTraductor)) continue;
    seen.add(codigoTraductor);
    const alreadyValid = cie10Original &&
      cie10Original !== "-1" &&
      (catalogMaps.byCodigoInterno.has(cie10Original) || catalogMaps.byCodigo.has(normalizeCie10Code(cie10Original)));
    if (!alreadyValid) {
      pending.push({ codigoTraductor, diagnostico, cie10Original: cie10Original || "-1" });
    }
  }
  return pending;
}
