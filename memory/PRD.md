# Relay Dip — PRD

## Problem Statement (original, FR)
Application web + mobile responsive « Relay Dip » pour localiser les points relais et lockers en France (Mondial Relay, Chronopost, La Poste, DPD, UPS, Relais Colis, Colis Privé, Vinted Go, Amazon). Code couleur par transporteur, géolocalisation automatique, UI simple et claire. Langue : FRANÇAIS.

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

## Accueil mobile + Revue de code (2026-06-18)
- **Panneau d'accueil par défaut**: sur mobile, `sheetOpen` initialisé à `true` (MapApp.js) → l'app s'ouvre directement sur le panneau (logo, recherche, connexion, onglets, filtres, liste) au-dessus de la carte, à chaque ouverture. Bouton « Voir la carte » pour accéder à la carte. Pas de bascule auto vers la carte après recherche. Bureau inchangé (panneau latéral déjà visible).
- **Revue de code — faux positifs (non corrigés, sûrs)**: MD5 dans `mondial_relay.py` = algorithme de signature IMPOSÉ par l'API officielle Mondial Relay (ne pas remplacer par SHA-256). `random` dans `relay_data.py` = générateur de données démo DÉSACTIVÉ (`DEMO_POINTS_ENABLED=false`), pas une faille. Aucune comparaison `is <int>` présente dans le code.

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

## Backlog / Next
- P1: Envoi réel d'email pour « Mot de passe oublié » (Resend ou SendGrid) — actuellement le token est affiché dans l'UI.
- P2: Intégration des vraies API transporteurs (Mondial Relay, La Poste) — en attente clés/contrats officiels réels.
- P2: Persistance multi-instance (les dicts mémoire ne se synchronisent qu'au redémarrage).
- P2: Panneau admin liste/gestion en masse des points (au lieu du seul détail).
