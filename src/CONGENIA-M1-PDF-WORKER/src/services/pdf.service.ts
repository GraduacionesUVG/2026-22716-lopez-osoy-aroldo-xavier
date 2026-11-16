import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import type { ConsentPdfGenerateRequestedEvent } from '../types/event';
import type { ConsentPdfSourceRecord } from '../repositories/consent.repository';

interface DeclarationLine {
  title: string;
  description: string;
  accepted: boolean;
  required: boolean;
}

interface RenderConsentPdfParams {
  event: ConsentPdfGenerateRequestedEvent;
  record: ConsentPdfSourceRecord;
  signaturePng?: Buffer;
}

interface SignatureStrokePoint {
  x: number;
  y: number;
  dragging?: boolean;
}

interface SignatureTrace {
  points: SignatureStrokePoint[];
  canvasWidth: number;
  canvasHeight: number;
}

type ContentItem =
  | { kind: 'paragraph'; text: string }
  | { kind: 'paragraph-lead'; lead: string; text: string }
  | { kind: 'bullet-list'; items: Array<{ lead?: string; text: string }> };

interface ConsentSection {
  number: number;
  title: string;
  items: ContentItem[];
}

const PAGE_MARGIN = 50;
const FOOTER_Y_OFFSET = 12;
const BRAND_BLUE = '#254B66';
const BRAND_DARK = '#173247';
const TEXT = '#1F2937';
const MUTED = '#6B7280';
const BORDER = '#C9D6DE';
const SOFT_BLUE = '#E9F1F5';
const SOFT_GRAY = '#F7F8FA';

