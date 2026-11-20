// MonDjai/Coiffure — service worker (Sprint 9C ; mécanisme de mise en cache du
// Sprint 8C, repris à l'identique de MonDjai/Revente, Sprint Revente-E : au 9C,
// le numéro de version change et les notifications s'ajoutent à la fin).
// Les appels au serveur MonDjai (autre domaine, méthode POST) ne passent
// jamais par ce cache : seules les requêtes GET de cette adresse sont servies.
//
// ╔══════════════════════════════════════════════════════════════════════╗
// ║  POUR PUBLIER UNE NOUVELLE VERSION : remplacer index.html ET sw.js    ║
// ║  sur GitHub, en changeant seulement ce numéro (10 → 11 → 12…).       ║
// ║  Les téléphones se mettent à jour seuls à l'ouverture suivante,       ║
// ║  sans installation ni désinstallation, sans toucher aux données.      ║
// ╚══════════════════════════════════════════════════════════════════════╝
var VERSION_CACHE = "16";

// Tous les caches de cette application commencent par ce préfixe. Seuls
// ceux-là sont supprimés lors d'une mise à jour : jamais les caches d'une
// autre application MonDjai hébergée à la même adresse (Revente, Salon F…).
var PREFIXE_CACHE = "mondjai-coiffure-";
var CACHE_NAME = PREFIXE_CACHE + "v" + VERSION_CACHE;

// Fichier indispensable : l'application elle-même.
var URL_INDEX = new URL("./index.html", self.location.href).href;
// Fichiers facultatifs : un fichier absent ne fait jamais échouer l'installation.
var FICHIERS_OPTIONNELS = [
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-192.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./favicon-32.png"
];

// Rappel : un service worker n'a pas accès au localStorage. Ce fichier ne lit,
// n'écrit ni n'efface donc jamais les données de l'utilisatrice
// (clé mondjai_coiffure_state_v1) — seulement le cache des fichiers de l'appli.

/* ---------- Installation ---------- */
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // index.html : toujours redemandé au serveur (cache:"reload" contourne le
      // cache HTTP de GitHub Pages, qui peut garder l'ancien fichier ~10 min).
      // S'il est injoignable, l'installation échoue et l'ancienne version reste
      // en place, intacte — le navigateur réessaiera à l'ouverture suivante.
      return cache.add(new Request(URL_INDEX, { cache: "reload" })).then(function () {
        return Promise.all(FICHIERS_OPTIONNELS.map(function (chemin) {
          var url = new URL(chemin, self.location.href).href;
          return fetch(new Request(url, { cache: "reload" })).then(function (rep) {
            if (rep && rep.ok) return cache.put(url, rep);
          }).catch(function () { /* fichier absent ou réseau capricieux : on continue */ });
        }));
      });
    }).then(function () {
      // La nouvelle version prend la main tout de suite (pas d'attente que
      // toutes les fenêtres soient fermées) ; la page se recharge ensuite d'elle-
      // même, une seule fois, quand c'est sans risque (voir index.html).
      return self.skipWaiting();
    })
  );
});

/* ---------- Activation ---------- */
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (cles) {
      return Promise.all(cles.filter(function (cle) {
        return cle.indexOf(PREFIXE_CACHE) === 0 && cle !== CACHE_NAME;
      }).map(function (cle) {
        return caches.delete(cle);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* ---------- Requêtes ---------- */

// La page de l'application elle-même : le dossier (…/coiffure/) ou index.html.
function estPageApplication(url) {
  var dossier = new URL("./", self.location.href).pathname;
  return url.pathname === dossier || url.pathname === dossier + "index.html";
}

// Rafraîchissement silencieux en arrière-plan : si index.html (ou une icône)
// a changé sur GitHub, la copie en cache est remplacée pour l'ouverture
// suivante — filet de sécurité si sw.js n'a pas été remplacé en même temps.
function rafraichir(cache, cle, urlReseau) {
  return fetch(new Request(urlReseau, { cache: "no-cache" })).then(function (rep) {
    if (rep && rep.ok && rep.type === "basic") {
      return cache.put(cle, rep.clone()).then(function () { return rep; }, function () { return rep; });
    }
    return rep;
  });
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  // Même adresse uniquement : ce service worker ne contacte jamais un autre domaine.
  if (url.origin !== self.location.origin) return;

  var navigation = req.mode === "navigate";
  var pageApp = navigation && estPageApplication(url);
  var cle = pageApp ? URL_INDEX : req;
  var urlReseau = pageApp ? URL_INDEX : req.url;

  // Le rafraîchissement en arrière-plan doit pouvoir se terminer après la
  // réponse : on prolonge la vie du service worker jusqu'à sa fin.
  var finArrierePlan;
  event.waitUntil(new Promise(function (resolve) { finArrierePlan = resolve; }));

  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(cle).then(function (enCache) {
        if (enCache) {
          // Cache d'abord : ouverture instantanée, même hors ligne.
          if (self.navigator.onLine !== false) {
            rafraichir(cache, cle, urlReseau).catch(function () {}).then(finArrierePlan);
          } else {
            finArrierePlan();
          }
          return enCache;
        }
        finArrierePlan();
        // Pas encore en cache : réseau, puis repli hors ligne.
        return rafraichir(cache, cle, urlReseau).catch(function () {
          if (navigation) {
            return cache.match(URL_INDEX).then(function (index) { return index || Response.error(); });
          }
          return Response.error();
        });
      });
    }).catch(function () {
      finArrierePlan();
      return fetch(req);
    })
  );
});

/* ---------- Sprint 9C : notifications appli fermée (Web Push) ---------- */
// La mise en cache ci-dessus ne change pas. Le serveur MonDjai (fonction
// envoyer-rappels) envoie { titre, texte, ecran, tag } ; toucher la
// notification ouvre l'appli sur cet écran (?ecran=…), ou la ramène au
// premier plan si elle est déjà ouverte.
var ECRANS_NOTIFICATION = ["accueil", "abonnement", "saisie", "sauvegarde"];

self.addEventListener("push", function (event) {
  var d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { texte: event.data ? event.data.text() : "" }; }
  if (!d || typeof d !== "object") d = {};
  var ecran = ECRANS_NOTIFICATION.indexOf(d.ecran) !== -1 ? d.ecran : "accueil";
  event.waitUntil(self.registration.showNotification(String(d.titre || "MonDjai").slice(0, 60), {
    body: String(d.texte || "").slice(0, 160),
    icon: new URL("./icon-192.png", self.location.href).href,
    badge: new URL("./icon-maskable-192.png", self.location.href).href,
    tag: String(d.tag || "mondjai").slice(0, 40),
    data: { ecran: ecran }
  }));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var ecran = (event.notification.data && event.notification.data.ecran) || "accueil";
  if (ECRANS_NOTIFICATION.indexOf(ecran) === -1) ecran = "accueil";
  var dossier = new URL("./", self.location.href);
  var cible = new URL("./?ecran=" + ecran, self.location.href).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (fenetres) {
    for (var i = 0; i < fenetres.length; i++) {
      var f = fenetres[i];
      if (new URL(f.url).pathname.indexOf(dossier.pathname) === 0 && "focus" in f) {
        f.postMessage({ mondjai: "notification", ecran: ecran });
        return f.focus();
      }
    }
    return self.clients.openWindow ? self.clients.openWindow(cible) : null;
  }));
});
