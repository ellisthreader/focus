const paths = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/>',
  calendar: '<rect x="3.5" y="5.5" width="17" height="15" rx="2"/><path d="M8 3v5M16 3v5M3.5 10h17"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16.5 8.5"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M9 2h6M12 5v2M12 13l3-3"/>',
  heart: '<path d="M20.8 5.8c-2.2-2.3-5.8-1.7-7.4.8L12 8.7l-1.4-2.1C9 4.1 5.4 3.5 3.2 5.8.9 8.2 1.1 12 3.6 14.3L12 22l8.4-7.7c2.5-2.3 2.7-6.1.4-8.5Z"/>',
  trend: '<path d="M4 18 10 12l4 4 6-8"/><path d="M15 8h5v5"/>',
  timeline: '<path d="M7 4v16"/><circle cx="7" cy="7" r="2"/><circle cx="7" cy="14" r="2"/><path d="M11 7h9M11 14h7"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3M3 12h18M10 12v2h4v-2"/>',
  wallet: '<path d="M4 6.5h14a2 2 0 0 1 2 2V19H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12"/><path d="M15 11h6v5h-6a2.5 2.5 0 0 1 0-5Z"/>',
  book: '<path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v18H7.5A3.5 3.5 0 0 0 4 23V5.5ZM20 5.5A3.5 3.5 0 0 0 16.5 2H13v18h3.5A3.5 3.5 0 0 1 20 23V5.5Z"/>',
  food: '<path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M16 3v18M16 3c3 2 4 5 4 8h-4"/>',
  activity: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
  scale: '<path d="M5 5h14l2 16H3L5 5Z"/><path d="M9 9a3 3 0 0 1 6 0M12 9l2-2"/>',
  spark: '<path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z"/><path d="m18.5 15 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/>',
  monitor: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M7 11h2l1.5-3 3 6 1.5-3h2"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  minimize: '<path d="M5 12h14"/>',
  maximize: '<rect x="5" y="5" width="14" height="14" rx="1"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  moon: '<path d="M20.5 14.5A7.5 7.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  play: '<path d="m8 5 11 7-11 7V5Z"/>',
  pause: '<path d="M8 5h3v14H8zM14 5h3v14h-3z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
  reset: '<path d="M4 7v5h5M20 17v-5h-5"/><path d="M19 9a8 8 0 0 0-13.5-2L4 9M5 15a8 8 0 0 0 13.5 2L20 15"/>',
  bell: '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8h18c0-1-3-1-3-8ZM10 21h4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'
};

export function icon(name, size = 18, className = "") {
  const body = paths[name] || paths.spark;
  const safeSize = Number.isFinite(Number(size)) ? Number(size) : 18;
  return `<svg class="icon ${className}" width="${safeSize}" height="${safeSize}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
