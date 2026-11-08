export interface ExplanationTemplate {
  id: string;
  entry_id: string;
  level: "standard" | "simple";
  text: string;
}

const PLACEHOLDER = /\{\{([a-z_]+)\}\}/g;

export function templateVariables(text: string): string[] {
  const names = new Set<string>();
  let match: RegExpExecArray | null;
  PLACEHOLDER.lastIndex = 0;
  while ((match = PLACEHOLDER.exec(text)) !== null) names.add(match[1]);
  return [...names];
}

export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(PLACEHOLDER, (_whole, name: string) => {
    if (!(name in values)) throw new Error(`missing template value '${name}'`);
    return String(values[name]);
  });
}
