/**
 * Tabler Icons (MIT) as inline SVG. One family, stroke 2, 24×24 viewBox.
 */
const PATHS = {
  building: `<path d="M3 21l18 0"/><path d="M9 8l1 0"/><path d="M9 12l1 0"/><path d="M9 16l1 0"/><path d="M14 8l1 0"/><path d="M14 12l1 0"/><path d="M14 16l1 0"/><path d="M5 21V7l7-4 7 4v14"/>`,
  calendar: `<path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M4 11h16"/><path d="M8 15h2v2H8z"/>`,
  archive: `<path d="M3 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4z"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/>`,
  layoutGrid: `<path d="M4 4h6v6H4z"/><path d="M14 4h6v6h-6z"/><path d="M4 14h6v6H4z"/><path d="M14 14h6v6h-6z"/>`,
  users: `<path d="M9 7a4 4 0 1 0 8 0a4 4 0 0 0-8 0"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.85"/>`,
  settings: `<path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37c1 .608 2.296.07 2.572-1.065z"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0-6 0"/>`,
  layoutDashboard: `<path d="M4 4h6v8H4z"/><path d="M14 4h6v5h-6z"/><path d="M14 13h6v7h-6z"/><path d="M4 16h6v4H4z"/>`,
  microphone: `<path d="M9 5a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0z"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M8 21h8"/><path d="M12 17v4"/>`,
  percentage: `<path d="M17 17 7 7"/><path d="M7 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M17 20a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>`,
  fileImport: `<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 13V5a2 2 0 0 1 2-2h7l5 5v2"/><path d="M8 16h8"/><path d="M8 13l3 3-3 3"/>`,
  checklist: `<path d="M9.5 11 11 12.5l3.5-4.5"/><path d="M9.5 17 11 18.5l3.5-4.5"/><path d="M5 7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/>`,
  mail: `<path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="m3 7 9 6 9-6"/>`,
  folder: `<path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>`,
  files: `<path d="M15 3v4a1 1 0 0 0 1 1h4"/><path d="M18 17h-7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4l5 5v7a2 2 0 0 1-2 2z"/><path d="M16 17v2a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2"/>`
};

export function iconSvg(name, size = 20) {
  const inner = PATHS[name] || PATHS.building;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

export function emptyIllustration(name, title, copy) {
  return `<div class="empty">
    <div class="empty-icon">${iconSvg(name, 28)}</div>
    <p class="empty-title">${title}</p>
    ${copy ? `<p class="empty-subtitle text-secondary">${copy}</p>` : ""}
  </div>`;
}
