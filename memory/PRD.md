# Relay Dip — PRD

## Problem Statement (original, FR)
Application web + mobile responsive « Relay Dip » pour localiser les points relais et lockers en France (Mondial Relay, Chronopost, La Poste, DPD, UPS, Relais Colis, Colis Privé, Vinted Go, Amazon). Code couleur par transporteur, géolocalisation automatique, UI simple et claire. Langue : FRANÇAIS.

## Confirmation + notification de proposition (2026-08-08)
- **Message de confirmation** : après clic sur « Envoyer ma proposition » (utilisateur), la modale affiche un écran de succès (`proposal-success`, icône verte) : « Merci ! Votre proposition a bien été prise en compte. Dès qu'elle sera validée…, vous recevrez une notification… ».
- **Notifications ciblées par utilisateur** : `_add_notification` accepte désormais `user_id` ; `GET /notifications` renvoie les notifs globales (sans user_id) + celles ciblées sur l'utilisateur courant. Rétro-compatible (anciennes notifs = globales).
- **Endpoint `POST /admin/proposals/{id}/accept`** (body `{point_id}`) : crée une notification ciblée pour l'auteur (« Votre proposition a été validée 🎉 », clic → ouvre le point via `ref_id`) puis supprime la proposition. Le frontend appelle cet endpoint à la validation (au lieu du DELETE).
- Testé : backend (curl — l'auteur voit la notif, l'admin non) + frontend (écran de succès affiché). Fichiers : `backend/server.py`, `frontend/src/components/ProposalModal.js`, `frontend/src/pages/MapApp.js`.


