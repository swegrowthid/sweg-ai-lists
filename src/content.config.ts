import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/** An entry is either a skill (a SKILL.md package) or a setting (a reusable
 *  prompt / agent config). One collection keeps one list page and one detail route.
 *  `kind` drives every difference in rendering. */
const entries = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/entries' }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    kind: z.enum(['skill', 'setting']),
    /** Must match a slug in src/data/site.ts CATEGORIES. */
    category: z.string(),
    author: z.string(),
    updated: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    /** Moderation state, shown as a chip on the detail page and in /account views. */
    status: z.enum(['draft', 'submitted', 'approved', 'rejected']).default('approved'),
    /** Skill-only: how a reader installs it. */
    install: z.string().optional(),
    /** Setting-only: what consumes the setting, e.g. "claude code" or "omp agent". */
    target: z.string().optional(),
    /** Setting-only: the model the setting was tuned against. */
    model: z.string().optional(),
    /** Evidence. Renders as side-by-side panes on the detail page. */
    examples: z
      .array(z.object({ prompt: z.string(), without: z.string(), with: z.string() }))
      .default([]),
  }),
});

export const collections = { entries };
