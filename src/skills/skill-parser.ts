import matter from "gray-matter";
import { readFile } from "node:fs/promises";

import { ValidationError } from "../shared/errors";
import type { SkillDefinition } from "../shared/types";

function sectionMap(markdown: string): Map<string, string> {
  const lines = markdown.split(/\r?\n/);
  const sections = new Map<string, string>();
  let currentHeading: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentHeading) {
      sections.set(currentHeading, buffer.join("\n").trim());
    }
    buffer = [];
  };

  for (const line of lines) {
    const headingMatch = /^##\s+(.+?)\s*$/.exec(line.trim());
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1] ?? null;
      continue;
    }
    if (currentHeading) {
      buffer.push(line);
    }
  }
  flush();

  return sections;
}

function asString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`Invalid skill front matter field: ${fieldName}`, [
      `${fieldName} must be a non-empty string`,
    ]);
  }
  return value.trim();
}

function asBooleanWithDefault(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  if (typeof value !== "boolean") {
    throw new ValidationError("Invalid skill front matter field: enabled", [
      "enabled must be a boolean",
    ]);
  }
  return value;
}

export function parseSkillMarkdown(markdown: string, filePath = "unknown"): SkillDefinition {
  const parsed = matter(markdown);
  if (!parsed.data || Object.keys(parsed.data).length === 0) {
    throw new ValidationError("Skill file missing YAML front matter", [filePath]);
  }

  const sections = sectionMap(parsed.content);
  const requiredHeadings = ["Description", "Input", "Output", "Usage Rules"] as const;
  for (const heading of requiredHeadings) {
    if (!sections.has(heading)) {
      throw new ValidationError("Skill file missing required Markdown sections", [
        `${filePath}: missing ## ${heading}`,
      ]);
    }
  }

  const binding = parsed.data.binding as Record<string, unknown> | undefined;
  const input = parsed.data.input as Record<string, unknown> | undefined;
  const output = parsed.data.output as Record<string, unknown> | undefined;

  if (!binding || typeof binding !== "object") {
    throw new ValidationError("Skill file missing binding config", [`${filePath}: binding is required`]);
  }
  if (!input || typeof input !== "object") {
    throw new ValidationError("Skill file missing input config", [`${filePath}: input is required`]);
  }
  if (!output || typeof output !== "object") {
    throw new ValidationError("Skill file missing output config", [`${filePath}: output is required`]);
  }

  return {
    id: asString(parsed.data.id, "id"),
    name: asString(parsed.data.name, "name"),
    type: asString(parsed.data.type, "type"),
    version: asString(parsed.data.version, "version"),
    enabled: asBooleanWithDefault(parsed.data.enabled, true),
    bindingType: asString(binding.type, "binding.type"),
    bindingTarget: asString(binding.target, "binding.target"),
    description: asString(parsed.data.description, "description"),
    inputSchema: asString(input.schema, "input.schema"),
    outputSchema: asString(output.schema, "output.schema"),
    descriptionSection: sections.get("Description")!,
    inputSection: sections.get("Input")!,
    outputSection: sections.get("Output")!,
    usageRulesSection: sections.get("Usage Rules")!,
    filePath,
  };
}

export async function readAndParseSkillFile(filePath: string): Promise<SkillDefinition> {
  const markdown = await readFile(filePath, "utf8");
  return parseSkillMarkdown(markdown, filePath);
}