## Gestion admin des propositions (2026-08-08)
- **Badge de comptage** sur le bouton « Proposer un point relais ou locker » (admin) : nombre de propositions reçues (`proposal-count-badge`), synchronisé après validation/déclin.
- Chaque proposition affiche son **ancienneté** (timeAgo) + « Cliquez pour compléter et valider ».
- **Proposition cliquable** → ouvre le MÊME `PointForm` **pré-rempli** (nouvelle prop `prefill` : nom, adresse, type, transporteurs + note utilisateur). Titre « Valider la proposition ». À l'enregistrement : le point est créé (POST /admin/points) ET la proposition est supprimée + badge décrémenté. La fiche détail ne s'ouvre plus automatiquement (permet d'enchaîner les validations).
- **Décliner** : bouton corbeille (`stopPropagation`) supprime la proposition et décrémente le compte.
- Fichiers : `pages/MapApp.js` (proposalCount, formPrefill, acceptingProposalId, handleAcceptProposal), `components/ProposalModal.js` (props onCountChange/onAccept, cartes cliquables), `components/PointForm.js` (prop prefill).
- Testé : testing agent 100% (6/6 critères), iteration_17.json. Corrigé : anti-pattern React setState-in-updater + ouverture auto de la fiche après validation.


## Rebranding « Transport P » + logo officiel (2026-08-06)
- Nom de l'app renommé « Relay Dip » → **« Transport P »** partout (en-tête `MapApp.js`, `index.html` title/description/apple-title, `manifest.json` short_name+name).
- **Logo officiel** : badge turquoise `#17BEBB` + « T » blanc + silhouette « porteur de colis » (SVG sur mesure `components/icons/PersonParcel.js`, debout, profil vers la droite, colis dans les bras). Composant réutilisable `components/Logo.js` utilisé dans l'en-tête ET `AuthModal`.
- Icônes PWA/favicon régénérées depuis le logo (cairosvg) : `favicon-32.png`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `icon-src.png` + `logo.svg`. Script : `/tmp/gen_icons.py` (nécessite `pip install cairosvg`).
- Déployé en prod le 2026-08-06.


## Correctifs production (2026-08-05)
- **Login admin prod** : le seed de démarrage (`server.py` startup) réaligne désormais le `password_hash` de l'admin sur `ADMIN_PASSWORD` si le hash existant ne correspond pas (avant : jamais réinitialisé → 401 en prod). Résolu.
- **Page blanche PWA après redéploiement** : `public/service-worker.js` réécrit (cache `relaydip-v2`, réseau d'abord pour navigations HTML, les assets ne renvoient JAMAIS de HTML en secours, purge des anciens caches à l'activate). `src/index.js` : rechargement auto sur `controllerchange` → auto-réparation à chaque déploiement.
- **Page blanche à l'ajout d'un point avec photo** : `ImageCropModal.js` — le canvas intermédiaire passait de `max(w,h)*2` (≈260 Mo pour une photo 12 Mpx → crash mémoire mobile) à la vraie boîte englobante, sortie plafonnée à 1600 px, `toBlob` null géré (toast au lieu de crash). Vérifié E2E en preview (ajout point + photo 4032×3024 OK).
- **Filet de sécurité global** : `components/ErrorBoundary.js` ajouté et branché dans `App.js` — toute erreur de rendu affiche un écran « Recharger » (turquoise) + purge le cache, au lieu d'une page blanche.


## Architecture
- Backend: FastAPI + MongoDB (motor). Routes préfixées `/api`. Auth JWT (cookie httpOnly samesite=none + Bearer fallback), bcrypt.
- Frontend: React 18 + Tailwind + React-Leaflet (clustering) + shadcn/ui + sonner. Thème clair.
- Données: ~4127 points relais/lockers démo réalistes (`relay_data.py`) fusionnés avec les modifs admin.
- Couche admin en mémoire: `_OVERRIDES` (modifs points statiques), `_CUSTOM` (points créés), `_DELETED` (points supprimés), chargés au startup depuis Mongo (`point_overrides`, `custom_points`, `deleted_points`).

## Core Requirements
- Carte Leaflet interactive, marqueurs colorés par transporteur, clustering.
- Filtres transporteur + type (Relais/Locker), recherche ville/CP avec autocomplétion.
- Géolocalisation + onglet « Près de moi » avec rayon 5–200 km.
- Fiches détaillées (nom, adresse, coordonnées, horaires, logos transporteurs, bouton Itinéraire GPS).
- Auth JWT + favoris utilisateur.
- Admin: CRUD complet des points (ajouter, éditer toutes les infos, supprimer définitivement).

## Implemented
- 2026-07-13: Setup complet, thème clair, 9 transporteurs, clustering, géoloc + rayon, autocomplétion, fiches détail + itinéraire, JWT + forgot password (sans email), GZip.
- 2026-07-15: **CRUD Admin complet (frontend + backend)**.
  - Fix backend: modèles `PointFullIn`/`PointPatchIn` (manquants → serveur crashé) définis; startup charge désormais _OVERRIDES (tous champs), _CUSTOM, _DELETED.
  - Nouveau composant `PointForm.js` (création + édition + suppression) : nom, type, transporteur principal + transporteurs pris en charge (multi-select), adresse/CP/ville, téléphone, lat/lng, horaires lun-ven/sam/dim.
  - `PointDetail.js`: bouton « Éditer » (admin) ouvre PointForm; ancien panneau inline supprimé.
  - `MapApp.js`: bouton flottant « Ajouter un point » (admin), gestion état `formPoint`, callbacks onSaved/onDeleted.
  - Suppression = définitive (choix utilisateur confirmé).
  - GET /api/points/{id} respecte désormais _DELETED / _CUSTOM.
  - Testé: backend 72/72, frontend 14/14 scénarios (iteration_13).

## Credentials
- Admin: admin@relaispoint.fr / admin123 (voir /app/memory/test_credentials.md)

## Endpoints Admin
- POST /api/admin/points (PointFullIn, lat+lng requis) — créer
- PUT /api/admin/points/{id} (PointPatchIn, champs optionnels) — modifier
- DELETE /api/admin/points/{id} — supprimer définitivement (custom + statique)

## Auth
- POST /api/auth/change-password (authentifié) — {current_password, new_password ≥6}. Vérifie l'ancien mot de passe (bcrypt) puis met à jour. UI: bouton « Mot de passe » dans l'en-tête (admin uniquement, ChangePasswordModal.js).
- Démarrage: ne réinitialise PLUS le mot de passe admin (crée seulement s'il n'existe pas) → changements persistants.
- Session expirée gérée globalement (intercepteur api.js): reconnexion proposée; les appels d'arrière-plan (/favorites GET, /auth/*) ne déconnectent jamais.

## Performance (2026-07-16)
- Filtrage 100% CÔTÉ CLIENT: GET /api/points UNE seule fois au chargement (état `allPoints`), puis transporteur/type/recherche/distance filtrés en mémoire via useMemo (aucun appel réseau au changement de filtre). `_norm` (accents) + `_haversine` client.
- PointCard en React.memo; visiblePoints/listPoints mémoïsés → sélection/favoris réactifs, plus de reconstruction des marqueurs à chaque rendu.
- Code mort retiré (mode live/osm/mr).

## Photos des points (2026-07-17)
- **Stockage d'objets Emergent** (clé EMERGENT_LLM_KEY). Endpoints: `POST /api/admin/upload-photo` (admin, image jpg/png/webp, max 8 Mo) → `{url}`; `GET /api/files/{path}` (public, sert l'image, cache 24h). Réfs stockées dans `db.files`. Champ `photo` ajouté à PointFullIn/PointPatchIn et `_EDITABLE`, persisté sur le point.
- Frontend: champ « Photo » dans PointForm (upload + aperçu + retrait), affichage dans PointDetail (bannière) et vignette dans PointCard. URL = `REACT_APP_BACKEND_URL + point.photo`.
- Testé end-to-end (upload → aperçu → point créé → photo affichée dans la fiche).

