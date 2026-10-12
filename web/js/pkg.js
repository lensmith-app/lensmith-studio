// .lensmith packages (zip: filter.json + assets/) and store submissions.

import JSZip from "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";
import { imagePaths, normalize, requiredAppVersion, scriptAssets, SCRIPT_FILE } from "./model.js";

const ALLOWED = /^assets\/[^/]+\.(png|webp|jpe?g|ogg|mp3|wav|m4a|glb)$/i; // plus filter.json and script.js
const MAX_FILES = 200;
const MAX_BYTES = 20 * 1024 * 1024;

/** Opens a .lensmith (or a bare filter.json). Returns {filter, assets: Map(path -> Blob), script}. */
export async function openFile(file) {
  if (file.name.toLowerCase().endsWith(".json")) {
    return { filter: normalize(JSON.parse(await file.text())), assets: new Map(), script: "" };
  }
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((e) => !e.dir);
  if (entries.length > MAX_FILES) throw new Error("Too many files in this filter.");
  const manifest = zip.file("filter.json");
  if (!manifest) throw new Error("This isn't a Lensmith filter (no filter.json).");
  const assets = new Map();
  let total = 0;
  let script = "";
  let thumbnail = null;
  for (const e of entries) {
    if (e.name === "filter.json") continue;
    if (e.name === SCRIPT_FILE) { script = await e.async("string"); continue; }
    if (/^thumbnail\.(png|jpg|webp)$/.test(e.name)) { thumbnail = await e.async("blob"); continue; }
    if (!ALLOWED.test(e.name)) throw new Error(`Lensmith doesn't allow this file: ${e.name}`);
    const blob = await e.async("blob");
    total += blob.size;
    if (total > MAX_BYTES) throw new Error("This filter is larger than 20 MB.");
    assets.set(e.name, blob);
  }
  return { filter: normalize(JSON.parse(await manifest.async("string"))), assets, script, thumbnail };
}

/** Apps before 0.7.0 refuse packages with a thumbnail inside. */
const THUMBNAIL_APP_VERSION = 7;

/** Builds a .lensmith package with only the pictures the filter uses. */
export async function saveLensmith(filter, assets, script = "", thumbnail = null) {
  const zip = new JSZip();
  const minAppVersion = thumbnail ? Math.max(requiredAppVersion(filter, script), THUMBNAIL_APP_VERSION) : requiredAppVersion(filter, script);
  zip.file("filter.json", JSON.stringify({ ...filter, minAppVersion }, null, 2));
  if (thumbnail) zip.file("thumbnail.png", thumbnail);
  if (filter.script) zip.file(SCRIPT_FILE, script);
  for (const path of usedAssets(filter, script)) {
    const blob = assets.get(path);
    if (blob) zip.file(path, blob);
  }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

/**
 * Builds the folder the store expects, zipped:
 *   filters/<github>/<slug>/{filter.json, listing.json, thumbnail.png, assets/...}
 */
export async function buildSubmission({ filter, assets, github, slug, listing, thumbnail, script = "" }) {
  const zip = new JSZip();
  const dir = zip.folder("filters").folder(github).folder(slug);
  const manifest = { ...filter, id: `${github}.${slug}`, minAppVersion: requiredAppVersion(filter, script) };
  dir.file("filter.json", JSON.stringify(manifest, null, 2));
  dir.file("listing.json", JSON.stringify(listing, null, 2));
  if (thumbnail) dir.file("thumbnail.png", thumbnail);
  if (filter.script) dir.file(SCRIPT_FILE, script);
  for (const path of usedAssets(filter, script)) {
    const blob = assets.get(path);
    if (blob) dir.file(path, blob);
  }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

/** Pictures used by stickers/rules/games, plus any the script names. */
function usedAssets(filter, script) {
  return [...new Set([...imagePaths(filter), ...(filter.script ? scriptAssets(script) : [])])];
}

export function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
