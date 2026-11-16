import type { CsvRow } from './csv.js';

export const FORBIDDEN_COLUMNS = Object.freeze([
  'HistoriaClinica',
  'NombrePaciente',
  'FechaNacimiento',
  'IdMedico',
  'Medico',
  'IdConsulta',
  'IdCorrelativo',
  'IdComunidad',
  'Comunidad',
]);

export const OUTPUT_HEADERS = Object.freeze([
  'consulta_id',
  'fecha',
  'turno',
  'clinica',
  'tipo_clinica',
  'servicio',
  'departamento_hospitalario',
  'sexo',
  'edad_dias',
  'edad_meses',
  'edad_anios',
  'pueblo',
  'comunidad_linguistica',
  'departamento',
  'municipio',
  'diagnostico',
  'cie10',
  'cie10_descripcion',
  'nuevo',
  'primera',
  'reconsulta',
  'interconsulta',
  'emergencia',
  'dataset_version',
]);

function bool(value: string | undefined): string {
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['1', 'true', 'si', 'sí', 'yes', 'x'].includes(normalized) ? 'true' : 'false';
}

function dateOnly(value: string | undefined): string {
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) return `${slash[3]}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`;
  return text.slice(0, 10);
}

export function anonymizeRows(rows: CsvRow[], datasetVersion: string): CsvRow[] {
  return rows.map((row, index) => ({
    consulta_id: `sigsa_${String(index + 1).padStart(6, '0')}`,
    fecha: dateOnly(row.FechaHora),
    turno: row.Turno ?? '',
    clinica: row.Clinica ?? '',
    tipo_clinica: row.TipoClinica ?? '',
    servicio: row.Servicio ?? '',
    departamento_hospitalario: row.DepartamentoHospitalario ?? '',
    sexo: row.Sexo ?? '',
    edad_dias: row.EdadDias ?? '',
    edad_meses: row.EdadMeses ?? '',
    edad_anios: row.EdadAnios ?? '',
    pueblo: row.Pueblo ?? '',
    comunidad_linguistica: row.ComunidadLinguistica ?? '',
    departamento: row.Departamento ?? '',
    municipio: row.Municipio ?? '',
    diagnostico: row.Diagnostico ?? '',
    cie10: row.CIE10 ?? '',
    cie10_descripcion: row.CIE10Descripcion ?? '',
    nuevo: bool(row.Nuevo),
    primera: bool(row.Primera),
    reconsulta: bool(row.Reconsulta),
    interconsulta: bool(row.InterConsulta),
    emergencia: bool(row.Emergencia),
    dataset_version: datasetVersion,
  }));
}

export function validateDesidentifiedHeaders(headers: string[]): string[] {
  const errors: string[] = [];
  for (const forbidden of FORBIDDEN_COLUMNS) {
    if (headers.includes(forbidden)) errors.push(`Forbidden column present: ${forbidden}`);
  }
  for (const required of OUTPUT_HEADERS) {
    if (!headers.includes(required)) errors.push(`Required column missing: ${required}`);
  }
  return errors;
}
