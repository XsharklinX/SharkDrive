const releaseApi = "https://api.github.com/repos/XsharklinX/SharkDrive/releases/latest";
const releasesUrl = "https://github.com/XsharklinX/SharkDrive/releases";

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
};

const formatDate = (isoDate) =>
  new Intl.DateTimeFormat("es-DO", { day: "numeric", month: "short", year: "numeric" }).format(new Date(isoDate));

const setText = (selector, text) => {
  document.querySelectorAll(selector).forEach((element) => {
    element.textContent = text;
  });
};

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
    const response = await fetch(releaseApi, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);

    const release = await response.json();
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const asset =
      assets.find((candidate) => candidate.name.toLowerCase().endsWith("-setup.exe")) ??
      assets.find((candidate) => candidate.name.toLowerCase().endsWith(".msi")) ??
      assets.find((candidate) => candidate.name.toLowerCase().endsWith(".exe"));
    const releaseLink = asset?.browser_download_url ?? release.html_url ?? releasesUrl;
    const version = release.tag_name || release.name || "Última release";
    const metadata = [asset ? formatBytes(asset.size) : "", release.published_at ? formatDate(release.published_at) : ""]
      .filter(Boolean)
      .join(" · ");

    document.querySelectorAll("[data-download-link]").forEach((link) => {
      link.href = releaseLink;
      link.target = "_blank";
      link.rel = "noreferrer";
    });
    setText("[data-download-label]", asset ? `Descargar ${version}` : "Ver última release");
    setText("[data-release-status]", asset ? `${version} disponible para descargar.` : `${version} publicada en GitHub.`);
    setText("[data-release-version]", version);
    setText("[data-release-meta]", metadata || "Disponible desde GitHub Releases.");
  } catch {
    applyReleaseFallback();
  }
};

const capabilities = {
  explore: {
    kicker: "Explorador de archivos",
    title: "Encuentra lo que buscas sin perder tiempo.",
    description: "Navega carpetas anidadas, usa vistas grid o lista y localiza archivos por nombre, tipo, tamaño o fecha.",
    items: ["Búsqueda global y filtros discretos", "Previsualización de imágenes, video, audio y PDF", "Selección múltiple para acciones en lote"],
    visual: ["Buscar archivos y carpetas", "Proyectos", "12 archivos · Sincronizado", "Diseño portada.jpg", "2.4 MB · Imagen", "Vista previa", "Todo organizado en un solo lugar"],
  },
  protect: {
    kicker: "Cifrado bajo tu control",
    title: "Protege lo sensible antes de subirlo.",
    description: "Activa cifrado local cuando lo necesites. La clave permanece en tu equipo y Telegram recibe el archivo ya protegido.",
    items: ["AES-256-GCM con derivación PBKDF2", "Auto-lock y bloqueo manual del vault", "Cifrado opcional por carpeta o archivo"],
    visual: ["Cifrado local activo", "Documentos privados", "8 archivos · Protegidos", "contrato-firmado.pdf", "Cifrado antes de subir", "Protegido", "La clave se mantiene en tu equipo"],
  },
  automate: {
    kicker: "Backups sin esfuerzo",
    title: "Mantén tus carpetas importantes al día.",
    description: "Vigila carpetas locales y deja que SharkDrive organice las nuevas versiones sin convertir el backup en una tarea manual.",
    items: ["Múltiples carpetas vigiladas", "Sincronización incremental y deduplicación", "Cola persistente con progreso visible"],
    visual: ["Sincronizando cambios locales", "Backup de fotografías", "24 archivos · Al día", "captura-abril.png", "Subido hace unos segundos", "Listo", "Tus backups trabajan en segundo plano"],
  },
  share: {
    kicker: "Enlaces con límites claros",
    title: "Comparte archivos sin perder el control.",
    description: "Genera enlaces desde tu equipo, define cuándo expiran y revócalos desde un panel central cuando ya no sean necesarios.",
    items: ["Expiración y límite de descargas", "Códigos QR y enlaces múltiples", "Panel de links activos con contador"],
    visual: ["Administrar enlaces activos", "Propuesta para clientes", "3 enlaces · 1 activo", "presentacion-final.pdf", "Expira en 22 horas", "Copiar link", "Comparte solo durante el tiempo necesario"],
  },
};

const renderCapability = (key) => {
  const capability = capabilities[key];
  if (!capability) return;

  setText("[data-capability-kicker]", capability.kicker);
  setText("[data-capability-title]", capability.title);
  setText("[data-capability-description]", capability.description);
  const list = document.querySelector("[data-capability-list]");
  list.innerHTML = capability.items.map((item) => `<li><svg><use href="#icon-check"></use></svg>${item}</li>`).join("");
  const selectors = [
    "[data-visual-search]",
    "[data-visual-main]",
    "[data-visual-main-sub]",
    "[data-visual-secondary]",
    "[data-visual-secondary-sub]",
    "[data-visual-badge]",
    "[data-visual-footer]",
  ];
  selectors.forEach((selector, index) => setText(selector, capability.visual[index]));
};

document.querySelectorAll(".capability-tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".capability-tab").forEach((tab) => {
      const active = tab === button;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    renderCapability(button.dataset.capability);
  });
});

const menuButton = document.querySelector(".mobile-menu-button");
const header = document.querySelector(".site-header");
menuButton?.addEventListener("click", () => {
  const open = header.classList.toggle("menu-open");
  menuButton.setAttribute("aria-expanded", String(open));
});
document.querySelectorAll(".main-nav a").forEach((link) => link.addEventListener("click", () => header.classList.remove("menu-open")));

const revealObserver = new IntersectionObserver(
  (entries) => entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add("visible")),
  { threshold: 0.12 },
);
document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));
document.querySelector("[data-current-year]").textContent = String(new Date().getFullYear());
loadLatestRelease();
