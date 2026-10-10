// .lensmith packages (zip: filter.json + assets/) and store submissions.

import JSZip from "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";
import { imagePaths, normalize, requiredAppVersion } from "./model.js";

const ALLOWED = /^assets\/[^/]+\.(png|webp|jpe?g)$/i;
const MAX_FILES = 200;
const MAX_BYTES = 20 * 1024 * 1024;

/** Opens a .lensmith (or a bare filter.json). Returns {filter, assets: Map(path -> Blob)}. */
export async function openFile(file) {
  if (file.name.toLowerCase().endsWith(".json")) {
    return { filter: normalize(JSON.parse(await file.text())), assets: new Map() };
  }
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((e) => !e.dir);
  if (entries.length > MAX_FILES) throw new Error("Too many files in this filter.");
  const manifest = zip.file("filter.json");
  if (!manifest) throw new Error("This isn't a Lensmith filter (no filter.json).");
  const assets = new Map();
  let total = 0;
  for (const e of entries) {
    if (e.name === "filter.json") continue;
    if (!ALLOWED.test(e.name)) throw new Error(`Lensmith doesn't allow this file: ${e.name}`);
    const blob = await e.async("blob");
    total += blob.size;
    if (total > MAX_BYTES) throw new Error("This filter is larger than 20 MB.");
    assets.set(e.name, blob);
  }
  return { filter: normalize(JSON.parse(await manifest.async("string"))), assets };
}

/** Builds a .lensmith package with only the pictures the filter uses. */
export async function saveLensmith(filter, assets) {
  const zip = new JSZip();
  zip.file("filter.json", JSON.stringify({ ...filter, minAppVersion: requiredAppVersion(filter) }, null, 2));
  for (const path of imagePaths(filter)) {
    const blob = assets.get(path);
    if (blob) zip.file(path, blob);
  }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

/**
 * Builds the folder the store expects, zipped:
 *   filters/<github>/<slug>/{filter.json, listing.json, thumbnail.png, assets/...}
 */
export async function buildSubmission({ filter, assets, github, slug, listing, thumbnail }) {
  const zip = new JSZip();
  const dir = zip.folder("filters").folder(github).folder(slug);
  const manifest = { ...filter, id: `${github}.${slug}`, minAppVersion: requiredAppVersion(filter) };
  dir.file("filter.json", JSON.stringify(manifest, null, 2));
  dir.file("listing.json", JSON.stringify(listing, null, 2));
  if (thumbnail) dir.file("thumbnail.png", thumbnail);
  for (const path of imagePaths(filter)) {
    const blob = assets.get(path);
    if (blob) dir.file(path, blob);
  }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