## Modale « Mon compte » (2026-06-19)
- Bouton **« Mon compte »** (sous le titre, tous écrans) → ouvre `AccountModal` avec 2 onglets:
  - **Mon profil**: nom modifiable + **adresse email modifiable** via bouton « Éditer » (PATCH `/api/auth/profile`, contrôle d'unicité), bouton « Modifier mon mot de passe » (ouvre ChangePasswordModal). Rôle retiré.
  - **Paramètres**: statistiques (admin), **Thème** (bouton visuel, sans effet — à brancher plus tard), **Supprimer mon compte** (confirmation → `DELETE /api/auth/account` supprime user + reset tokens + cookie → déconnexion auto). « Se déconnecter » reste dans l'en-tête.
- Backend: `ProfileIn` (name/email optionnels) + `PATCH /auth/profile` (auth requis; email → unicité vérifiée). Contexte: `patchUser()`. Vérifié e2e (nom, email, unicité 400).

## FIX Auth iOS/PWA — token Bearer (2026-06-18)
- **Problème**: sur iOS/Safari et PWA, le cookie `access_token` (SameSite=None, Secure) n'était pas conservé → toute requête authentifiée (POST /favorites) renvoyait 401 → déconnexion à chaque ajout de favori.
- **Correctif (repli Bearer)**: `/auth/login` et `/auth/register` (server.py) renvoient désormais `token` dans le body. Frontend (`lib/api.js`): token stocké dans localStorage (`rd_token`), ajouté en en-tête `Authorization: Bearer` via intercepteur de requête axios; supprimé au logout et sur 401. `get_current_user` lisait déjà le Bearer en repli du cookie. Cookie conservé en parallèle.
- Vérifié e2e: après suppression totale des cookies, l'ajout de favori fonctionne (cœur rouge), pas de déconnexion, aucune erreur JS.
- Gestion propre des erreurs favoris (try/catch dans toggleFavorite + handleFav) → plus d'écran d'erreur rouge; en cas de 401, fenêtre de connexion affichée.

## Accueil mobile + Favoris (2026-06-18)
- **Panneau d'accueil par défaut**: sur mobile, `sheetOpen=true` (MapApp.js) → l'app s'ouvre plein écran sur le panneau (logo, recherche, connexion, onglets, filtres, liste), plus aucune carte visible au-dessus. Bouton **« Afficher la carte »** pour révéler la carte à la demande (redevient « Liste (N) »). Bureau inchangé.
- **Libellés**: « Transporteurs » → « Sélectionnez votre transporteur » ; « Type de point » → « Choix de type de point ».
- **Nom utilisateur visible sur mobile** dans l'en-tête, à côté de « Se déconnecter ».
- **Fond de carte français**: TileLayer OpenStreetMap France (tile.openstreetmap.fr/osmfr) → toutes les villes/régions en français (remplace Carto light_all anglais).
- **FIX Favoris 404**: `list_favorites` et `add_favorite` (server.py) utilisaient `POINTS` (démo vide) → 404 pour les points personnalisés `cust-…`. Corrigé pour utiliser `_effective_points()`. Le cœur passe bien en rouge, compteur Favoris à jour. Vérifié e2e.
- **Note**: mot de passe admin `admin123` ne fonctionne plus (modifié par l'utilisateur).
- **Revue de code — faux positifs (non corrigés, sûrs)**: MD5 dans `mondial_relay.py` = signature IMPOSÉE par l'API Mondial Relay. `random` dans `relay_data.py` = données démo DÉSACTIVÉES. Aucune comparaison `is <int>` présente.

## Bouton Proposition sorti de la cloche (2026-07-23)
- « Proposition de point relais ou locker » retiré de la cloche → composant dédié `ProposalModal.js` ouvert par un bouton jaune, placé sur la même ligne que la cloche (à droite). Même forme/largeur que « Se déconnecter » puis repositionné au niveau de la cloche.
- Cloche = 2 onglets: Information Client + Avis clients (admin). Formulaire proposition: placeholder adresse « Adresse (Ex : 10 rue de Rivoli, Paris) », autocomplétion BAN conservée.

## Cloche : onglets Proposition + Avis + toggle (2026-07-22c)
- **Panneau cloche à onglets**: « Information Client » (gauche) + « Proposition de point relais ou locker » + « Avis clients » (jaune, admin only, à droite).
- **Proposition** (onglet, visiteur connecté): formulaire nom + recherche adresse (autocomplétion BAN via `/address-suggest`, placeholder « Numéro, nom de la rue, ville ou code postal ») + type Relais/Locker + transporteurs (multi-select, validés backend contre CARRIERS) + commentaire. `POST /api/proposals`. Admin voit la liste dans le même onglet (`GET /api/admin/proposals`, `DELETE /api/admin/proposals/{id}`).
- **Avis clients** déplacé de StatsModal vers l'onglet cloche (admin), `GET /api/admin/reviews`.
- **Toggle notifications** par utilisateur: `POST /api/notifications/toggle {enabled}`, `GET /notifications` renvoie `enabled` + unread=0 si off. N'affecte PAS la création de points/annonces. Interrupteur dans l'onglet Information Client.
- Cloche visible connectés uniquement.

## Notifications internes (2026-07-22b)
- **Cloche 🔔 sous le logo** (connectés uniquement) avec pastille rouge (non-lues). Composant `NotificationBell.js`, poll 60s, marque lu à l'ouverture.
- Backend: collection `notifications` {type, title, body, created_at}. `GET /api/notifications` (liste 50 + unread basé sur `user.notifications_read_at`), `POST /api/notifications/read`, `POST /api/admin/notifications` (annonce admin). Notif auto type=point lors de `POST /api/admin/points`.
- Deux sources: annonces manuelles admin (formulaire dans le panneau) + auto à l'ajout d'un point (1c). Testé curl + UI.
- Google Auth (option B) RETIRÉE puis option C (email Gmail) ABANDONNÉE par l'utilisateur → app revenue à email/mot de passe classique.

## Auth Google (2026-07-22)
- **Connexion/inscription Google** (Emergent-managed, gratuit, sans clé API) en plus de l'email/mot de passe. Bouton « Continuer avec Google » dans AuthModal (Connexion + Inscription).
- Backend `POST /api/auth/google/session` échange le session_id (Emergent OAuth) → crée/lie user par email (auth_provider=google, sans password_hash) → émet le JWT existant (cookie + token). Login email/mdp bloqué pour comptes Google. `update_profile` n'exige le mot de passe que si le compte en a un.
- Frontend: AuthContext détecte `#session_id=` au chargement et appelle l'endpoint puis nettoie l'URL. Redirect = window.location.origin.
- Email vérifié automatiquement par Google → confirme l'inscription sans code email (alternative gratuite à Resend, choisie par l'utilisateur qui n'avait pas de clé API).

## Stats interactives + graphique (2026-07-21b)
- **Cartes cliquables** dans StatsModal: Visiteurs, Installations, Comptes créés, Visiteurs sans compte → panneau de détail dépliable. « Comptes créés » liste les utilisateurs via `GET /api/admin/users` (admin, sans password_hash: id/name/email/role/created_at/favorites_count).
- **Graphique recharts**: barres groupées Visiteurs/Installations, sélecteur période 7j/30j, tooltip, légende, dates gauche→droite. Axe Y avec domaine/ticks explicites.
- `admin/stats` renvoie aussi `today_visits_auth`, `today_visits_anon`.

## Profil sécurisé + Stats utilisateurs + UI (2026-07-21)
- **Confirmation par mot de passe**: modifier nom/email dans « Mon compte » requiert désormais le mot de passe (`PATCH /api/auth/profile` avec champ `password` obligatoire, vérifié via bcrypt → 400 si incorrect). Overlay de confirmation dans AccountModal.
- **Stats utilisateurs**: `GET /api/admin/stats` renvoie `registered_users` (count db.users), `visits_auth`, `visits_anon`. `track_visit` détecte le token (optionnel) pour incrémenter visits_auth/visits_anon. Nouvelle section « Utilisateurs » dans StatsModal (Comptes créés + Visiteurs sans compte).
- **Avis dans Mon compte**: onglet « Laisser un avis » (jaune, 3e onglet) remplace le bouton d'accueil. Placeholder commentaire = « Que pensez-vous de l'application ? ».
- **Header**: sous-titre « Points Relais et Lockers France » sous le nom ; nom utilisateur en haut / « Se déconnecter » (rouge) tout à droite en dessous. Bouton flottant « Ajouter un point » (carte) supprimé (bouton « Ajouter » du header conservé).

## Avis clients + libellés (2026-07-20)
- **Sous-titre header**: « Points Relais et Lockers France » sous le nom « Relay Dip ».
- **Mode sombre**: confirmé — mode clair par défaut (aucun suivi OS), sombre seulement sur choix explicite (localStorage `rd_theme`).
- **Avis clients**: bouton « Laisser votre avis » (visible connectés uniquement, sous « Mon compte »). ReviewModal (note 1-5 étoiles + commentaire). Backend `POST /api/reviews` (authentifié), `GET /api/admin/reviews` (admin, avec moyenne). Collection `reviews`. Consultation admin dans StatsModal (section « Avis clients »). Testé backend (curl) + frontend (login + soumission).

## Statistiques & PWA & Déploiement (2026-07-18)
- **Statistiques admin**: `POST /api/track/visit`, `POST /api/track/install`, `GET /api/admin/stats` (collection stats_daily). Frontend: tracking auto (1 visite/session + event appinstalled), bouton « Stats » (admin) + StatsModal (totaux + graphe 30 jours).
- **PWA installable**: manifest.json, service-worker.js (cache app shell, network-first, ignore /api/), icônes (192/512/apple-touch), méta iOS/Android, enregistrement dans src/index.js.
- **DHL & GLS** ajoutés (11 transporteurs). Autocomplétion d'adresse « Près de moi ». Libellé fiche = « Transporteurs pris en charge ».
- **Déploiement PRÊT** (deployment_agent PASS): CORS lit CORS_ORIGINS (repli allow_origin_regex=".*" + credentials), requêtes startup bornées (.limit(50000)).

## Statistiques (2026-07-17)
- **OpenAI Whisper** (whisper-1) via clé universelle EMERGENT_LLM_KEY. Endpoint `POST /api/transcribe` (authentifié, multipart `audio`, langue fr, max 25 Mo) → `{text}`.
- Composant `MicButton.js` (MediaRecorder navigateur → blob webm → /transcribe). Intégré à TOUS les champs texte du formulaire d'ajout/édition: nom, adresse (déclenche aussi l'autocomplétion), code postal, ville, téléphone, horaires lun-ven/sam/dim (8 micros).
- Testé backend (401 sans auth, transcription avec auth). Test voix réelle à faire par l'utilisateur (le micro navigateur n'est pas testable en automatisation).

