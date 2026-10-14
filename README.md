# Audit Site Sobre

Outil gratuit d’audit de site pour patrons de PME : vitesse, référencement Google et impact
écologique d’une page, expliqués en euros/clients et en français simple, avec un rapport
technique à transmettre au prestataire et un formulaire de contact (lead).

- Mesures : **Google Lighthouse** (mobile), **EcoIndex** (formule publique GreenIT.fr),
  **The Green Web Foundation** (hébergement vert).
- Pile : Node.js 22 + TypeScript, Fastify, rendu HTML côté serveur, SQLite, Chromium,
  Caddy. Aucun framework front, aucun traqueur, aucun cookie.

## Installation sur le VPS

Prérequis : Docker et Docker Compose.

```bash
git clone <ce-dépôt> audit-site && cd audit-site
cp .env.example .env
nano .env            # au minimum : OWNER_NAME, ADMIN_PASSWORD, FORM_SECRET, SMTP_*, NOTIFY_EMAIL
docker compose up -d --build
```

L’outil est alors accessible sur `http://IP_DU_SERVEUR:8095` (port réglable avec `HTTP_PORT`).
Pensez à ouvrir ce port dans le pare-feu si besoin (`ufw allow 8095/tcp`).

Les tests automatisés s’exécutent pendant la construction de l’image (la construction échoue
s’ils échouent). En local : `npm ci && npm test`.

## Configuration (`.env`)

Toutes les variables sont documentées dans [`.env.example`](.env.example). Les principales :

| Variable | Rôle |
|---|---|
| `BRAND_NAME`, `OWNER_NAME`, `OWNER_BIO`, `OWNER_URL` | Nom et présentation affichés (pied de page, formulaire) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Serveur d’envoi des notifications |
| `NOTIFY_EMAIL` | Adresse qui reçoit chaque nouvelle demande de contact |
| `ADMIN_USER`, `ADMIN_PASSWORD` | Accès à `/admin` (liste des demandes + export CSV) |
| `FORM_SECRET` | Secret de signature du formulaire (`openssl rand -hex 32`) |
| `QUEUE_CONCURRENCY`, `ANALYSIS_TIMEOUT_SECONDS`, `QUEUE_MAX` | File d’analyses |
| `CACHE_HOURS` | Réutilisation d’un résultat récent pour la même adresse (24 h) |
| `RETENTION_DAYS` | Suppression des rapports sans demande de contact (90 jours) |
| `RATE_ANALYSES_PER_HOUR`, `RATE_LEADS_PER_HOUR` | Limites par adresse IP |

Après toute modification : `docker compose up -d` (recrée les conteneurs avec la nouvelle configuration).

Sans SMTP configuré, les demandes de contact sont quand même enregistrées et visibles dans `/admin`
(colonne « Email envoyé : non »).

Les seuils des notes, pondérations et hypothèses d’estimation sont centralisés dans
[`src/scoring/config.ts`](src/scoring/config.ts) ; les phrases « patron » dans
[`src/scoring/phrases.ts`](src/scoring/phrases.ts). Après modification : `docker compose up -d --build`.

## Ajouter un nom de domaine

1. Créez un enregistrement DNS `A` (et `AAAA` si IPv6) vers l’IP du serveur.
2. Dans `.env` : `DOMAIN=audit.mondomaine.fr`, `HTTP_PORT=80`, `HTTPS_PORT=443`.
3. `docker compose up -d`. Caddy obtient et renouvelle seul le certificat HTTPS.

Les ports 80 et 443 doivent être libres sur le serveur : Let’s Encrypt vérifie le domaine par le
port 80 ou 443. **Si un autre reverse proxy les occupe déjà** (par exemple Traefik), deux options :
- faire router le domaine par ce proxy existant vers le conteneur `caddy` (port 80 interne),
  en laissant `DOMAIN` vide pour que Caddy reste en HTTP derrière lui, et renseigner
  `PUBLIC_URL=https://audit.mondomaine.fr` pour des liens de partage corrects ;
- ou libérer les ports 80/443 pour ce Caddy.

## Pages

| Adresse | Contenu |
|---|---|
| `/` | Accueil et formulaire d’analyse |
| `/rapport/<id>` | Attente puis résultat « patron » (lien partageable) |
| `/rapport/<id>/technique` | Rapport technique pour le prestataire (imprimable) |
| `/contact?rapport=<id>` | Formulaire « Faire corriger par un expert » |
| `/methode` | Comment c’est calculé (méthodes, sources, limites) |
| `/mentions-legales`, `/confidentialite` | **À compléter** (emplacements `[À COMPLÉTER]`) |
| `/admin`, `/admin/leads.csv` | Demandes de contact (authentification HTTP basique) |

## Sauvegarde de la base

La base SQLite est dans le volume Docker `audit-site_data`. Sauvegarde à chaud, cohérente :

```bash
docker compose exec app node -e "require('better-sqlite3')('/data/audit.sqlite').backup('/data/sauvegarde.sqlite').then(()=>console.log('ok'))"
docker compose cp app:/data/sauvegarde.sqlite ./sauvegarde-$(date +%F).sqlite
```

Restauration : arrêter (`docker compose stop app`), copier le fichier vers `/data/audit.sqlite`
avec `docker compose cp`, puis `docker compose start app`.

## Mise à jour

```bash
git pull
docker compose up -d --build
docker image prune -f
```

## Fonctionnement et sécurité

- **File d’attente** : une analyse à la fois par défaut. Chaque analyse tourne dans un processus
  séparé (Chromium + Lighthouse), tué au-delà de `ANALYSIS_TIMEOUT_SECONDS`. Les analyses
  interrompues par un redémarrage repartent automatiquement.
- **Protection SSRF** : seules les URL `http`/`https` sur les ports 80/443 sont acceptées ; le nom est
  résolu et refusé si une adresse n’est pas publique (privée, bouclage, link-local, métadonnées cloud,
  CGNAT, IPv6 locale…). Pendant l’analyse, **toutes** les requêtes de Chromium (redirections,
  sous-ressources, websockets) passent par un mandataire local qui applique la même règle et se
  connecte à l’IP vérifiée (pas de DNS rebinding).
- **Anti-spam du formulaire** : champ piège invisible, délai minimal signé (HMAC), limitation par IP.
  Aucun email n’est envoyé à une adresse saisie par un visiteur (pas de relais de spam) :
  « Envoyer à mon prestataire » utilise la messagerie du visiteur (`mailto:`) ou un lien à copier.
- **Sites protégés** : certains sites (Cloudflare, etc.) bloquent les navigateurs automatisés depuis
  un datacenter. L’outil le détecte et affiche un message clair plutôt qu’une fausse note.
- **RGPD** : pas de cookie ni de traqueur ; les adresses IP ne servent qu’à la limitation de débit,
  en mémoire. Rapports sans demande de contact supprimés après `RETENTION_DAYS` jours.
- Chromium est lancé avec `--no-sandbox` (nécessaire dans le conteneur) ; le conteneur tourne en
  utilisateur non privilégié avec `no-new-privileges`.

## Limites connues (v1)

- Une seule page analysée (celle saisie), mesures de laboratoire (pas de données réelles d’usage).
- Les résultats varient légèrement d’une analyse à l’autre (réseau, charge du serveur).
- Les estimations (visiteurs perdus, CO₂) sont des ordres de grandeur : la méthode et les
  sources sont détaillées sur `/methode`.
