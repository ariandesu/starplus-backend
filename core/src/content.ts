export interface KbCitation {
  source: string;
  detail?: string;
}

export interface KbEntry {
  id: string;
  version: string;
  title: string;
  text: string[];
  citations: KbCitation[];
  content_hash: string;
}

export interface FormularyEntry {
  id: string;
  name: string;
  purpose: string;
  side_effects: string;
  interactions: string;
  dose: string;
  dose_source?: string;
  citations: KbCitation[];
}

export const FORMULARY_NO_DOSE = "per flight surgeon / mission protocol";

export async function hashText(lines: string[]): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(lines.join("\n")));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function validateKbEntry(
  raw: unknown
): Promise<{ ok: true; entry: KbEntry } | { ok: false; reason: string }> {
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: "entry must be an object" };
  const entry = raw as Record<string, unknown>;
  for (const key of ["id", "version", "title"] as const) {
    if (typeof entry[key] !== "string" || (entry[key] as string).length === 0) {
      return { ok: false, reason: `${key} must be a non-empty string` };
    }
  }
  if (!Array.isArray(entry.text) || entry.text.length === 0 || entry.text.some((line) => typeof line !== "string" || line.length === 0)) {
    return { ok: false, reason: "text must be a non-empty array of non-empty strings" };
  }
  if (!Array.isArray(entry.citations) || entry.citations.length === 0) {
    return { ok: false, reason: "at least one citation is required" };
  }
  for (const citation of entry.citations as Array<Record<string, unknown>>) {
    if (typeof citation?.source !== "string" || citation.source.length === 0) {
      return { ok: false, reason: "every citation needs a source" };
    }
  }
  const expected = await hashText(entry.text as string[]);
  if (entry.content_hash !== expected) {
    return { ok: false, reason: `content_hash mismatch for '${entry.id}'` };
  }
  return { ok: true, entry: raw as KbEntry };
}

export function validateFormularyEntry(
  raw: unknown
): { ok: true } | { ok: false; reason: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: "entry must be an object" };
  const entry = raw as Record<string, unknown>;
  for (const key of ["id", "name", "purpose", "side_effects", "interactions"] as const) {
    if (typeof entry[key] !== "string" || (entry[key] as string).length === 0) {
      return { ok: false, reason: `${key} is required` };
    }
  }
  if (!Array.isArray(entry.citations) || entry.citations.length === 0) {
    return { ok: false, reason: "at least one citation is required" };
  }
  if (entry.dose === FORMULARY_NO_DOSE) return { ok: true };
  if (typeof entry.dose === "string" && typeof entry.dose_source === "string" && (entry.dose_source as string).length > 0) {
    return { ok: true };
  }
  return { ok: false, reason: "a dose needs a quoted word-for-word source" };
}
