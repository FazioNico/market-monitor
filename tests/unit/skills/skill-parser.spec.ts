import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ValidationError } from "../../../src/shared/errors";
import { parseSkillMarkdown } from "../../../src/skills/skill-parser";

describe("skill parser", () => {
  it("parses YAML front matter and required markdown sections", async () => {
    const markdown = await readFile(join(process.cwd(), "tests", "fixtures", "skills", "valid-skill.md"), "utf8");
    const skill = parseSkillMarkdown(markdown, "tests/fixtures/skills/valid-skill.md");

    expect(skill.id).toBe("sentiment-news-price-coherence-v1");
    expect(skill.bindingType).toBe("llm_sentiment");
    expect(skill.descriptionSection.length).toBeGreaterThan(0);
    expect(skill.usageRulesSection.length).toBeGreaterThan(0);
  });

  it("rejects missing required sections", () => {
    const markdown = `---
id: x
name: X
type: sentiment
version: "1"
binding:
  type: llm_sentiment
  target: sentiment_assessment
description: x
input:
  schema: in
output:
  schema: out
---

## Description

A

## Input

B

## Output

C
`;

    expect(() => parseSkillMarkdown(markdown, "broken.md")).toThrowError(ValidationError);
  });
});