const consentContent = {
  hospitalName: 'Hospital Regional de Cobán',
  formTitle: 'Formulario de Consentimiento Informado para Padres o Representantes Legales',
  institucion: 'Hospital Regional de Cobán',
  proyecto: 'Sistema SADC - Enfermedades Genéticas Pediátricas',
  introGreeting: 'Estimado padre, madre o representante legal:',
  introBody:
    'Invitamos a su hijo(a) a participar en un registro especial del Hospital Regional de Cobán para niños con sospecha de enfermedades genéticas o hereditarias. La participación es totalmente voluntaria. Por favor, lea esta información detenidamente. Si tiene alguna duda, el médico se la explicará.',
  sections: [
    {
      number: 1,
      title: 'De qué trata este registro',
      items: [
        {
          kind: 'paragraph',
          text: 'Para ayudar a los médicos a identificar enfermedades raras o genéticas de forma más rápida, el hospital está utilizando un nuevo sistema de computadora. Este sistema analiza la información médica de su hijo(a) y la compara con bases de datos internacionales seguras para buscar similitudes con otras enfermedades conocidas.',
        },
      ],
    },
    {
      number: 2,
      title: 'Qué información guardaremos y cómo se usará',
      items: [
        {
          kind: 'paragraph',
          text: 'Si usted acepta, guardaremos en el expediente electrónico de su hijo(a) lo siguiente:',
        },
        {
          kind: 'bullet-list',
          items: [
            {
              text: 'La historia médica, síntomas y antecedentes familiares de su hijo(a).',
            },
            {
              lead: 'Fotografías del rostro de su hijo(a):',
              text: 'Estas fotos son muy importantes porque algunas enfermedades genéticas muestran características específicas en el rostro. Las fotos serán analizadas por un programa de computadora especializado para ayudar al médico a entender mejor el caso de su hijo(a).',
            },
          ],
        },
      ],
    },
    {
      number: 3,
      title: 'Cuáles son los beneficios y riesgos',
      items: [
        {
          kind: 'paragraph-lead',
          lead: 'Beneficios:',
          text: 'Esto no tiene ningún costo. Al usar esta tecnología, los médicos tendrán más información para intentar encontrar qué enfermedad podría tener su hijo(a), ayudando a darle un mejor seguimiento médico sin necesidad inmediata de enviar exámenes costosos al extranjero.',
        },
        {
          kind: 'paragraph-lead',
          lead: 'Riesgos:',
          text: 'No hay ningún riesgo físico. No se tomarán muestras de sangre adicionales solo para esto, ni se darán medicamentos.',
        },
      ],
    },
    {
      number: 4,
      title: 'Cómo protegeremos su privacidad',
      items: [
        {
          kind: 'paragraph',
          text: 'Toda la información y las fotografías de su hijo(a) se guardarán en computadoras seguras del hospital. Su nombre y sus datos personales serán protegidos. Solo el personal médico autorizado del hospital sabrá a quién le pertenecen los datos.',
        },
      ],
    },
    {
      number: 5,
      title: 'Sus derechos',
      items: [
        {
          kind: 'paragraph',
          text: 'Usted decide si quiere participar o no. Si dice que no, su hijo(a) seguirá recibiendo su atención médica normal en el hospital sin ningún problema. Usted también puede cambiar de opinión más adelante y pedir que dejemos de usar estos datos.',
        },
      ],
    },
  ] satisfies ConsentSection[],
  declarationTitle: 'Declaración de Consentimiento',
  declarationInstruction:
    'Las siguientes opciones registran lo aceptado por el padre, madre o representante legal en la aplicación.',
  signaturesTitle: 'Firmas y Validación',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function normalizeRelation(value: string): string {
  const normalized = value.trim().toUpperCase();
  const labels: Record<string, string> = {
    PADRE: 'Padre',
    MADRE: 'Madre',
    TUTOR: 'Tutor legal',
    REPRESENTANTE_LEGAL: 'Representante legal',
  };
  return labels[normalized] ?? value;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || 'No disponible';

  try {
    return new Intl.DateTimeFormat('es-GT', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Guatemala',
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function extractDocumentCode(firmaEvidenciaTecnica: unknown, record: ConsentPdfSourceRecord): string {
  if (isRecord(firmaEvidenciaTecnica)) {
    const candidates = [
      firmaEvidenciaTecnica.codigoDocumento,
      firmaEvidenciaTecnica.codigo_documento,
    ];

    for (const candidate of candidates) {
      const text = asText(candidate);
      if (text) return text;
    }
  }

  const year = new Date(record.fecha_hora_aceptacion).getFullYear();
  const safeYear = Number.isFinite(year) ? year : new Date().getFullYear();
  return `CNS-${safeYear}-${record.consentimiento_id.slice(0, 8).toUpperCase()}`;
}

function extractDeclarations(firmaEvidenciaTecnica: unknown): DeclarationLine[] {
  if (!isRecord(firmaEvidenciaTecnica)) {
    return [];
  }

  const candidates: unknown[] = [];
  if (Array.isArray(firmaEvidenciaTecnica.declaraciones)) {
    candidates.push(...firmaEvidenciaTecnica.declaraciones);
  }

  const nestedConsent = firmaEvidenciaTecnica.consentimiento;
  if (isRecord(nestedConsent) && Array.isArray(nestedConsent.declaraciones)) {
    candidates.push(...nestedConsent.declaraciones);
  }

  return candidates
    .filter(isRecord)
    .map((item) => {
      const title = asText(item.titulo) || asText(item.title) || 'Declaracion';
      const description = asText(item.descripcion) || asText(item.description);
      const accepted = asBoolean(item.aceptada) || asBoolean(item.accepted);
      const required = asBoolean(item.obligatoria) || asBoolean(item.required);
      return { title, description, accepted, required };
    });
}

function extractSignatureTrace(firmaEvidenciaTecnica: unknown): SignatureTrace | null {
  if (!isRecord(firmaEvidenciaTecnica)) return null;

  const candidates: Record<string, unknown>[] = [firmaEvidenciaTecnica];
  if (isRecord(firmaEvidenciaTecnica.consentimiento)) {
    candidates.push(firmaEvidenciaTecnica.consentimiento);
  }

  for (const candidate of candidates) {
    if (!Array.isArray(candidate.strokes)) continue;

    const width = asFiniteNumber(candidate.canvasWidth);
    const height = asFiniteNumber(candidate.canvasHeight);
    if (!width || !height || width <= 0 || height <= 0) continue;

    const points: SignatureStrokePoint[] = [];
    for (const point of candidate.strokes) {
      if (!isRecord(point)) continue;
      const x = asFiniteNumber(point.x);
      const y = asFiniteNumber(point.y);
      if (x == null || y == null) continue;
      points.push({ x, y, dragging: point.dragging === true });
    }

    if (points.length === 0) continue;
    return { points, canvasWidth: width, canvasHeight: height };
  }

  return null;
}

function resolveLogoPath(): string | null {
  const candidates = [
    path.resolve(__dirname, '..', 'assets', 'congenia-logo.png'),
    path.resolve(process.cwd(), 'src', 'assets', 'congenia-logo.png'),
    path.resolve(process.cwd(), 'dist', 'assets', 'congenia-logo.png'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function pageBottom(doc: PDFKit.PDFDocument): number {
  return doc.page.height - PAGE_MARGIN - 22;
}

function contentWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - PAGE_MARGIN * 2;
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number): void {
  if (doc.y + height > pageBottom(doc)) {
    doc.addPage();
  }
}

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  ensureSpace(doc, 44);
  doc.moveDown(0.6);
  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor(BRAND_DARK)
    .text(title, PAGE_MARGIN, doc.y, { width: contentWidth(doc) });
  doc
    .moveTo(PAGE_MARGIN, doc.y + 4)
    .lineTo(doc.page.width - PAGE_MARGIN, doc.y + 4)
    .lineWidth(0.8)
    .strokeColor('#AFC3CE')
    .stroke();
  doc.moveDown(0.7);
  doc.fillColor(TEXT);
}

function drawParagraph(doc: PDFKit.PDFDocument, text: string, options: PDFKit.Mixins.TextOptions = {}): void {
  doc
    .font('Helvetica')
    .fontSize(10.2)
    .fillColor(TEXT)
    .text(text, PAGE_MARGIN, doc.y, {
      width: contentWidth(doc),
      lineGap: 3,
      ...options,
    });
  doc.moveDown(0.45);
}

function drawBullet(doc: PDFKit.PDFDocument, lead: string | undefined, text: string): void {
  ensureSpace(doc, 38);
  const y = doc.y + 5;
  const x = PAGE_MARGIN + 8;
  doc.circle(x, y, 2.2).fill(BRAND_BLUE);
  doc.fillColor(TEXT);

  const bulletText = lead ? `${lead} ${text}` : text;
  doc
    .font('Helvetica')
    .fontSize(10.2)
    .text(bulletText, PAGE_MARGIN + 22, doc.y, {
      width: contentWidth(doc) - 22,
      lineGap: 3,
    });
  doc.moveDown(0.35);
}

function drawHeader(doc: PDFKit.PDFDocument, record: ConsentPdfSourceRecord): void {
  const logoPath = resolveLogoPath();
  const headerY = PAGE_MARGIN - 4;

  if (logoPath) {
    try {
      doc.image(logoPath, PAGE_MARGIN, headerY, { fit: [92, 52] });
    } catch {
      doc.font('Helvetica-Bold').fontSize(16).fillColor(BRAND_BLUE).text('CONGENIA', PAGE_MARGIN, headerY);
    }
  } else {
    doc.font('Helvetica-Bold').fontSize(16).fillColor(BRAND_BLUE).text('CONGENIA', PAGE_MARGIN, headerY);
  }

  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(BRAND_DARK)
    .text(consentContent.hospitalName, PAGE_MARGIN + 112, headerY + 2, {
      width: contentWidth(doc) - 112,
      align: 'right',
    });

  doc
    .font('Helvetica')
    .fontSize(8.8)
    .fillColor(MUTED)
    .text(consentContent.proyecto, PAGE_MARGIN + 112, headerY + 20, {
      width: contentWidth(doc) - 112,
      align: 'right',
    })
    .text(`Fecha de aceptación: ${formatDateTime(record.fecha_hora_aceptacion)}`, {
      width: contentWidth(doc) - 112,
      align: 'right',
    });

  doc
    .moveTo(PAGE_MARGIN, headerY + 60)
    .lineTo(doc.page.width - PAGE_MARGIN, headerY + 60)
    .lineWidth(1)
    .strokeColor('#9DB9C8')
    .stroke();

  doc.y = headerY + 78;
}

function drawInfoGrid(doc: PDFKit.PDFDocument, rows: Array<[string, string]>): void {
  const labelWidth = 126;
  const valueWidth = contentWidth(doc) - labelWidth;
  const x = PAGE_MARGIN;
  const rowHeights = rows.map(([, value]) => {
    const valueHeight = doc.heightOfString(value || 'No disponible', {
      width: valueWidth - 16,
      lineGap: 2,
    });
    return Math.max(26, valueHeight + 16);
  });
  const totalHeight = rowHeights.reduce((sum, height) => sum + height, 0);

  ensureSpace(doc, totalHeight + 12);
  let y = doc.y;

  rows.forEach(([label, value], index) => {
    const rowHeight = rowHeights[index];
    const rowY = y;
    doc.rect(x, rowY, labelWidth, rowHeight).fillAndStroke(SOFT_GRAY, BORDER);
    doc.rect(x + labelWidth, rowY, valueWidth, rowHeight).fillAndStroke('#FFFFFF', BORDER);

    doc
      .font('Helvetica-Bold')
      .fontSize(8.4)
      .fillColor(MUTED)
      .text(label, x + 8, rowY + 8, { width: labelWidth - 16 });
    doc
      .font('Helvetica')
      .fontSize(9.2)
      .fillColor(TEXT)
      .text(value || 'No disponible', x + labelWidth + 8, rowY + 8, {
        width: valueWidth - 16,
        lineGap: 2,
      });
    y += rowHeight;
  });

  doc.y = y + 14;
}

function drawDocumentTitle(doc: PDFKit.PDFDocument, record: ConsentPdfSourceRecord): void {
  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor(BRAND_DARK)
    .text(consentContent.formTitle.toUpperCase(), PAGE_MARGIN, doc.y, {
      width: contentWidth(doc),
      align: 'center',
      lineGap: 2,
    });

  doc.moveDown(0.8);

  drawInfoGrid(doc, [
    ['Institución', consentContent.institucion],
    ['Proyecto', consentContent.proyecto],
    ['Código de documento', extractDocumentCode(record.firma_evidencia_tecnica, record)],
    ['Fecha y hora', formatDateTime(record.fecha_hora_aceptacion)],
  ]);
}

function drawIntroAndSections(doc: PDFKit.PDFDocument): void {
  doc.font('Helvetica-Bold').fontSize(11).fillColor(BRAND_DARK).text(consentContent.introGreeting);
  doc.moveDown(0.35);
  drawParagraph(doc, consentContent.introBody);

  for (const section of consentContent.sections) {
    drawSectionTitle(doc, `${section.number}. ${section.title}`);
    for (const item of section.items) {
      if (item.kind === 'paragraph') {
        drawParagraph(doc, item.text);
      } else if (item.kind === 'paragraph-lead') {
        drawParagraph(doc, `${item.lead} ${item.text}`);
      } else {
        item.items.forEach((bullet) => drawBullet(doc, bullet.lead, bullet.text));
      }
    }
  }
}

function drawDeclarations(doc: PDFKit.PDFDocument, declarations: DeclarationLine[]): void {
  drawSectionTitle(doc, consentContent.declarationTitle);
  drawParagraph(doc, consentContent.declarationInstruction);

  if (declarations.length === 0) {
    drawParagraph(doc, 'No se registraron declaraciones estructuradas en la evidencia técnica.');
    return;
  }

  for (const declaration of declarations) {
    ensureSpace(doc, 72);

    const x = PAGE_MARGIN;
    const y = doc.y;
    const boxWidth = contentWidth(doc);
    const statusWidth = 86;
    const leftWidth = boxWidth - statusWidth - 38;
    const status = declaration.accepted ? 'ACEPTADA' : 'NO ACEPTADA';
    const statusColor = declaration.accepted ? BRAND_BLUE : '#9A3412';
    const requiredText = declaration.required ? 'Obligatoria' : 'Opcional';
    const description = declaration.description || 'Sin descripción registrada.';

    doc.font('Helvetica-Bold').fontSize(10.5);
    const titleHeight = doc.heightOfString(declaration.title, {
      width: leftWidth,
      lineGap: 1,
    });
    doc.font('Helvetica').fontSize(8.5);
    const requiredHeight = doc.heightOfString(requiredText, {
      width: leftWidth,
    });
    doc.font('Helvetica').fontSize(9.2);
    const descriptionHeight = doc.heightOfString(description, {
      width: leftWidth,
      lineGap: 2,
    });
    const boxHeight = Math.max(70, titleHeight + requiredHeight + descriptionHeight + 34);

    ensureSpace(doc, boxHeight + 10);
    doc.roundedRect(x, y, boxWidth, boxHeight, 4).fillAndStroke('#FFFFFF', BORDER);

    const titleY = y + 10;
    const requiredY = titleY + titleHeight + 3;
    const descriptionY = requiredY + requiredHeight + 5;

    doc
      .font('Helvetica-Bold')
      .fontSize(10.5)
      .fillColor(BRAND_DARK)
      .text(declaration.title, x + 12, titleY, { width: leftWidth, lineGap: 1 });
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(requiredText, x + 12, requiredY, {
      width: leftWidth,
    });
    doc
      .font('Helvetica')
      .fontSize(9.2)
      .fillColor(TEXT)
      .text(description, x + 12, descriptionY, {
        width: leftWidth,
        lineGap: 2,
      });

    doc.roundedRect(x + boxWidth - statusWidth - 12, y + 14, statusWidth, 22, 11).fill(SOFT_BLUE);
    doc
      .font('Helvetica-Bold')
      .fontSize(7.7)
      .fillColor(statusColor)
      .text(status, x + boxWidth - statusWidth - 8, y + 21, {
        width: statusWidth - 8,
        align: 'center',
      });

    doc.y = y + boxHeight + 10;
  }
}

function drawPatientAndSignature(
  doc: PDFKit.PDFDocument,
  record: ConsentPdfSourceRecord,
  signaturePng: Buffer | undefined,
  reject: (reason?: unknown) => void
): boolean {
  drawSectionTitle(doc, consentContent.signaturesTitle);

  drawInfoGrid(doc, [
    ['Paciente', `Identificador interno ${record.paciente_id}`],
    ['Número de expediente', record.paciente_ext_id ?? record.paciente_id],
    ['Fecha de consulta', formatDateTime(record.fecha_consulta)],
    ['Diagnóstico', record.diagnosticos_ext_texto || 'Sin diagnóstico registrado'],
  ]);

  drawInfoGrid(doc, [
    ['Firmante', record.nombre_firmante ?? 'No disponible'],
    ['Relación con el paciente', normalizeRelation(record.tipo_firmante)],
    ['Médico responsable', record.medico_nombre ?? 'No disponible'],
    ['Especialidad', record.especialidad_medico || 'No disponible'],
  ]);

  ensureSpace(doc, 178);
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(BRAND_DARK).text('Firma del representante legal', PAGE_MARGIN, doc.y);
  doc.moveDown(0.45);

  const signatureBox = {
    x: PAGE_MARGIN,
    y: doc.y,
    width: 300,
    height: 122,
  };

  doc.roundedRect(signatureBox.x, signatureBox.y, signatureBox.width, signatureBox.height, 4).stroke(BORDER);

  const signatureTrace = extractSignatureTrace(record.firma_evidencia_tecnica);
  if (signatureTrace) {
    drawSignatureTrace(
      doc,
      signatureTrace,
      signatureBox.x + 10,
      signatureBox.y + 10,
      signatureBox.width - 20,
      signatureBox.height - 20
    );
    doc.y = signatureBox.y + signatureBox.height + 8;
  } else if (signaturePng && signaturePng.length > 0) {
    try {
      doc.image(signaturePng, signatureBox.x + 10, signatureBox.y + 10, {
        fit: [signatureBox.width - 20, signatureBox.height - 20] as [number, number],
      });
      doc.y = signatureBox.y + signatureBox.height + 8;
    } catch (error) {
      reject(new Error('Unable to render signature image into PDF', { cause: error }));
      return false;
    }
  } else {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(MUTED)
      .text('No se encontró trazo de firma ni firma base64 embebida.', signatureBox.x + 12, signatureBox.y + 14, {
        width: signatureBox.width - 24,
      });
    doc.y = signatureBox.y + signatureBox.height + 8;
  }

  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(MUTED)
    .text(
      'Este documento electrónico queda guardado de forma inalterable en el expediente digital del paciente.',
      PAGE_MARGIN,
      doc.y,
      { width: contentWidth(doc), lineGap: 2 }
    );
  doc.moveDown(0.8);

  return true;
}

function drawAuditBlock(
  doc: PDFKit.PDFDocument,
  event: ConsentPdfGenerateRequestedEvent,
  record: ConsentPdfSourceRecord
): void {
  drawSectionTitle(doc, 'Validación técnica');
  doc
    .font('Helvetica')
    .fontSize(8.2)
    .fillColor(MUTED)
    .text(
      [
        `Consentimiento: ${record.consentimiento_id}`,
        `Ficha clínica: ${record.ficha_id}`,
        `Solicitud PDF: ${event.jobId}`,
        `Versión legal: ${record.version_texto_legal || 'No disponible'}`,
        'Emitido por CONGENIA-M1-PDF-WORKER para auditoría documental.',
      ].join('\n'),
      PAGE_MARGIN,
      doc.y,
      { width: contentWidth(doc), lineGap: 2 }
    );
}

function drawSignatureTrace(
  doc: PDFKit.PDFDocument,
  trace: SignatureTrace,
  originX: number,
  originY: number,
  boxWidth: number,
  boxHeight: number
) {
  const scaleX = boxWidth / trace.canvasWidth;
  const scaleY = boxHeight / trace.canvasHeight;

  doc.save();
  doc.lineWidth(1.6).strokeColor('#111111');

  let previous: SignatureStrokePoint | null = null;
  for (const point of trace.points) {
    const x = originX + point.x * scaleX;
    const y = originY + point.y * scaleY;

    if (!previous || !point.dragging) {
      doc.circle(x, y, 0.8).fill('#111111');
      doc.fillColor('#000000');
      previous = point;
      continue;
    }

    const fromX = originX + previous.x * scaleX;
    const fromY = originY + previous.y * scaleY;
    doc.moveTo(fromX, fromY).lineTo(x, y).stroke();
    previous = point;
  }

  doc.restore();
}

function addPageNumbers(doc: PDFKit.PDFDocument): void {
  const range = doc.bufferedPageRange();

  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(`CONGENIA - Consentimiento informado | Página ${i + 1} de ${range.count}`, PAGE_MARGIN, doc.page.height - PAGE_MARGIN - FOOTER_Y_OFFSET, {
        width: contentWidth(doc),
        align: 'center',
        lineBreak: false,
      });
  }
}

export async function renderConsentPdf({
  event,
  record,
  signaturePng,
}: RenderConsentPdfParams): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE_MARGIN,
      bufferPages: true,
      info: {
        Title: 'Consentimiento Informado',
        Subject: 'CONGENIA consentimiento',
        Author: 'CONGENIA PDF Worker',
        Keywords: `${record.ficha_id},${record.consentimiento_id}`,
      },
    });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    doc.on('error', reject);
    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    drawHeader(doc, record);
    drawDocumentTitle(doc, record);
    drawIntroAndSections(doc);
    drawDeclarations(doc, extractDeclarations(record.firma_evidencia_tecnica));

    const signatureRendered = drawPatientAndSignature(doc, record, signaturePng, reject);
    if (!signatureRendered) return;

    drawAuditBlock(doc, event, record);
    addPageNumbers(doc);

    doc.end();
  });
}
