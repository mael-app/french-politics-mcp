/**
 * Text extraction from an HTML page.
 *
 * Online manifestos are not PDFs: editorial content has to be separated from the
 * template, otherwise every page injects the same navigation lines into the
 * corpus, the HTML counterpart of running headers in PDFs.
 *
 * Headings and blocks are emitted on separate lines with a blank line after a
 * heading, which is the signal normalize.ts uses to cut sections.
 */
import { type HTMLElement, parse } from "node-html-parser";

/** Elements that never carry editorial content. */
const DROP_SELECTORS = [
  "script", "style", "noscript", "svg", "iframe", "form", "button",
  "nav", "header", "footer", "aside",
  "[role=navigation]", "[role=banner]", "[role=contentinfo]",
  ".menu", ".nav", ".navbar", ".navigation", ".breadcrumb", ".sidebar",
  ".footer", ".header", ".cookie", ".cookies", ".newsletter", ".share",
  ".social", ".partage", ".skip-link", ".screen-reader-text",
  // Embedded social posts are campaign messages, not programmatic text.
  "blockquote.twitter-tweet", ".twitter-tweet", ".instagram-media", ".fb-post",
  ".wp-block-embed", "figure.wp-block-embed",
];

/**
 * Lines dropped case by case once a block is isolated: leftovers of social embeds,
 * and the bookshop cross-promotion some sites repeat on every page, which would
 * otherwise land inside quotes.
 */
const LINE_NOISE: RegExp[] = [
  /\b(?:pic\.twitter\.com|t\.co)\/\S+/,
  /^Retrouvez ce passage à la page \d+ du livre-programme/i,
  /^Vous pouvez aussi l['’]obtenir dans des magasins/i,
  /^\*?\s*dans l['’]édition de .{0,40}ISBN/i,
];

const isNoise = (text: string) => LINE_NOISE.some((pattern) => pattern.test(text));

/** Candidate content containers, most specific first. */
const CONTENT_SELECTORS = [
  "main article",
  "article",
  "main",
  "[role=main]",
  ".entry-content",
  ".post-content",
  ".page-content",
  ".content",
  "#content",
];

const BLOCK_TAGS = new Set([
  "H1", "H2", "H3", "H4", "H5", "H6",
  "P", "LI", "BLOCKQUOTE", "DT", "DD", "TD", "TH", "FIGCAPTION", "PRE",
]);

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;|&#8217;/g, "'")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&hellip;/g, "…")
    .replace(/&(?:ndash|mdash);/g, "–")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

/** Walks the tree emitting one line per block, without flattening nesting. */
function collectBlocks(node: HTMLElement, lines: string[]): void {
  for (const child of node.childNodes) {
    const element = child as HTMLElement;
    if (!element.tagName) continue;

    const hasBlockDescendant = BLOCK_TAGS.has(element.tagName)
      ? [...BLOCK_TAGS].some((tag) => element.querySelector(tag.toLowerCase()) !== null)
      : false;

    if (BLOCK_TAGS.has(element.tagName) && !hasBlockDescendant) {
      const text = decodeEntities(element.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text && !isNoise(text)) {
        lines.push(text);
        // A heading opens a section; the blank line isolates it from what follows.
        if (/^H[1-6]$/.test(element.tagName)) lines.push("");
      }
      continue;
    }
    collectBlocks(element, lines);
  }
}

export interface HtmlExtraction {
  /** Page title, useful for naming the document. */
  title: string;
  text: string;
}

/** Extracts the editorial text of an HTML page, template stripped. */
export function htmlToText(html: string): HtmlExtraction {
  const root = parse(html, { blockTextElements: { script: false, style: false } });

  for (const selector of DROP_SELECTORS) {
    for (const element of root.querySelectorAll(selector)) element.remove();
  }

  const title = decodeEntities(root.querySelector("title")?.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim();

  const container =
    CONTENT_SELECTORS.map((selector) => root.querySelector(selector)).find(
      (found) => found && (found.textContent ?? "").trim().length > 400,
    ) ?? root.querySelector("body") ?? root;

  const lines: string[] = [];
  collectBlocks(container, lines);

  // Collapse consecutive blank lines introduced by headings.
  const text = lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { title, text };
}
