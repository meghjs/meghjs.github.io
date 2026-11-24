// Docs for coding agents, following https://llmstxt.org:
// - /llms.txt: an index of every page, with its one-line description
// - /llms-full.txt: every page in one file
// - /<page>.md: each page as plain markdown, beside its HTML
import fs from 'node:fs';
import path from 'node:path';

export const SITE = 'https://meghjs.github.io';

type SidebarItem = { text?: string; link?: string; items?: SidebarItem[] };
type Page = { link: string; file: string; title: string; description: string; body: string };

/** `/cli/scaffold/` → `cli/scaffold/index.md`, `/advanced/orm` → `advanced/orm.md`. */
function fileFor(link: string): string {
  const rel = link.replace(/^\//, '').replace(/#.*$/, '');
  return rel === '' || rel.endsWith('/') ? `${rel}index.md` : `${rel}.md`;
}

/** Split frontmatter `title` / `description` from the body. */
function readPage(srcDir: string, file: string, fallbackTitle: string): Omit<Page, 'link' | 'file'> {
  const raw = fs.readFileSync(path.join(srcDir, file), 'utf8').replace(/\r\n/g, '\n');
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const field = (key: string) =>
    fm?.[1].match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))?.[1].trim().replace(/^(['"])(.*)\1$/, '$2');
  const body = (fm ? raw.slice(fm[0].length) : raw).trim();
  const heading = body.match(/^#\s+(.+)$/m)?.[1].trim();
  return { title: field('title') || heading || fallbackTitle, description: field('description') ?? '', body };
}

function flatten(items: SidebarItem[]): { text: string; link: string }[] {
  return items.flatMap((i) => [
    ...(i.link ? [{ text: i.text ?? i.link, link: i.link }] : []),
    ...flatten(i.items ?? []),
  ]);
}

/** Every page: sidebar sections first, in order, then pages the sidebar leaves out. */
export function collectPages(sidebar: SidebarItem[], srcDir: string) {
  const seen = new Set<string>();
  const sections: { title: string; pages: Page[] }[] = [];
  const page = (link: string, text: string): Page | undefined => {
    const file = fileFor(link);
    if (seen.has(file) || !fs.existsSync(path.join(srcDir, file))) return undefined;
    seen.add(file);
    return { link, file, ...readPage(srcDir, file, text) };
  };

  for (const group of sidebar) {
    const pages = flatten(group.items ?? []).map((i) => page(i.link, i.text)).filter((p): p is Page => !!p);
    if (pages.length) sections.push({ title: group.text ?? 'Docs', pages });
  }

  const rest: Page[] = [];
  for (const entry of fs.readdirSync(srcDir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const file = path
      .relative(srcDir, path.join((entry as any).parentPath ?? (entry as any).path, entry.name))
      .split(path.sep)
      .join('/');
    if (file === 'index.md' || file.startsWith('public/')) continue;
    const link = '/' + file.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '');
    const p = page(link, link);
    if (p) rest.push(p);
  }
  rest.sort((a, b) => a.file.localeCompare(b.file));
  return { sections, optional: rest };
}

const mdUrl = (p: Page) => `${SITE}/${p.file}`;

export function renderLlmsTxt(sidebar: SidebarItem[], srcDir: string, summary: string): string {
  const { sections, optional } = collectPages(sidebar, srcDir);
  const entry = (p: Page) => `- [${p.title}](${mdUrl(p)})${p.description ? `: ${p.description}` : ''}`;
  const out = [
    '# Megh',
    '',
    `> ${summary}`,
    '',
    'Each link is the page as markdown; drop `.md` for the HTML page. ' +
      `Every page in one file: ${SITE}/llms-full.txt. ` +
      'For version-matched docs and project tools inside an editor, use the Megh MCP server: `npx -y @meghjs/mcp`.',
    '',
  ];
  for (const s of sections) out.push(`## ${s.title}`, '', ...s.pages.map(entry), '');
  if (optional.length) out.push('## Optional', '', ...optional.map(entry), '');
  return out.join('\n');
}

export function renderLlmsFullTxt(sidebar: SidebarItem[], srcDir: string, summary: string): string {
  const { sections, optional } = collectPages(sidebar, srcDir);
  const pages = [...sections.flatMap((s) => s.pages), ...optional];
  const head = `# Megh\n\n> ${summary}\n\nSource: ${SITE}\n`;
  return [
    head,
    ...pages.map((p) => {
      // Pages start with their own `# Title`; keep it, and say where it lives.
      const body = /^#\s/.test(p.body) ? p.body : `# ${p.title}\n\n${p.body}`;
      return `${body.replace(/^(#\s.+)$/m, `$1\n\nSource: ${SITE}${p.link}`)}\n`;
    }),
  ].join('\n---\n\n');
}

/** Write llms.txt, llms-full.txt and a .md copy of each page into the built site. */
export function writeLlmsFiles(opts: { sidebar: SidebarItem[]; srcDir: string; outDir: string; summary: string }) {
  const { sidebar, srcDir, outDir, summary } = opts;
  fs.writeFileSync(path.join(outDir, 'llms.txt'), renderLlmsTxt(sidebar, srcDir, summary));
  fs.writeFileSync(path.join(outDir, 'llms-full.txt'), renderLlmsFullTxt(sidebar, srcDir, summary));
  const { sections, optional } = collectPages(sidebar, srcDir);
  for (const p of [...sections.flatMap((s) => s.pages), ...optional]) {
    const dest = path.join(outDir, p.file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, `# ${p.title}\n\n${p.description ? `> ${p.description}\n\n` : ''}${p.body.replace(/^#\s.+\n+/, '')}\n`);
  }
}
