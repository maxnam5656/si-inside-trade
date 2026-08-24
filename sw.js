// Service Worker: สมุดบันทึกระบบ Si Inside Trade
// กลยุทธ์: cache-first สำหรับไฟล์แอปหลัก, stale-while-revalidate สำหรับฟอนต์/สคริปต์ภายนอก
// ทุกข้อมูลเทรดยังคงอยู่ใน localStorage ของหน้าเว็บเหมือนเดิม — service worker นี้แค่ทำให้ "ตัวแอป" เปิดได้แม้ไม่มีเน็ต

const APP_CACHE = 'si-trade-app-v1';
const RUNTIME_CACHE = 'si-trade-runtime-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== APP_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

function isAppShellRequest(url) {
  return url.origin === self.location.origin;
}

function isCacheableThirdParty(url) {
  return (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    url.hostname === 'cdnjs.cloudflare.com'
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // ข้อมูลอัตราแลกเปลี่ยนสด: อย่า cache ปล่อยให้หน้าเว็บจัดการ fallback เอง
  if (url.hostname === 'open.er-api.com') {
    return;
  }

  // App shell: cache-first, แล้วอัปเดตใน background
  if (isAppShellRequest(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req)
          .then((networkResp) => {
            if (networkResp && networkResp.status === 200) {
              const clone = networkResp.clone();
              caches.open(APP_CACHE).then((cache) => cache.put(req, clone));
            }
            return networkResp;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // ฟอนต์ / สคริปต์ภายนอก: stale-while-revalidate
  if (isCacheableThirdParty(url)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          const fetchPromise = fetch(req)
            .then((networkResp) => {
              if (networkResp && networkResp.status === 200) {
                cache.put(req, networkResp.clone());
              }
              return networkResp;
            })
            .catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
  }
});
