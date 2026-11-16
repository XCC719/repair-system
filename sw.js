'use strict';
// Change the version whenever any shell asset changes. A new worker waits until
// existing tabs close, so an active form is never reloaded during an update.
const CACHE_PREFIX = `drink-shell:${self.registration.scope}:`;
const CACHE_NAME = `${CACHE_PREFIX}v1`;
// Caches left by the former repair app at this same scope are removed on activation.
const LEGACY_PREFIX = `repair-shell:${self.registration.scope}:`;
const SHELL = [
  './', './index.html', './style.css', './app.js', './pwa.js', './config.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];
const shellURLs = new Set(SHELL.map(path => new URL(path, self.registration.scope).href));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(LEGACY_PREFIX) || (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME))
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  // Only cache this app's static shell. Never intercept Supabase, CDN requests,
  // order submissions, documents, or other apps on the same GitHub Pages origin.
  if (request.method !== 'GET' || !shellURLs.has(request.url)) return;
  event.respondWith(caches.open(CACHE_NAME).then(async cache => {
    return (await cache.match(request)) || fetch(request);
  }));
});
