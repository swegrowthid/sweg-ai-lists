/** Single source of truth for brand text, navigation, and category slugs.
 *  Every page reads its heading text from here, so a rename is a one-line change. */

export const SITE = {
  name: 'swegai',
  room: 'community',
  title: 'swegai: AI skills & settings for the community',
  description:
    'A community catalog of AI skills and settings. Each skill is a SKILL.md package that teaches an agent a job. Each setting is a reusable system prompt or agent config.',
};

/** Category slugs double as the `/s/<slug>` route segment. The name is what renders. */
export const CATEGORIES = [
  { slug: 'coding', name: 'coding & dev tools' },
  { slug: 'writing', name: 'writing & editing' },
  { slug: 'research', name: 'research & analysis' },
  { slug: 'prompts', name: 'system prompts' },
  { slug: 'agents', name: 'agent configs' },
  { slug: 'mcp', name: 'mcp & tools' },
  { slug: 'models', name: 'model presets' },
  { slug: 'ops', name: 'team & ops' },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]['slug'];

/** Static slug -> display name lookup. Call sites do `CATEGORY_NAME[slug] ?? slug`
 *  so a typo in an entry's `category` stays visible instead of rendering blank. */
export const CATEGORY_NAME: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.slug, c.name]),
);

/** Front nav. `badge: true` marks the entry that gets the red accent. */
export const NAV: { href: string; label: string; badge?: boolean }[] = [
  { href: '/submit', label: 'post an entry' },
  { href: '/wanted', label: 'wanted', badge: true },
  { href: '/search', label: 'search' },
  { href: '/help', label: 'how it works' },
];
