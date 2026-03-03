import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { ValidationError } from "../../../src/shared/errors";
import { loadSkillsFromDirectory } from "../../../src/skills/skill-loader";
import { createTempWorkspace } from "../../helpers/temp-workspace";

const skillTemplate = (id: string, bindingType = "llm_sentiment") => `---
id: ${id}
name: ${id}
type: sentiment
version: "1.0"
enabled: true
binding:
  type: ${bindingType}
  target: sentiment_assessment
description: test
input:
  schema: in
output:
  schema: out
---

## Description

Test

## Input

Test

## Output

Test

## Usage Rules

Test
`;

describe("skill loader", () => {
  it("rejects duplicate ids and unknown bindings", async () => {
    const workspace = await createTempWorkspace();
    try {
      await mkdir(workspace.path("skills", "sentiment"), { recursive: true });
      await writeFile(workspace.path("skills", "sentiment", "a.md"), skillTemplate("dup"));
      await writeFile(workspace.path("skills", "sentiment", "b.md"), skillTemplate("dup"));

      await expect(
        loadSkillsFromDirectory({
          skillsRootDir: workspace.path("skills"),
          allowedBindingTypes: ["llm_sentiment"],
        }),
      ).rejects.toThrowError(ValidationError);

      await writeFile(workspace.path("skills", "sentiment", "b.md"), skillTemplate("other", "unknown_binding"));
      await expect(
        loadSkillsFromDirectory({
          skillsRootDir: workspace.path("skills"),
          allowedBindingTypes: ["llm_sentiment"],
        }),
      ).rejects.toThrowError(ValidationError);
    } finally {
      await workspace.cleanup();
    }
  });
});
