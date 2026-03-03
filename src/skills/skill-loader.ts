import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { ValidationError } from "../shared/errors";
import type { SkillDefinition } from "../shared/types";
import { readAndParseSkillFile } from "./skill-parser";

async function walkMarkdownFiles(rootDir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string) {
    let entries: Awaited<ReturnType<typeof readdir>>;
    try {
      entries = (await readdir(dir, { withFileTypes: true })) as unknown as Awaited<
        ReturnType<typeof readdir>
      >;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const name = String(entry.name);
      const path = join(dir, name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile() && name.endsWith(".md")) {
        results.push(path);
      }
    }
  }

  await walk(rootDir);
  return results.sort();
}

export async function loadSkillsFromDirectory(input: {
  skillsRootDir: string;
  allowedBindingTypes?: Iterable<string>;
}): Promise<SkillDefinition[]> {
  const files = await walkMarkdownFiles(input.skillsRootDir);
  const skills = await Promise.all(files.map((filePath) => readAndParseSkillFile(filePath)));

  const seenIds = new Set<string>();
  const allowed = input.allowedBindingTypes ? new Set(input.allowedBindingTypes) : undefined;

  for (const skill of skills) {
    if (seenIds.has(skill.id)) {
      throw new ValidationError("Duplicate skill id", [skill.id]);
    }
    seenIds.add(skill.id);

    if (allowed && !allowed.has(skill.bindingType)) {
      throw new ValidationError("Unknown binding.type in skill file", [
        `${skill.id}: ${skill.bindingType}`,
      ]);
    }
  }

  return skills;
}
