export interface Cie10CatalogCsvRow {
  Codigo: string;
  Nombre: string;
  Codigo_Enfermedad: string;
}

export interface Cie10TranslatorCsvRow {
  Codigo: string;
  Diagnostico: string;
  CIE_10?: string | null;
}

export interface Cie10ReferenceCsvRow {
  code: string;
  description: string;
  level?: string;
  source?: string;
  code_0?: string;
  code_1?: string;
  code_2?: string;
  code_3?: string;
  code_4?: string;
}

export interface CatalogEntry {
  codigoInterno: string;
  codigo: string;
  nombre: string;
}

export interface ClinicalRecord {
  codigoTraductor: string;
  diagnostico: string;
  cie10Original: string | null;
}

export interface AiSuggestion {
  codigo: string;
  descripcion: string;
  razonamiento?: string | null;
  informacionFaltante?: string[];
}

export type SuggestionSupport =
  | "VALIDADO_INSTITUCIONAL"
  | "REFERENCIA_EXTERNA"
  | "REQUIERE_ATENCION";

export type SuggestionConfidence = "ALTA" | "MEDIA" | "BAJA";

export interface RagCandidate {
  codigo: string;
  nombreInstitucional: string | null;
  descripcionReferencia: string | null;
  jerarquia: string[];
  enCatalogoInstitucional: boolean;
  enReferenciaExterna: boolean;
  distance: number | null;
  matchType?: "EXACT_CODE" | "EXACT_TEXT" | "LEXICAL" | "SEMANTIC";
  score?: number;
}

export interface AiResponse {
  status: "suggestions" | "insufficient_information";
  suggestions: AiSuggestion[];
  reason: string | null;
  usage?: import("./ai/usage.js").TokenUsage | null;
}

export interface AiRepairFeedback {
  acceptedCodes: string[];
  rejectedCodes: string[];
}

export interface ValidatedSuggestion {
  codigo: string;
  descripcionModelo: string;
  codigoInternoCatalogo: string | null;
  nombreCatalogo: string;
  razonamiento: string | null;
  soporte: SuggestionSupport;
  confianza: SuggestionConfidence;
  distanciaRag: number | null;
  informacionFaltante: string[];
}

export interface SuggestionResult {
  codigoTraductor: string;
  diagnostico: string;
  cie10Original: string | null;
  aiStatus: "suggestions" | "insufficient_information" | "error";
  sugerencias: ValidatedSuggestion[];
  razonamientoClinico: string | null;
  error: string | null;
  modelo: string;
  procesadoEn: string;
  tokenUsage: import("./ai/usage.js").TokenUsage;
  ragVersion: string;
  inputSha256: string;
}

export interface RunMetadata {
  runId: string;
  model: string;
  promptVersion: string;
  sourceCatalogUri: string;
  sourceTranslatorUri: string;
  maxRecords: number | null;
  ragVersion: string;
  periodo: string;
}

export interface ClinicalRecordSource {
  sourceCatalogUri: string;
  sourceTranslatorUri: string;
  readCatalog(): Promise<Cie10CatalogCsvRow[]>;
  readTranslator(): Promise<Cie10TranslatorCsvRow[]>;
  readReferenceCatalog?(): Promise<Cie10ReferenceCsvRow[]>;
}

export interface ClinicalRecordExporter {
  exportReviewedRecords(): Promise<void>;
}

export interface AiProvider {
  classify(diagnosisText: string, candidates?: RagCandidate[], feedback?: AiRepairFeedback): Promise<AiResponse>;
}

export interface EmbeddingProvider {
  embed(inputs: string[]): Promise<number[][]>;
  metrics?(): {
    requests: number;
    inputTokens: number;
    errors: number;
    totalLatencyMs: number;
  };
}

export interface RagCatalog {
  activeVersion(): Promise<string>;
  search(diagnosisText: string, version: string, topK?: number): Promise<RagCandidate[]>;
}
