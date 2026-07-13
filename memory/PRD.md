# RelaisPoint — PRD

## Problem Statement (original, FR)
Application mobile + web répertoriant tous les points relais de France (Mondial Relay, Chronopost, La Poste, DPD, UPS, Relais Colis), classés par code couleur, avec géolocalisation automatique, simple et claire.

## Architecture
- Backend: FastAPI + MongoDB (motor). Routes prefixed `/api`. JWT auth via httpOnly cookie (samesite=none, secure) + Bearer fallback. bcrypt password hashing.
- Frontend: React 19 + Tailwind + Leaflet (react-leaflet 4.2.1) + shadcn/ui + sonner. Dark elegant theme (Outfit/Manrope fonts).
- Data: 226 realistic demo pickup points across 30 French cities, generated in `relay_data.py`.

## User Personas
- Particulier cherchant le point relais le plus proche pour un colis.
- Utilisateur connecté enregistrant ses points relais favoris.

## Core Requirements (static)
- Interactive dark Leaflet map, CartoDB Dark Matter tiles.
- Color-coded carrier markers (6 carriers).
- Automatic geolocation ("Me géolocaliser") sorting points by distance.
- Carrier filter chips, city/postal search.
- JWT auth (register/login/logout) + per-user favorites.

## Implemented (2026-07-13)
- Backend: /api/carriers, /api/points (filter/search/geo-distance/404), /api/points/{id}, auth (register/login/logout/me), favorites CRUD (auth-guarded). Admin seeding.
- Frontend: full map UI, filters, search, geolocation FAB, favorites tab, auth modal, responsive desktop panel + mobile bottom sheet. Toasts.
- Tested: backend 17/17 pytest, frontend flows 100% (testing agent iteration_1).

## Credentials
- Admin: admin@relaispoint.fr / admin123 (see /app/memory/test_credentials.md)

## Backlog / Next
- P1: Route/itinerary link to Google/Apple Maps from a point detail.
- P1: Point detail full view with weekly hours + "Ouvert/Fermé maintenant" status.
- P2: Scope duplicate data-testids across desktop/mobile panels via media query.
- P2: Integrate real carrier APIs (needs paid keys) or OpenStreetMap Overpass for live data.
- P2: Cluster markers at low zoom for performance as data grows.