## Autocomplétion d'adresse (2026-07-17)
- API Adresse gouvernementale (BAN, api-adresse.data.gouv.fr) — gratuite, sans clé, fiable (remplace Nominatim qui renvoyait 429). Endpoint `GET /api/address-suggest` (champs structurés) + `GET /api/geocode` (BAN puis repli Nominatim).
- Formulaire: saisie d'adresse → suggestions → remplissage auto adresse/CP/ville/coordonnées. Coordonnées GPS optionnelles (géocodage auto depuis l'adresse au save).

## Données
- `DEMO_POINTS_ENABLED=false` dans backend/.env → l'app démarre vide, l'admin ajoute ses propres points. Réversible.

## Import / Export CSV — SUPPRIMÉ (2026-06-26)
- Fonctionnalité CSV entièrement retirée à la demande de l'utilisateur.
- Backend : endpoints export/import-preview/import-commit + helpers `_parse_csv_row`/`_CSV_COLUMNS` + imports `csv`/`io` supprimés de `server.py`.
- Frontend : fichier `CsvImportModal.js` supprimé, bouton `csv-btn` et toutes ses références retirés de `MapApp.js`.
- Vérifié : 0 référence CSV restante, backend `/api/points` 200, frontend compile OK.

## Message permanent visiteurs (2026-06-24)
- Backend : `db.settings` clé "banner". `GET /notice` (public, seed défaut au 1er appel), `POST /admin/notice` (admin) pour modifier/effacer. Texte par défaut « Cher utilisateurs… ».
- Frontend `NotificationBell` : card rouge (`permanent-notice`) affiché en haut de l'onglet Information Client pour tous les utilisateurs connectés. Éditeur admin `notice-editor` (textarea + Enregistrer + Effacer) visible admin uniquement.
- Testé : GET défaut, update admin, affichage card rouge + éditeur (UI).

