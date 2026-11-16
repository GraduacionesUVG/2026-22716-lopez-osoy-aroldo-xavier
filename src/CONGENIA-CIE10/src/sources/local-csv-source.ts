import { readCsvFile } from "../csv.js";
import type { Cie10CatalogCsvRow, Cie10ReferenceCsvRow, Cie10TranslatorCsvRow, ClinicalRecordSource } from "../types.js";

export class LocalCsvClinicalRecordSource implements ClinicalRecordSource {
  readonly sourceCatalogUri: string;
  readonly sourceTranslatorUri: string;

  constructor(
    private readonly catalogPath: string,
    private readonly translatorPath: string,
    private readonly referenceCatalogPath: string,
  ) {
    this.sourceCatalogUri = `file://${catalogPath}`;
    this.sourceTranslatorUri = `file://${translatorPath}`;
  }

  readCatalog(): Promise<Cie10CatalogCsvRow[]> {
    return readCsvFile<Cie10CatalogCsvRow>(this.catalogPath);
  }

  readTranslator(): Promise<Cie10TranslatorCsvRow[]> {
    return readCsvFile<Cie10TranslatorCsvRow>(this.translatorPath);
  }

  readReferenceCatalog(): Promise<Cie10ReferenceCsvRow[]> {
    return readCsvFile<Cie10ReferenceCsvRow>(this.referenceCatalogPath);
  }
}
