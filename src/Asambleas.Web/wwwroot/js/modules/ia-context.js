/** Persist PH / Assembly context across navigation (URL remains source of truth). */
const KEY = "asambleas.ia.context";

export function readIaContext() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

export function writeIaContext(partial = {}) {
  const prev = readIaContext();
  const next = { ...prev, ...partial };
  if (partial.phId === null) delete next.phId;
  if (partial.assemblyId === null) delete next.assemblyId;
  sessionStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function syncIaContextFromUrl(search = location.search) {
  const params = new URLSearchParams(search);
  const partial = {};
  const phId = params.get("phId");
  const assemblyId = params.get("assemblyId");
  if (phId) partial.phId = phId;
  if (assemblyId) partial.assemblyId = assemblyId;
  if (Object.keys(partial).length) writeIaContext(partial);
  return readIaContext();
}