## Notification point → ouverture fiche détail (2026-06-24)
- Backend : `_add_notification` accepte `ref_id` ; la notif "point" stocke le `point_id` (`ref_id`), renvoyé par `/notifications`.
- Frontend : `NotificationBell` reçoit `onOpenPoint` (MapApp `openPointById`). Clic sur une notif point → ferme le panneau + ouvre `PointDetail` (fetch `/points/{id}` si absent de allPoints). Affiche adresse, horaires 7j, tél, itinéraire + bouton favori. Libellé « Ouvrir le point ».
- Anciennes notifs sans ref_id → « Voir le détail » (annonce). Testé UI : clic notif point → fiche détail + favori OK.

## Suppression micro/dictée vocale — app 100% gratuite (2026-06-24)
- Retrait complet de la dictée vocale : bouton micro de la barre de recherche + tous les MicButton des champs (adresse, CP, ville, téléphone, horaires). Import MicButton, états voiceState/refs, fonctions startVoiceSearch/stopVoiceSearch supprimés. `micInputCls` sans padding micro. Icônes Mic/Square retirées des imports.
- Plus aucun appel à `/transcribe` (Whisper) ni à l'IA depuis le front → ZÉRO crédit consommé. Endpoint /transcribe conservé côté backend mais jamais appelé.
- Fonctionnalités gratuites : OSM (suggestions+carte), BAN (adresses), stockage photos. Testé UI : formulaire sans micro, loupe présente.

