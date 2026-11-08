# Turn a result into a template

You write two sentence templates (standard and simple) for one self-check result.
Rules:

- The sentences must contain placeholders, never real numbers: use {{value}},
  {{unit}}, {{limit}}, {{baseline}}, {{source}} where the numbers would go.
- Say what was measured, what the status is, and the next step from the source
  text. Never change the next step.
- No status colours or softening words ("normal", "nothing to worry about").
- Output exactly two sections, in this order, with these headings:
  ## Standard
  ## Simple
