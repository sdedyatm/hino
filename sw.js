const CACHE_NAME = "spa-premium-v6";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/biodata.html",
  "/grafik.html",
  "/ritasi.html"
];

// Install — cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        // Cache satu per satu agar satu kegagalan tidak membatalkan semua
        return Promise.allSettled(
          STATIC_ASSETS.map((url) =>
            cache.add(new Request(url, { cache: "reload" })).catch((err) => {
              console.warn("[SW] Gagal cache:", url, err);
            })
          )
        );
      })
      .then(() => self.skipWaiting()) // skipWaiting SETELAH cache selesai
  );
});

// Activate — bersihkan cache lama & langsung ambil kendali
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME)
            .map((k) => {
              console.log("[SW] Hapus cache lama:", k);
              return caches.delete(k);
            })
        )
      )
      .then(() => self.clients.claim())
  );
});

// Helper: apakah URL layak di-cache?
function isCacheable(request) {
  const url = new URL(request.url);
  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    !url.pathname.startsWith("/api/")
  ); // jangan cache endpoint API
}

// Fetch — Cache First untuk aset statis, Network First untuk navigasi
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!isCacheable(event.request)) return;

  // Navigasi: Network First → fallback ke index.html (SPA routing)
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Simpan hasil navigasi ke cache jika sukses
          if (response.ok) {
            const clone = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Offline: coba halaman yang diminta, fallback ke index.html
          return caches
            .match(event.request)
            .then((cached) => cached || caches.match("/index.html"));
        })
    );
    return;
  }

  // Aset statis: Cache First → Network fallback (lebih cepat & andal offline)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // Perbarui cache di background (stale-while-revalidate)
        fetch(event.request)
          .then((response) => {
            if (response.ok) {
              caches
                .open(CACHE_NAME)
                .then((cache) => cache.put(event.request, response));
            }
          })
          .catch(() => {}); // Abaikan error background fetch
        return cached;
      }

      // Tidak ada di cache → ambil dari network & simpan
      return fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch((err) => {
          console.warn(
            "[SW] Fetch gagal & tidak ada cache:",
            event.request.url,
            err
          );
          // Untuk gambar, kembalikan placeholder (opsional)
          // if (event.request.destination === "image") { ... }
        });
    })
  );
});
