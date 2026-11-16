import OpenAI from "openai";
import type { ReasoningEffort } from "openai/resources/shared";
import type { AiProvider, AiRepairFeedback, AiResponse, RagCandidate } from "../types.js";
import { normalizeOpenAiUsage } from "./usage.js";
import { MAX_CIE10_SUGGESTIONS, MIN_CIE10_SUGGESTIONS } from "../suggestion-limits.js";

export const SYSTEM_PROMPT = `
Eres un codificador medico experto que apoya a un revisor humano.
No diagnosticas pacientes y no sustituyes criterio medico.

Reglas estrictas:
1. Usa solo el texto entregado; no inventes antecedentes ni hallazgos.
2. Cuando haya informacion suficiente, devuelve exactamente cinco codigos unicos, ordenados de mejor a peor. El primero debe ser tu mejor opcion y los demas deben ser alternativas clinicamente plausibles, sin inventar detalles.
3. Si faltan detalles de lateralidad, gravedad, mecanismo o anatomia, no los inventes: elige el codigo compatible menos especifico y declara la informacion faltante. Usa insufficient_information solo cuando no exista una codificacion razonable, el texto sea administrativo o sea basura.
4. Los candidatos recuperados estan ordenados por fuerza de coincidencia. Si el primer candidato es clinicamente compatible con el texto, usalo como primera sugerencia. Prioriza coincidencias exactas y candidatos institucionales fuertes; apartate de ellos solo cuando contradigan el texto y explica por que.
5. Puedes proponer un codigo fuera de la evidencia solo si ningun candidato recuperado representa una alternativa clinicamente valida; justificalo claramente y no sustituyas un candidato fuerte por una opcion mas especifica basada en datos ausentes.
6. No devuelvas probabilidades ni niveles de confianza; el sistema los calcula con evidencia de recuperacion verificable.
7. Cada sugerencia debe incluir una razon de 1 a 2 oraciones, menor a 200 caracteres.
8. Devuelve solo JSON valido.
`.trim();

function providerError(message: string, usage: AiResponse["usage"]): Error {
  return Object.assign(new Error(message), { tokenUsage: usage });
}

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "suggestions", "reason"],
  properties: {
    status: { type: "string", enum: ["suggestions", "insufficient_information"] },
    suggestions: {
      type: "array",
      minItems: 0,
      maxItems: MAX_CIE10_SUGGESTIONS,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["codigo", "descripcion", "razonamiento", "informacionFaltante"],
        properties: {
          codigo: { type: "string" },
          descripcion: { type: "string" },
          razonamiento: { type: "string" },
          informacionFaltante: {
            type: "array",
            maxItems: 6,
            items: { type: "string" },
          },
        },
      },
    },
    reason: { type: ["string", "null"] },
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseResponse(raw: string, usage: AiResponse["usage"]): AiResponse {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) throw new Error("OpenAI JSON is not an object");
  const status = parsed.status;
  const suggestions = parsed.suggestions;
  if (status !== "suggestions" && status !== "insufficient_information") {
    throw new Error("OpenAI JSON status is invalid");
  }
  if (!Array.isArray(suggestions) || suggestions.length > MAX_CIE10_SUGGESTIONS) {
    throw new Error("OpenAI JSON suggestions are invalid");
  }
  if (status === "suggestions" && suggestions.length < MIN_CIE10_SUGGESTIONS) {
    throw new Error("OpenAI suggestions response must include at least one suggestion");
  }
  if (status === "insufficient_information" && suggestions.length !== 0) {
    throw new Error("OpenAI abstention must not contain suggestions");
  }
  return {
    status,
    suggestions: suggestions
      .filter(isRecord)
      .map((suggestion) => ({
        codigo: String(suggestion.codigo ?? ""),
        descripcion: String(suggestion.descripcion ?? ""),
        razonamiento: suggestion.razonamiento == null ? null : String(suggestion.razonamiento),
        informacionFaltante: Array.isArray(suggestion.informacionFaltante)
          ? suggestion.informacionFaltante.map(String).filter(Boolean).slice(0, 6)
          : [],
      }))
      .filter((suggestion) => suggestion.codigo.trim() && suggestion.descripcion.trim()),
    reason: parsed.reason == null ? null : String(parsed.reason),
    usage,
  };
}

export class OpenAiCie10Provider implements AiProvider {
  private readonly openai: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly reasoningEffort: ReasoningEffort,
  ) {
    this.openai = new OpenAI({ apiKey });
  }

  async classify(diagnosisText: string, candidates: RagCandidate[] = [], feedback?: AiRepairFeedback): Promise<AiResponse> {
    const repairContext = feedback
      ? `\nReparacion requerida. Conserva estos codigos validos: ${feedback.acceptedCodes.join(", ") || "ninguno"}. `
        + `No repitas estos codigos rechazados: ${feedback.rejectedCodes.join(", ") || "ninguno"}. `
        + `Devuelve nuevamente el codigo principal y completa exactamente ${MAX_CIE10_SUGGESTIONS} alternativas clinicamente pertinentes.`
      : "";
    const ragContext = candidates.length
      ? candidates.map((candidate, index) => [
          `${index + 1}. ${candidate.codigo}`,
          candidate.nombreInstitucional ?? candidate.descripcionReferencia ?? "Sin descripcion",
          candidate.enCatalogoInstitucional ? "institucional" : "referencia externa",
        ].join(" | ")).join("\n")
      : "Sin candidatos recuperados.";
    const response = await this.openai.responses.create({
      model: this.model,
      store: false,
      reasoning: { effort: this.reasoningEffort },
      instructions: SYSTEM_PROMPT,
      input: `Texto diagnostico a codificar: ${diagnosisText}\n\nCandidatos recuperados:\n${ragContext}${repairContext}`,
      text: {
        format: {
          type: "json_schema",
          name: "cie10_suggestions",
          strict: true,
          schema: responseSchema,
        },
      },
    });

    const usage = normalizeOpenAiUsage(response.usage);
    if (!response.output_text) throw providerError("OpenAI returned an empty response", usage);
    try {
      return parseResponse(response.output_text, usage);
    } catch (error) {
      throw providerError(error instanceof Error ? error.message : String(error), usage);
    }
  }
}