## Retour à l'option C — OpenStreetMap gratuit (2026-06-24)
- Suggestions repassées en OpenStreetMap uniquement (endpoint `admin_point_suggest` sync, `_osm_suggest_list` limit 8). Plus aucun appel IA → aucun crédit consommé.
- `_ai_suggest_list`, `_ai_lookup` et endpoint `/admin/points/lookup` restent dans le code mais NE SONT PLUS appelés (aucun coût). Frontend : debounce 400ms, texte « Suggestions via OpenStreetMap (gratuit) ».
- Testé curl : « Monoprix Paris » → 8 résultats, tous source=openstreetmap.

## Recherche affiche les résultats sans remplir (2026-06-24)
- La loupe (`searchByName`) n'auto-remplit plus : elle affiche les résultats via `runSuggest` (suggestions IA+OSM) dans le panneau. `lookupByQuery` supprimé (endpoint /lookup non utilisé côté front).
- Le remplissage des champs se fait UNIQUEMENT via « Valider cette enseigne » après avoir cliqué un résultat. Voix = remplit le champ nom puis l'utilisateur clique la loupe.
- Testé UI : loupe → résultats affichés, champs vides ; clic résultat + valider → champs remplis (ville=Paris).

## Suggestions par IA — option B (2026-06-24)
- Bouton Google retiré. Endpoint `GET /admin/points/suggest` devient hybride IA+OSM : `_ai_suggest_list` (Gemini) renvoie jusqu'à 6 enseignes réelles précises (nom, adresse, CP, ville, tél, horaires 7 jours) + `_osm_suggest_list` en complément, dédupliqué (name+city), cap 8.
- Frontend : debounce porté à 600ms (IA plus lente), spinner de chargement, texte « Suggestions intelligentes par IA (enrichies OpenStreetMap) ». Chaque suggestion garde `source` (ia|openstreetmap).
- Coût : petit crédit universel par recherche (choix utilisateur option B). Testé curl : « Monoprix Paris » → 8 suggestions (6 IA + 2 OSM) avec horaires 7/7.

## Bouton Google dans la barre de recherche (2026-06-24) [RETIRÉ]
- Icône Globe (`google-search-btn`) dans la barre « Recherche d'enseignes », entre micro et loupe. Clic → ouvre `https://www.google.com/search?q=<nom>` dans un nouvel onglet (ou google.com si vide). 100% gratuit, aucune API.
- Padding input augmenté (pr-28) pour 3 boutons. Testé UI : bouton présent, ouvre bien un onglet Google.

## Détail avant validation dans les suggestions (2026-06-24)
- Clic sur une suggestion → affiche le DÉTAIL (adresse, tél, horaires) SANS remplir le formulaire. Bouton « Valider cette enseigne » (`name-sug-validate-{i}`) → remplit les champs + ferme le panneau.
- `pickNameSuggestion` = toggle détail ; `validateSuggestion` = fillFromLookup + clear. Testé UI : clic résultat → détail + bouton (ville vide) ; clic valider → champs remplis + panneau fermé.

## Panneau de résultats façon Google (2026-06-24)
- La liste de suggestions devient un panneau inline sous la barre « RÉSULTATS TROUVÉS (n) » (plus de dropdown éphémère ; bouton X pour fermer).
- Clic sur un résultat → ligne active (coche verte) + détail déplié (adresse, téléphone, horaires 7 jours) + remplissage du formulaire. `selectedSugIdx` gère l'expansion. Testé UI : « Monoprix Paris » → 6 résultats, clic → détail + champs remplis.

## Libellé « Recherche d'enseignes » (2026-06-24)
- Libellé du champ nom renommé « Recherche d'enseignes » ; placeholder « Ex : supérette, tabac, magasin, fleuriste… ».
- Autocomplétion OSM couvre tous types d'enseignes (supérette, tabac, boulangerie, fleuriste, pharmacie…). Testé : fleuriste/tabac/boulangerie/pharmacie + UI (tabac Lyon → 2 suggestions).

