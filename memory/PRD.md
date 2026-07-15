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
- POST /api/auth/change-password (authentifié) — {current_password, new_password ≥6}. Vérifie l'ancien mot de passe (bcrypt) puis met à jour. UI: bouton « Mot de passe » dans l'en-tête (composant ChangePasswordModal.js).

## Backlog / Next
- P1: Envoi réel d'email pour « Mot de passe oublié » (Resend ou SendGrid) — actuellement le token est affiché dans l'UI.
- P2: Intégration des vraies API transporteurs (Mondial Relay, La Poste) — en attente clés/contrats officiels réels.
- P2: Persistance multi-instance (les dicts mémoire ne se synchronisent qu'au redémarrage).
- P2: Panneau admin liste/gestion en masse des points (au lieu du seul détail).
