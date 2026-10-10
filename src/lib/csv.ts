export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  row.push(field);
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

export function safeCsvField(value: unknown) {
  let text = value == null ? "" : String(value);
  if (typeof value === "string" && /^[\s\u0000-\u001f\u007f]*[=+@-]/u.test(text)) text = `'${text}`;
  if (/[",\r\n]/u.test(text)) text = `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function csvRow(values: unknown[]) {
  return values.map(safeCsvField).join(",");
}