## Recadrage photo à l'ajout (2026-06-24)
- Nouveau composant `ImageCropModal.js` (react-easy-crop@6.2.3) : à la sélection d'une photo, ouverture d'une fenêtre « Cadrer la photo » avec déplacement, zoom (slider) et rotation 90°. Aspect 4/3, grille.
- `PointForm.js` : `onPhotoSelected` lit le fichier → dataURL → ouvre le crop. `uploadCroppedBlob` génère un JPEG (canvas, qualité 0.9) et l'envoie à `/admin/upload-photo` (nom photo.jpg).
- `restrictPosition={false}` : déplacement libre de la photo jusqu'aux bords (haut/bas/gauche/droite), zones hors image possibles.
- Testé UI : sélection fichier → modal cadrage → déplacement libre coin bas-droit → Valider → aperçu photo + toast.

## Masquer la recherche sur ordinateur (2026-06-24, révisé)
- Comportement identique au mobile : `collapseCls = searchCollapsed ? "hidden" : ""` masque UNIQUEMENT la zone recherche (Mon compte, barre de recherche, onglets, filtres type + transporteurs) sur mobile ET desktop.
- La LISTE des points (relais/lockers) reste TOUJOURS visible (hors `collapseCls`). Le panneau desktop (`aside`) reste affiché en 400px (pas de masquage complet).
- Toggle `toggle-search-btn` visible partout (mobile + desktop). Bouton flottant desktop retiré.
- Testé desktop : masquer → recherche+filtres cachés, liste (6 points) visible ; « Afficher la recherche » restaure.

## Recherche orientée magasin/enseigne (2026-06-24)
- Prompt IA (`_ai_lookup`) réécrit : recherche l'ENSEIGNE/MAGASIN (supérette, supermarché, commerce…) comme une recherche Google, JAMAIS un « point relais ». Ne renvoie plus les « Relay » de gare à la place du commerce.
- Le type relais/locker n'est jamais renseigné par la recherche (`fillFromLookup` ne touche pas `type`) → 100 % choix admin au moment de l'ajout.
- Testé : « Tabac de la Gare Besançon » → « Tabac de la Gare » (et non « Relay - Gare Viotte ») ; « Franprix République » → Franprix.

## Autocomplétion nom du point (2026-06-24)
- Champ « Nom du point » : suggestions live pendant la saisie (≥3 car., debounce 400ms) via `GET /api/admin/points/suggest` (admin) → Nominatim (limit 6). Dropdown nom + adresse/ville.
- Clic sur une suggestion → remplit tous les champs (adresse, CP, ville, tél, horaires OSM). Gratuit (OSM only). La loupe/voix gardent le mode hybride OSM+IA.
- Testé : Monoprix/Carrefour/Intermarché → 6 suggestions ; clic → champs remplis. 401 sans auth.

## Ajustements recherche (2026-06-24)
- Mode vocal : la transcription remplit uniquement le champ Nom (pas de recherche auto) ; l'utilisateur clique la loupe pour lancer.
- Priorité horaires : OSM n'est « suffisant » que s'il fournit des horaires, sinon repli IA. Prompt IA assoupli → fournit les horaires HABITUELS des 7 jours (estimation, à vérifier) quand l'établissement/enseigne est connu.
- Testé : Carrefour/Intermarché → OSM 7/7 ; Paul, Tabac Presse du Centre Pirey → IA 7/7.

## Recherche hybride OSM + IA (2026-06-24, option B)
- `POST /api/admin/points/lookup` : essaie OpenStreetMap (gratuit) d'abord ; si adresse absente OU (pas d'horaires ET pas de tél) → repli auto sur IA Gemini (petit crédit). Renvoie `source` (openstreetmap|ia|"").
- Helpers `_osm_lookup`, `_ai_lookup`, `_empty_lookup`. Frontend affiche la source dans le toast.
- Testé : Carrefour City → OSM ; Tabac de la Gare → IA ; Mondial Relay générique → rien (limite : aucune source ne connaît chaque point relais générique → chercher le NOM DU COMMERCE hôte).

## Champ Nom combiné voix + recherche (2026-06-24)
- Le champ « Nom du point » (en haut) intègre 2 boutons : micro (recherche vocale) + loupe (recherche du nom tapé). Entrée clavier déclenche aussi la recherche. Bouton vocal du bas supprimé.
- Les deux modes lancent la même recherche OpenStreetMap (`lookupByQuery` → `/admin/points/lookup`) et remplissent auto tous les champs.
- Testé UI : saisie « Monoprix Rue de Rennes Paris » + clic loupe → nom, adresse, CP, ville, téléphone, horaires remplis.

