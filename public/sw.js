const CACHE = 'kotoba-lab-v0.6.0';
const AUDIO_CACHE = 'kotoba-lab-audio-runtime-v1';
const MANIFEST = './asset-manifest.json';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const response = await fetch(MANIFEST, { cache: 'no-store' });
    const assets = response.ok
      ? await response.json()
      : ['./', './index.html', './styles.css', './visual-polish.css', './corpus-polish.css', './flashcard-polish.css', './lyrics.css'];
    await cache.addAll([...new Set(['./', MANIFEST, ...assets])]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key !== CACHE && key !== AUDIO_CACHE)
        .map((key) => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isAudioAsset = /\/audio\/ja\/[^/]+\.mp3$/i.test(url.pathname);
  const isAudioManifest = url.pathname.endsWith('/audio/ja/manifest.json');

  if (isAudioAsset) {
    event.respondWith((async () => {
      const cache = await caches.open(AUDIO_CACHE);
      const cached = await cache.match(event.request);
      if (cached) return cached;

      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    })());
    return;
  }

  if (isAudioManifest) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(event.request, { cache: 'no-store' });
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      } catch {
        return cache.match(event.request) ?? Response.error();
      }
    })());
    return;
  }

  // Keep the installed PWA current after every GitHub Pages deploy. App shell,
  // JS, CSS and JSON use network-first so a same-URL release never gets pinned
  // behind an older cache. The precache remains the offline fallback.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request, { cache: 'no-store' });
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    } catch {
      const cached = await cache.match(event.request);
      if (cached) return cached;

      if (event.request.mode === 'navigate') {
        return cache.match('./index.html') ?? Response.error();
      }
      return Response.error();
    }
  })());
});


self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});
