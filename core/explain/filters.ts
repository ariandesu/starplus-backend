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
  "mmol/l",
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
const DOSE_WORDS = ["dose", "doses", "dosing", "tablet", "tablets", "capsule", "pill", "mg", "mcg", "ml", "units"];
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

function containsWord(haystack: string, word: string): boolean {
  return haystack.toLowerCase().includes(word.toLowerCase());
}

export function filterExplanation(text: string, sourceText: string): string[] {
  const problems: string[] = [];
  if (/\d/.test(text) && !/\d/.test(sourceText)) {
    problems.push("contains a number not present in the source entry");
  }
  for (const word of [...UNIT_WORDS, ...DOSE_WORDS, ...ROUTE_WORDS, ...TIME_WORDS]) {
    if (containsWord(text, word) && !containsWord(sourceText, word)) {
      problems.push(`contains '${word}' not present in the source entry`);
    }
  }
  for (const phrase of SOFTENING) {
    if (containsWord(text, phrase)) problems.push(`softens the result: '${phrase}'`);
  }
  return problems;
}