## Recherche vocale via OpenStreetMap (2026-06-24, remplace la version Gemini)
- Choix utilisateur : source 100 % GRATUITE OpenStreetMap (Nominatim) au lieu de l'IA payante. Recherche vocale conservée.
- Flux : dictée nom → Whisper (/transcribe) → `POST /api/admin/points/lookup` interroge Nominatim (extratags+addressdetails+namedetails) → remplit nom, adresse, CP, ville, téléphone, horaires 7 jours.
- Parser OSM `opening_hours` → format français (`_parse_osm_hours`, `_fmt_osm_times`). Gère Mo-Fr / Sa / Su / 24/7 / off.
- Couverture partielle : si l'établissement n'a pas ces infos dans OSM, champs vides → saisie manuelle. Aucun crédit consommé.
- Import Gemini (LlmChat) et `json` retirés (plus utilisés).
- Testé : curl (Monoprix = tél + 7 jours, Tour Eiffel, Gare de Lyon sans horaires, 401 sans auth). Frontend inchangé (même structure de réponse).

## Recherche vocale du point complet (2026-06-24, remplace la recherche horaires)
- Bouton « Recherche vocale : dites le nom du point » (au-dessus de « Ajouter le point »). L'admin dicte le nom → transcription Whisper → Gemini identifie l'établissement → remplit AUTO nom, adresse, CP, ville, téléphone, horaires 7 jours. L'admin vérifie/corrige puis valide.
- Backend : `POST /api/admin/points/lookup` (admin) body {query} → {found, name, address, postal_code, city, phone, hours{lun..dim}}. Gemini gemini-3.1-pro-preview via EMERGENT_LLM_KEY. (Ancien /hours-lookup supprimé.)
- Coordonnées laissées vides → géocodage auto depuis l'adresse au save.
- Testé : curl (Tour Eiffel → toutes infos + 401 sans auth) + UI (bouton visible). NB: enregistrement micro non testable en automatisation → à valider par l'utilisateur.

## Recherche IA des horaires (2026-06-24)
- Bouton « Rechercher les horaires automatiquement » dans le formulaire admin (juste au-dessus de « Ajouter le point »). Utilise le nom + adresse/ville déjà saisis.
- Backend `POST /api/admin/points/hours-lookup` (admin) → Gemini `gemini-3.1-pro-preview` via EMERGENT_LLM_KEY (emergentintegrations LlmChat). Renvoie JSON {found, hours{lun..dim}}. Parsing robuste (regex JSON), horaires vides si non trouvé.
- Frontend : pré-remplit les 7 jours (l'admin vérifie/corrige puis valide). Toast « à vérifier ». Coût : petit crédit universel par recherche (accepté par l'utilisateur).
- Testé : curl (Carrefour City → 7 jours) + UI (bouton remplit les champs).

## Horaires 7 jours (2026-06-24)
- Formulaire admin : les horaires passent de 3 champs (Lun-Ven/Sam/Dim) à 7 jours individuels (Lundi→Dimanche), chacun avec micro dictée. Raccourci « Copier lundi sur la semaine ».
- Backend `_normalize_hours` : stocke les 7 clés `lun,mar,mer,jeu,ven,sam,dim`. Migration auto des anciens points (`lun-ven` réparti sur lun→ven).
- Affichage : `PointDetail.js` liste les 7 jours (repli `lun-ven` pour anciens points), `PointCard.js` affiche `lun-ven || lun`.
- Testé : curl (7 jours + migration legacy) + UI (7 champs visibles).

## Notifications cliquables + offres (2026-06-24)
- Annonces admin : ajout d'un champ « Lien de l'offre » optionnel (`link`). Backend normalise en https:// auto.
- Comportement visiteur : annonce AVEC lien → clic ouvre l'URL dans un nouvel onglet (« Ouvrir l'offre »). Annonce SANS lien → clic ouvre la vue détail complète (« Voir le détail »).
- Fichiers : `backend/server.py` (modèle AnnouncementIn + `_add_notification` + list_notifications), `frontend/src/components/NotificationBell.js`.
- Testé : curl (link auto-préfixé) + UI (champ visible, publication, indicateur « Ouvrir l'offre »).

## Backlog / Next
- P1: Envoi réel d'email pour « Mot de passe oublié » (Resend ou SendGrid) — actuellement le token est affiché dans l'UI.
- P2: Intégration des vraies API transporteurs (Mondial Relay, La Poste) — en attente clés/contrats officiels réels.
- P2: Persistance multi-instance (les dicts mémoire ne se synchronisent qu'au redémarrage).
- P2: Panneau admin liste/gestion en masse des points (au lieu du seul détail).
