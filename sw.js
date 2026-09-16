// MonDjai/Coiffure — service worker : mise en cache de l'app shell pour un
// fonctionnement 100% hors ligne. Aucun appel réseau n'est jamais effectué
// par cette application ; ce service worker sert uniquement à resservir les
// fichiers locaux déjà mis en cache lors de la première visite.
var CACHE_NAME = "mondjai-coiffure-v1";
var APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png",
  "./apple-touch-icon.png",
  "./favicon.ico"
];

self.addEventListener("install", function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(APP_SHELL).catch(function(){ /* tolérant si un fichier manque */ });
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(k){ return k !== CACHE_NAME; })
            .map(function(k){ return caches.delete(k); })
      );
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(event){
  if(event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(function(cached){
      if(cached) return cached;
      return fetch(event.request).then(function(resp){
        return caches.open(CACHE_NAME).then(function(cache){
          try { cache.put(event.request, resp.clone()); } catch(e){}
          return resp;
        });
      }).catch(function(){
        return caches.match("./index.html");
      });
    })
  );
});
