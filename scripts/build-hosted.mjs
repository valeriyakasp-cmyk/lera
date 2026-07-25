/**
 * Folds BizFlow into one self-contained HTML file for hosting on the web,
 * so the app can be opened from a phone without a dev server or a build.
 *
 * The design is untouched: same markup, same styles, same runtime. The only
 * change is where resources come from — React and the Assistant typeface are
 * inlined rather than fetched, because a hosted page may be served under a
 * policy that blocks outside requests, and the app must boot with no network.
 *
 * Usage: node scripts/build-hosted.mjs [outfile]
 * Default outfile: dist-web/bizflow.html
 */

import { Buffer } from "node:buffer";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, process.argv[2] ?? "dist-web/bizflow.html");

const read = (p) => readFile(resolve(root, p), "utf8");

const html = await read("assets/bizflow/BizFlow.html");

// The page is published inside an existing <html><head></head><body>, so only
// the body's contents may be emitted.
const body = /<body>([\s\S]*)<\/body>/.exec(html);
if (!body) throw new Error("could not locate <body> in BizFlow.html");

// The Google Fonts stylesheet is dropped rather than left to fail: the same
// family is embedded below.
let markup = body[1];
const fontLink = /<link href="https:\/\/fonts\.googleapis\.com\/css2[^"]*"[^>]*>\s*/g;
const linkCount = (markup.match(fontLink) ?? []).length;
if (linkCount !== 1) throw new Error(`expected 1 Google Fonts link, found ${linkCount}`);
markup = markup.replace(fontLink, "");

// Assistant, the family the design is built on, as data URIs.
const weights = [
  ["400", "400Regular", "Assistant_400Regular.ttf"],
  ["500", "500Medium", "Assistant_500Medium.ttf"],
  ["600", "600SemiBold", "Assistant_600SemiBold.ttf"],
  ["700", "700Bold", "Assistant_700Bold.ttf"],
];

const faces = await Promise.all(
  weights.map(async ([weight, folder, file]) => {
    const ttf = await readFile(
      resolve(root, "node_modules/@expo-google-fonts/assistant", folder, file),
    );
    return (
      `@font-face{font-family:'Assistant';font-style:normal;font-weight:${weight};` +
      `font-display:swap;src:url(data:font/ttf;base64,${Buffer.from(ttf).toString("base64")})` +
      ` format('truetype')}`
    );
  }),
);

const [react, reactDom, support] = await Promise.all([
  read("assets/bizflow/vendor/react.txt"),
  read("assets/bizflow/vendor/react-dom.txt"),
  read("assets/bizflow/support.txt"),
]);

for (const [name, blob] of [["react", react], ["react-dom", reactDom], ["support", support]]) {
  if (/<\/script/i.test(blob)) throw new Error(`${name} would terminate its script tag early`);
}

// Defining React up front makes the runtime's loadReactUmd() resolve
// immediately, so it never reaches for a CDN. Declaring __resources, even
// empty, stops it re-fetching the document to recover its own template.
const preamble =
  "(function(){var m=document.querySelector('meta[name=viewport]');" +
  "if(!m){m=document.createElement('meta');m.name='viewport';document.head.appendChild(m);}" +
  "m.content='width=device-width, initial-scale=1, viewport-fit=cover';" +
  "document.documentElement.lang='he';window.__resources={};})();";

const page = [
  "<style>",
  faces.join(""),
  "html,body{margin:0;padding:0;height:100%;background:#EDF0F6}",
  "</style>",
  "<script>", preamble, "</script>",
  "<script>", react, "</script>",
  "<script>", reactDom, "</script>",
  "<script>", support, "</script>",
  markup,
].join("\n");

await mkdir(dirname(out), { recursive: true });
await writeFile(out, page, "utf8");

console.log(`wrote ${out} (${Math.round(page.length / 1024)} KB)`);
