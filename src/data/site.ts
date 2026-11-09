/** Single source of truth for brand text, navigation, and category slugs.
 *  Every page reads its heading text from here, so a rename is a one-line change. */

export const SITE = {
  name: 'ai.swegrowth.id',
  room: 'community',
  title: 'ai.swegrowth.id: community AI skills',
  description:
    'A community collection of AI skills: practical workflows and notes shared openly.',
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

/** Primary navigation, grouped with dividers in the header. */
export const NAV = [
  [
    { href: '/skill', label: 'AI Skills' },
    { href: '/tools', label: 'AI Tools' },
    { href: '/wanted', label: 'Wanted List', badge: true },
  ],
  [
    { href: '/news', label: 'AI News Digest' },
    { href: '/daily-terms', label: 'SWE Daily Term' },
  ],
  [{ href: '/help', label: 'What is This Web?' }],
];

/** Auth-gated account action shown beside the account menu. */
export const ACCOUNT_ACTION = { href: '/submit', label: 'Post a Skill' };
