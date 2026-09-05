function serializeCsvNumber(value: number) {
  return String(value);
}

function needsCsvQuotes(value: string) {
  return /[",\n\r]/.test(value) || value !== value.trim();
}

function escapeCsvField(value: string | number) {
  const text = typeof value === "number" ? serializeCsvNumber(value) : value;

  if (!needsCsvQuotes(text)) {
    return text;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

export function writeCsv(
  rows: Array<Array<string | number>>,
  options?: { bom?: boolean },
) {
  const body = rows.map((row) => row.map(escapeCsvField).join(",")).join("\n");
  return options?.bom === false ? body : `\uFEFF${body}`;
}

export function writeCsvBuffer(
  rows: Array<Array<string | number>>,
  options?: { bom?: boolean },
) {
  return Buffer.from(writeCsv(rows, options), "utf8");
}
