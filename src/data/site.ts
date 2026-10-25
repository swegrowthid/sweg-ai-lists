/** Single source of truth for brand text, navigation, and category slugs.
 *  Every page reads its heading text from here, so a rename is a one-line change. */

export const SITE = {
  name: 'swegai',
  room: 'community',
  title: 'swegai: community AI posts',
  description:
    'A community catalog of AI posts: practical workflows and notes shared openly.',
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

/** Header navigation. `badge: true` marks the entry that gets the accent;
 *  auth-gated links are revealed by the shared client-side session check. */
type HeaderLink = { href: string; label: string; badge?: boolean; auth?: 'in' | 'out' };

export const NAV: {
  explore: HeaderLink[];
  community: HeaderLink[];
  utility: HeaderLink[];
  account: HeaderLink[];
} = {
  explore: [
    { href: '/tools', label: 'AI tools' },
    { href: '/news', label: 'News' },
  ],
  community: [
    { href: '/wanted', label: 'Wanted', badge: true },
    { href: '/search', label: 'Search' },
  ],
  utility: [{ href: '/help', label: 'Help' }],
  account: [{ href: '/submit', label: 'Post Catalog', auth: 'in' as const }],
};
