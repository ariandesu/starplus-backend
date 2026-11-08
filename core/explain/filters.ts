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
  "nothing to worry about",
  "do not worry",
  "don't worry",
  "all clear",
  "no need to",
  "reassuring",
];
const SOFTENING_UNLESS_IN_SOURCE = ["normal", "fine"];
const MUST_KEEP = ["normal", "normally", "at least", "no sooner than", "only if", "never", "do not", "at once"];

function escapeRegExp(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWord(haystack: string, word: string): boolean {
  return new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").test(haystack);
}

const MAX_GAP_WORDS = 3;
const SENTENCE_END = /[.!;]/;

function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

function countOccurrences(haystack: string, phrase: string): number {
  const words = phrase.split(/\s+/);
  if (words.length === 1) {
    const matches = haystack.match(new RegExp(`\\b${escapeRegExp(words[0])}\\b`, "gi"));
    return matches === null ? 0 : matches.length;
  }
  let count = 0;
  for (const sentence of haystack.split(SENTENCE_END)) {
    let from = 0;
    for (;;) {
      const firstRe = new RegExp(`\\b${escapeRegExp(words[0])}\\b`, "gi");
      firstRe.lastIndex = from;
      const first = firstRe.exec(sentence);
      if (first === null) break;
      let pos = first.index + first[0].length;
      let matched = true;
      for (let index = 1; index < words.length; index += 1) {
        const re = new RegExp(`\\b${escapeRegExp(words[index])}\\b`, "gi");
        re.lastIndex = pos;
        const found = re.exec(sentence);
        if (found === null || countWords(sentence.slice(pos, found.index)) > MAX_GAP_WORDS) {
          matched = false;
          break;
        }
        pos = found.index + found[0].length;
      }
      if (matched) {
        count += 1;
        from = pos;
      } else {
        from = first.index + first[0].length;
      }
    }
  }
  return count;
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
  for (const phrase of MUST_KEEP) {
    const sourceCount = countOccurrences(sourceText, phrase);
    if (sourceCount > 0 && countOccurrences(text, phrase) < sourceCount) {
      problems.push(`drops '${phrase}' from the source entry`);
    }
  }
  for (const phrase of SOFTENING) {
    if (containsWord(text, phrase)) problems.push(`softens the result: '${phrase}'`);
  }
  for (const word of SOFTENING_UNLESS_IN_SOURCE) {
    if (!containsWord(sourceText, word) && containsWord(text, word)) {
      problems.push(`softens the result: '${word}'`);
    }
  }
  return problems;
}
