import { createReadStream, ReadStream } from "node:fs";
import { Readable } from "node:stream";
import csvParser from "csv-parser";

export function readCsvStream<T extends object>(stream: Readable): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const rows: T[] = [];
    stream
      .pipe(
        csvParser({
          mapHeaders: ({ header }) => header.replace(/^\uFEFF/, "").trim().replace(/^"|"$/g, ""),
          mapValues: ({ value }) => (typeof value === "string" ? value.trim() : value),
        }),
      )
      .on("data", (row: T) => rows.push(row))
      .on("error", reject)
      .on("end", () => resolve(rows));
  });
}

export function readCsvFile<T extends object>(filePath: string): Promise<T[]> {
  return readCsvStream<T>(createReadStream(filePath) as ReadStream);
}
