// MonDjai/Salon F — service worker (F11, PWA installable)
// Cache l'app shell pour un fonctionnement hors ligne réel. Aucune requête vers
// un service tiers : uniquement les fichiers de l'application elle-même.
var CACHE_NAME = "mondjai-salonf-v3";
var APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-1024.png",
  "./apple-touch-icon.png",
  "./favicon.ico"
];

self.addEventListener("install", function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(APP_SHELL).catch(function(){ /* un fichier manquant ne doit pas bloquer l'installation */ });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function(event){
  event.waitUntil(
    caches.keys().then(function(names){
      return Promise.all(names.filter(function(n){ return n !== CACHE_NAME; }).map(function(n){ return caches.delete(n); }));
    })
  );
  self.clients.claim();
});

// Stratégie : cache d'abord, réseau en secours (et mise à jour silencieuse du
// cache en arrière-plan) ; hors ligne et rien en cache pour une page →
// on retombe sur index.html (app à page unique).
self.addEventListener("fetch", function(event){
  if(event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(function(cached){
      var network = fetch(event.request).then(function(resp){
        if(resp && resp.ok){
          var copy = resp.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, copy); });
        }
        return resp;
      }).catch(function(){
        if(event.request.mode === "navigate") return caches.match("./index.html");
        return cached;
      });
      return cached || network;
    })
  );
});
