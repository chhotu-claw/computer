/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

// Service worker intentionally DISABLED.
//
// This instance always needs the backend, so a precaching worker adds little
// and its stale-shell caching has bitten us (users kept getting an old UI after
// updates). Instead of precaching, this worker self-destructs: it deletes any
// caches a previous version created, unregisters itself, and reloads open pages.
//
// Browsers that still have the old precaching worker installed will fetch this
// script on their next update check (it's served with Cache-Control: no-cache),
// see it changed, install it, and auto-heal — no hard reload required.

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('install', () => {
	// Take over immediately rather than waiting for old clients to close.
	sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			// Drop every cache this app ever created.
			for (const key of await caches.keys()) {
				await caches.delete(key);
			}
			// Remove ourselves so no worker intercepts future requests.
			await sw.registration.unregister();
			// Reload any open tabs so they pick up fresh, network-served content.
			const clients = await sw.clients.matchAll({ type: 'window' });
			for (const client of clients) {
				(client as WindowClient).navigate((client as WindowClient).url);
			}
		})()
	);
});
