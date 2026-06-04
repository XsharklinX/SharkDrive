const releaseApi = "https://api.github.com/repos/XsharklinX/SharkDrive/releases/latest";
const releasesUrl = "https://github.com/XsharklinX/SharkDrive/releases";

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
};

const formatDate = (isoDate) =>
  new Intl.DateTimeFormat("es-DO", { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(isoDate));

const setText = (selector, text) =>
  document.querySelectorAll(selector).forEach((el) => { el.textContent = text; });

const applyReleaseFallback = () => {
  document.querySelectorAll("[data-download-link]").forEach((link) => {
    link.href = releasesUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
  });
  setText("[data-download-label]", "Ver descargas disponibles");
  setText("[data-release-status]", "La primera release pública aún no está disponible. Consulta GitHub Releases.");
  setText("[data-release-version]", "Release pendiente");
  setText("[data-release-meta]", "Publica una release en GitHub para habilitar la descarga directa automáticamente.");
};

const loadLatestRelease = async () => {
  try {
    const res = await fetch(releaseApi, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const release = await res.json();
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const asset =
      assets.find((a) => a.name.toLowerCase().endsWith("-setup.exe")) ??
      assets.find((a) => a.name.toLowerCase().endsWith(".msi")) ??
      assets.find((a) => a.name.toLowerCase().endsWith(".exe"));
    const link = asset?.browser_download_url ?? release.html_url ?? releasesUrl;
    const version = release.tag_name || release.name || "Última release";
    const meta = [
      asset ? formatBytes(asset.size) : "",
      release.published_at ? formatDate(release.published_at) : "",
    ]
      .filter(Boolean)
      .join(" · ");

    document.querySelectorAll("[data-download-link]").forEach((el) => {
      el.href = link;
      el.target = "_blank";
      el.rel = "noreferrer";
    });
    setText("[data-download-label]", asset ? `Descargar ${version}` : "Ver última release");
    setText("[data-release-status]", asset ? `${version} disponible para descargar.` : `${version} publicada en GitHub.`);
    setText("[data-release-version]", version);
    setText("[data-release-meta]", meta || "Disponible desde GitHub Releases.");
  } catch {
    applyReleaseFallback();
  }
};

// ── Capability tabs data ──────────────────────────────────────────────────────

const capabilities = {
  explore: {
    kicker: "Explorador de archivos",
    title: "Navega, busca y revisa tu contenido.",
    description:
      "Carpetas anidadas, vistas grid, lista y galería. Localiza cualquier archivo por nombre, tipo, tamaño, etiqueta o fecha — incluso por su contenido de texto.",
    items: [
      "Búsqueda global con filtros discretos y búsqueda en el contenido de archivos",
      "Previsualización de imágenes, video, audio, PDF y SVG sin salir de la app",
      "Historial de versiones por archivo, detección de duplicados y notas rápidas",
    ],
    visual: [
      "Buscar archivos y carpetas",
      "Proyectos",
      "12 archivos · Sincronizado",
      "Diseño portada.jpg",
      "2.4 MB · Imagen · v2",
      "Vista previa",
      "Todo organizado en un solo lugar",
    ],
  },
  protect: {
    kicker: "Seguridad enterprise",
    title: "Cifrado y autenticación de nivel profesional.",
    description:
      "Protege tus archivos antes de que salgan del equipo. La clave nunca llega a Telegram y puedes añadir un segundo factor de autenticación para el vault.",
    items: [
      "AES-256-GCM con PBKDF2 · vault con bloqueo automático",
      "2FA TOTP compatible con Google Authenticator y Authy",
      "Wipe remoto vía Telegram · verificación SHA-256 en descargas",
    ],
    visual: [
      "Vault protegido · 2FA activo",
      "Documentos privados",
      "8 archivos · AES-256 protegidos",
      "contrato-firmado.pdf",
      "Cifrado antes de subir · SHA-256 verificado",
      "Protegido",
      "La clave permanece en tu equipo",
    ],
  },
  automate: {
    kicker: "Automatización inteligente",
    title: "SharkDrive trabaja mientras tú no lo haces.",
    description:
      "Backups automáticos de carpetas locales, clasificación de archivos por tipo, uploads en paralelo y webhooks cuando se completa una subida.",
    items: [
      "Backups incrementales · auto-clasificación de archivos por tipo de archivo",
      "Hasta 4 uploads en paralelo para reducir el tiempo en lotes grandes",
      "WiFi-only sync · webhooks POST para pipelines de automatización",
    ],
    visual: [
      "Sincronizando 4 archivos en paralelo",
      "Backup de fotografías",
      "24 archivos · Al día · Clasificados",
      "captura-abril.png → /Fotos",
      "Subido hace unos segundos · Webhook enviado",
      "Automatizado",
      "Tus backups trabajan en segundo plano",
    ],
  },
  share: {
    kicker: "Comparte y conecta",
    title: "Tus archivos llegan donde los necesitas.",
    description:
      "Links expirados, companion móvil vía QR, import desde Dropbox y exportación de configuración entre dispositivos. Todo desde un panel central.",
    items: [
      "Links con expiración, límite de descargas, contraseña y código QR",
      "Companion móvil en LAN: escanea el QR y accede desde el browser del teléfono",
      "Import desde Dropbox OAuth2 · exportación de config cifrada entre dispositivos",
    ],
    visual: [
      "Companion móvil activo · QR generado",
      "Archivos compartidos",
      "3 links activos · Companion en LAN",
      "presentacion-final.pdf",
      "Link expira en 22 h · 2 descargas restantes",
      "Copiar link",
      "Comparte solo durante el tiempo necesario",
    ],
  },
};

const renderCapability = (key) => {
  const cap = capabilities[key];
  if (!cap) return;

  setText("[data-capability-kicker]", cap.kicker);
  setText("[data-capability-title]", cap.title);
  setText("[data-capability-description]", cap.description);

  const list = document.querySelector("[data-capability-list]");
  if (list)
    list.innerHTML = cap.items
      .map((item) => `<li><svg><use href="#icon-check"></use></svg>${item}</li>`)
      .join("");

  const selectors = [
    "[data-visual-search]",
    "[data-visual-main]",
    "[data-visual-main-sub]",
    "[data-visual-secondary]",
    "[data-visual-secondary-sub]",
    "[data-visual-badge]",
    "[data-visual-footer]",
  ];
  selectors.forEach((sel, i) => setText(sel, cap.visual[i] ?? ""));
};

// Tabs
document.querySelectorAll(".capability-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".capability-tab").forEach((tab) => {
      const active = tab === btn;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    renderCapability(btn.dataset.capability);
  });
});

// ── Mobile menu ───────────────────────────────────────────────────────────────

const menuBtn = document.querySelector(".mobile-menu-button");
const header = document.querySelector(".site-header");
menuBtn?.addEventListener("click", () => {
  const open = header.classList.toggle("menu-open");
  menuBtn.setAttribute("aria-expanded", String(open));
});
document.querySelectorAll(".main-nav a").forEach((a) =>
  a.addEventListener("click", () => header.classList.remove("menu-open")),
);

// ── Scroll reveal ─────────────────────────────────────────────────────────────

const revealObserver = new IntersectionObserver(
  (entries) =>
    entries.forEach((e) => e.isIntersecting && e.target.classList.add("visible")),
  { threshold: 0.1 },
);
document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));

// ── Misc ──────────────────────────────────────────────────────────────────────

document.querySelector("[data-current-year]").textContent = String(new Date().getFullYear());
loadLatestRelease();
