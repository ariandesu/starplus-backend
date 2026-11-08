const NUMBER_RE = /\d+(?:\.\d+)?/g;

const UNIT_WORDS = [
  "bpm",
  "mmhg",
  "mm hg",
  "%",
  "percent",
  "°c",
  "celsius",
  "fahrenheit",
  "°f",
  "/min",
  "mg/dl",
  "mg",
  "mcg",
  "ml",
  "units?",
  "tablets?",
  "capsules?",
  "doses?",
  "kg",
  "lb",
  "lbs",
  "pound",
  "litre",
  "liter",
  "kcal",
  "msv",
  "ms",
  "hours",
  "hour",
  "minutes",
  "minute",
  "seconds",
  "second",
  "days",
  "day",
];
const ROUTE_WORDS = ["oral", "orally", "injection", "inject", "intravenous", "topical", "inhaled", "sublingual"];
const TIME_WORDS = ["daily", "twice", "morning", "evening", "night", "hourly", "weekly", "before meals", "after meals"];
const SOFTENING = [
  "normal",
  "nothing to worry about",
  "do not worry",
  "don't worry",
  "fine",
  "all clear",
  "no need to",
  "reassuring",
];

function escapeRegExp(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWord(haystack: string, word: string): boolean {
  return new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").test(haystack);
}

function extractNumbers(text: string): string[] {
  return text.match(NUMBER_RE) ?? [];
}

function normalizeNumber(raw: string): string {
  return String(Number.parseFloat(raw));
}

export function filterExplanation(text: string, sourceText: string): string[] {
  const problems: string[] = [];
  const sourceNumbers = new Set(extractNumbers(sourceText).map(normalizeNumber));
  for (const raw of extractNumbers(text)) {
    if (!sourceNumbers.has(normalizeNumber(raw))) {
      problems.push(`contains number '${raw}' not present in the source entry`);
    }
  }
  for (const word of [...UNIT_WORDS, ...ROUTE_WORDS, ...TIME_WORDS]) {
    if (containsWord(text, word) && !containsWord(sourceText, word)) {
      problems.push(`contains '${word}' not present in the source entry`);
    }
  }
  for (const phrase of SOFTENING) {
    if (containsWord(text, phrase)) problems.push(`softens the result: '${phrase}'`);
  }
  return problems;
}
