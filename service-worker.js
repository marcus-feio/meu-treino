const CACHE_NAME = "treino-cache-v13";

// Arquivos que mudam com frequência (código do app): rede primeiro, cache como reserva offline.
const FRESH_ASSETS = ["./", "./index.html", "./style.css", "./app.js", "./manifest.json"];

// Arquivos pesados e estáveis: cache primeiro (não mudam a cada atualização).
const STABLE_ASSETS = [
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./vendor/pdf.min.js",
  "./vendor/pdf.worker.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([...FRESH_ASSETS, ...STABLE_ASSETS]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isFreshAsset(url) {
  const path = new URL(url).pathname;
  return FRESH_ASSETS.some((a) => path.endsWith(a.replace("./", "")) || path.endsWith("/"));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.mode === "navigate" || isFreshAsset(req.url)) {
    // Rede primeiro: sempre tenta buscar a versão mais nova; só usa cache se estiver offline.
    event.respondWith(
      fetch(req)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return response;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Demais arquivos (pdf.js, ícones): cache primeiro, mais rápido e eles raramente mudam.
  event.respondWith(
    caches.match(req).then((cached) => {
      return (
        cached ||
        fetch(req).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return response;
        })
      );
    })
  );
});
