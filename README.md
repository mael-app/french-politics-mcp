# Civis — `french-politics-mcp`

[![CI](https://img.shields.io/github/actions/workflow/status/mael-app/french-politics-mcp/ci.yml?branch=main&label=CI)](https://github.com/mael-app/french-politics-mcp/actions/workflows/ci.yml)
[![Licence Apache 2.0](https://img.shields.io/badge/licence-Apache%202.0-blue)](LICENSE)
[![MCP Streamable HTTP](https://img.shields.io/badge/MCP-Streamable%20HTTP-6f42c1)](https://modelcontextprotocol.io)
[![État du Worker](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Ffrench-politics-mcp.mael-app.workers.dev%2Fhealth&query=%24.status&label=Cloudflare%20Worker&color=f38020)](https://french-politics-mcp.mael-app.workers.dev/health)
[![Corpus](https://img.shields.io/badge/corpus-4%20704%20passages-informational)](#corpus)

Serveur MCP qui donne accès aux **programmes officiels de l'élection présidentielle française de 2022**, pour cinq partis, avec une contrainte : ne jamais répondre sans source primaire.

Le serveur ne raisonne pas et ne rédige aucune synthèse. Il retrouve des passages, renvoie leur **texte exact** et leur **référence complète**, et dit explicitement quand le corpus ne documente pas un sujet. La synthèse revient au modèle client, à partir de citations vérifiables.

## Se connecter

Le serveur est déployé, public et en lecture seule :

```
https://french-politics-mcp.mael-app.workers.dev/mcp
```

Avec Claude Code :

```bash
claude mcp add --transport http civis https://french-politics-mcp.mael-app.workers.dev/mcp
```

Avec l'inspecteur MCP, en transport **Streamable HTTP** :

```bash
npx @modelcontextprotocol/inspector --cli \
  https://french-politics-mcp.mael-app.workers.dev/mcp \
  --transport http --method tools/list
```

Pour un client qui ne parle que stdio, passer par le proxy `mcp-remote`. Aucune authentification n'est requise, le corpus est public.

## Corpus

**158 documents, 4 704 passages citables, 3,4 millions de caractères**, pour ce seul scrutin. Dix thèmes comparables, tous couverts par les cinq partis.

| Parti | Candidat | Documents | Passages |
|---|---|---|---|
| LFI | Jean-Luc Mélenchon | Programme abrégé + 41 livrets thématiques + 13 plans | 2 358 |
| RN | Marine Le Pen | Manifeste + 17 livrets « projet » | 791 |
| Renaissance | Emmanuel Macron | Projet 24 p. + 41 fiches thématiques | 739 |
| LR | Valérie Pécresse | Le courage de faire + 33 fiches de projet | 551 |
| PS | Anne Hidalgo | Programme officiel 44 p. | 266 |

S'y ajoutent deux séries homogènes : la déclaration officielle de chaque candidat à la Commission nationale de contrôle de la campagne — le seul document que les cinq ont produit dans le même format — et les réponses écrites au questionnaire TDIE sur les transports, pour les quatre candidats qui y ont répondu (Emmanuel Macron ne l'a pas fait).

Ces séries sont retenues selon une règle uniforme : tous ceux qui ont produit le document, sans sélection destinée à combler tel ou tel parti.

Le choix de la présidentielle 2022 plutôt que des législatives 2024 est délibéré : en 2024, LFI et le PS partageaient le programme du Nouveau Front populaire, ce qui rendait la comparaison parti par parti sans objet.

### Un corpus inégal, et pourquoi il le reste

Le PS est documenté 9 fois moins que LFI. Ce n'est pas un défaut de collecte : Anne Hidalgo n'a produit aucun livret thématique, là où LFI en a publié 54, et la candidature d'Emmanuel Macron, déposée cinq semaines avant le scrutin, n'a matériellement pas donné lieu à un appareil programmatique volumineux. Le déséquilibre reflète ce que les partis ont réellement publié.

Plutôt que de tronquer les uns pour égaliser, le serveur rend l'écart visible et l'empêche de fausser les résultats :

- `compare_parties` **annonce l'écart** et joint à chaque parti son volume de corpus. Un `not_found` doit se lire « le corpus documente peu ce parti », jamais « ce parti n'avait pas de position ». Le classement n'y est pas affecté : chaque parti est interrogé par une requête séparée.
- `search_documents` **plafonne** la part d'un même parti à un tiers des résultats, faute de quoi le parti le plus volumineux monopoliserait les recherches non filtrées.

### Sources et robots.txt

Deux hôtes interdisent le parcours automatisé, et cela a été respecté :

- **`mlafrance.fr`** (`Disallow: /`) sert les livrets du RN. On passe par `rassemblementnational.fr`, qui les sert à l'identique en `Allow: /`. Ce qui reste exclusif à mlafrance.fr — dossiers de presse, discours, communiqués — n'est de toute façon pas programmatique.
- **`laec.fr`** publie le texte intégral de *L'Avenir en commun*, mais son `robots.txt` est une liste blanche de moteurs de recherche close par `Disallow: /`. Le texte du livre n'est donc pas dans le corpus. Ses livrets et plans, republiés par LFI sur `melenchon2027.fr` (hôte permissif), le sont — et représentent un volume bien supérieur.

Les sites de campagne d'Emmanuel Macron et d'Anne Hidalgo ayant disparu, leurs documents sont cités via l'archive Wayback, à un horodatage figé pour rester reproductibles ; l'URL d'origine est conservée dans les métadonnées. Chaque source porte son empreinte SHA-256.

## Tools MCP

| Tool | Rôle |
|---|---|
| `search_documents` | Recherche des passages, filtrables par parti et par thème. Une liste vide est une réponse : le corpus ne documente pas le sujet. |
| `get_passage` | Texte exact d'un passage et de ses voisins, pour vérifier qu'une citation n'est pas sortie de son contexte. |
| `compare_parties` | Sur un thème, les meilleurs passages de chaque parti avec un niveau de preuve. Aucune synthèse côté serveur. |
| `list_parties` | Ce que le corpus contient par parti : volume, thèmes couverts. |
| `list_sources` | Documents primaires, URL, type, empreinte SHA-256. |

**Resources** : `party://{partyId}`, `election://presidentielle-2022`, `topics://catalog`.
**Prompts** : `compare-topic`, `summarize-party-position`, `find-direct-quote`.

### Niveaux de preuve

`compare_parties` qualifie chaque parti par un `evidenceLevel`, déduit du nombre de mots-clés du thème réellement présents dans le passage — un signal mesurable, jamais un jugement sur le fond.

- `direct_quote` — le passage traite explicitement le thème
- `clear_paraphrase` — il l'aborde sans lui être consacré
- `weak_inference` — le lien n'est que lexical, à interpréter avec prudence
- `not_found` — rien dans le corpus : ne prêter aucune position au parti

## Architecture

TypeScript de bout en bout, sur Cloudflare Workers, avec le corpus dans **D1** (SQLite managé).

```
src/
  index.ts              Worker : health check + createMcpHandler sur /mcp
  server/               McpServer — tools, resources, prompts
  domain/               types, partis, taxonomie des thèmes
  search/               pipeline linguistique français + constructeur de requête FTS5
  storage/              accès D1 : recherche, passages, agrégats
ingest/                 pipeline local : fetch → extract → normalize → build-sql
data/corpus/            corpus.json — artefact normalisé, source du SQL
data/sql/               schema.sql (écrit à la main) + seed.sql (généré)
data/text/              texte extrait, versionné (preuve consultable)
data/raw/               PDF sources (non versionnés, checksums.json l'est)
```

Le Worker est **sans état** et n'embarque aucune donnée : pas de Durable Object, transport Streamable HTTP uniquement (SSE est déprécié). Une instance `McpServer` neuve est créée **à chaque requête** — le SDK l'exige depuis la version 1.26, un serveur partagé pouvant faire fuiter la réponse d'un client vers un autre.

### Pourquoi D1 plutôt qu'un index embarqué

La première version chargeait un index MiniSearch depuis le bundle. Ce n'était pas la taille qui posait problème (609 Ko gzippés sur les 3 Mo autorisés) mais le **CPU au démarrage à froid**, mesuré à ~8,8 ms sur un isolate neuf — dont 6,2 ms pour la seule réhydratation de l'index — face à la limite de **10 ms de CPU par requête** du plan gratuit. La première requête servie par chaque isolate passait tout près du plafond.

D1 déplace ce travail vers de l'entrée-sortie, qui ne compte pas dans le budget CPU. Le bundle tombe à 386 Ko gzippés, et le coût par requête devient l'attente réseau plus quelques microsecondes de sérialisation. Le corpus peut par ailleurs grossir sans que la taille du Worker bouge.

### Recherche

Recherche plein texte **FTS5** avec classement bm25, le titre de section comptant double.

FTS5 n'embarque aucun analyseur français — son tokenizer se contente de retirer les diacritiques. Le contenu indexé est donc **pré-stemmé** à l'ingestion par `src/search/french.ts`, et la requête passe par exactement le même code côté Worker. Sans cela, « retraites » ne retrouverait pas « retraite ». *Toute modification du stemmer impose de régénérer le seed.*

Ce pipeline est écrit à la main : tokenisation sans accents, mots vides, et un stemmer léger dans l'esprit du *French light stemmer* de Savoy. Snowball aurait pesé 867 Ko pour un gain marginal. `npm run stem:check` vérifie la convergence des variantes sur le vocabulaire du corpus (21 groupes sur 22 ; le préfixe FTS5 rattrape le dernier).

Trois règles décident de ce qui est renvoyé et dans quel ordre :

- **Pénalité de navigation** — les sommaires sont denses en mots-clés mais ne contiennent aucune position citable. Ils sont pénalisés au classement, jamais exclus : l'heuristique n'est pas assez sûre pour rendre du texte inatteignable.
- **Plancher relatif** — les résultats sous 25 % du meilleur score sont coupés. « cryptomonnaies blockchain NFT » ne remonte rien plutôt que cinq passages sans rapport.
- **Plafond par parti** — sur une recherche non filtrée, aucun parti ne peut occuper plus d'un tiers des résultats. Les partis n'ayant pas publié le même volume, LFI raflait sept des douze premiers résultats sur « augmenter le SMIC » : c'était la taille de son corpus qui parlait, pas la pertinence. Le classement par score est conservé, seuls les résultats excédentaires d'un parti déjà bien représenté sont écartés. Un filtre explicite sur un parti désactive la règle.
- **Couverture thématique** — sur une comparaison, le score bm25 est majoré de 15 % par mot-clé distinct du thème présent dans le passage. bm25 seul récompense la rareté d'un terme, ce qui n'est pas la même chose que traiter le sujet ; la couverture seule échoue symétriquement, le vocabulaire d'un thème étant ambigu. Multiplier les deux laisse la pertinence lexicale départager à couverture comparable.

## Ingestion

```bash
npm run ingest          # fetch → extract → normalize → build-sql
npm run corpus:check    # vérifie les invariants du corpus
```

**Prérequis : poppler** (`brew install poppler`, ou `apt install poppler-utils`), pour `pdftotext`. Requis uniquement pour l'ingestion, exécutée en local ; le texte extrait est versionné et le Worker n'en dépend jamais.

Le manifeste (`ingest/manifest.ts`) accepte deux formats. Les PDF passent par poppler, avec un mode par source : le mode par défaut convient aux programmes mis en page, `raw` est réservé aux déclarations CNCCEP dont les colonnes s'entrelaceraient autrement. Les pages HTML passent par `ingest/html.ts`, qui isole le contenu éditorial du gabarit — sans quoi chaque page injecterait son menu et son pied de page dans le corpus, le pendant HTML des titres courants des PDF.

L'extraction passe par poppler plutôt que par une bibliothèque JS parce que ces programmes mélangent, parfois sur une même page, des paragraphes pleine largeur et des zones à deux colonnes. Les extracteurs qui suivent l'ordre du flux PDF recollent alors la ligne de gauche et celle de droite en une seule phrase — pour un serveur dont la promesse est la citation exacte, c'est disqualifiant : cela fabrique des phrases que le candidat n'a jamais écrites.

Le nettoyage traite ensuite les défauts propres à ces documents : titres courants soudés au texte (détectés par n-grammes répétés entre pages), césures, caractères de contrôle laissés à la place de puces, et mots disloqués par l'interlettrage des titres (« UNE RE TRAITE DIGNE » → « UNE RETRAITE DIGNE »).

`corpus:check` revérifie l'invariant central : `chunk.text` est exactement `texteSource.slice(charStart, charEnd)`. C'est ce qui rend une citation vérifiable. Il contrôle aussi que 95 % au moins de chaque document se retrouve dans un passage citable — la couverture est actuellement de 99,7 % à 99,9 %.

## Développement

```bash
npm install
npm run db:reset:local  # applique schema.sql + seed.sql au SQLite local
npm run dev             # wrangler dev sur http://localhost:8787
npm run typecheck
```

Le développement local n'a besoin d'aucun compte Cloudflare : `--local` travaille sur un SQLite dans `.wrangler/state`, et le `database_id` de `wrangler.jsonc` peut rester un placeholder.

Tester le serveur avec l'inspecteur MCP, en transport **Streamable HTTP** sur `http://localhost:8787/mcp` :

```bash
npx @modelcontextprotocol/inspector
```

## Déploiement

```bash
wrangler d1 create civis-corpus     # coller le database_id dans wrangler.jsonc
npm run ingest:sql                  # regénère data/sql/seed.sql
npm run db:reset:remote             # applique le schéma et le corpus
npm run deploy
claude mcp add --transport http civis https://french-politics-mcp.mael-app.workers.dev/mcp
```

`db:reset:remote` recrée les tables : le corpus est un artefact généré, jamais modifié en place.

## Limites de la V1

Le corpus se limite à un scrutin : une position citée engage la campagne présidentielle de 2022, pas la ligne actuelle du parti. Il ne contient ni déclarations médiatiques, ni programmes législatifs. Pour LFI, seule la version abrégée de *L'Avenir en commun* est librement accessible ; l'édition intégrale est un ouvrage payant.

La recherche est **purement lexicale**, avec deux conséquences. Une question formulée sans les mots du programme peut ne rien remonter. Et le vocabulaire d'un thème est parfois ambigu : sur l'immigration, « étranger » désigne aussi bien les étrangers en France que les Français de l'étranger, ce qu'aucun réglage lexical ne distingue — c'est précisément ce que la recherche sémantique résoudrait.

FTS5 n'offre pas non plus de correspondance approximative : une coquille dans la requête ne remonte rien. L'extraction par poppler étant propre, le corpus lui-même n'en souffre pas.

Le texte intégral de *L'Avenir en commun* manque, son seul hébergement libre interdisant le parcours automatisé (voir plus haut). Ses 54 livrets et plans, eux, sont présents.

La recherche sémantique (Vectorize + embeddings multilingues via Workers AI, qui tiennent dans le palier gratuit à cette échelle), les autres scrutins et la détection de positions contradictoires relèvent d'une version ultérieure.

## Contribuer

Les règles de contribution, la convention de commit et la marche à suivre pour ajouter une source au corpus sont dans [CONTRIBUTING.md](CONTRIBUTING.md). Pour signaler une faille, voir [SECURITY.md](SECURITY.md).

La CI, la configuration Dependabot et les réglages de protection de branche dont elle dépend sont décrits dans [.github/AUTOMATION.md](.github/AUTOMATION.md).

## Licence

Le **code** est sous [Apache-2.0](LICENSE) : `src/`, `ingest/`, le schéma de base de données, le manifeste des sources, la taxonomie des thèmes et les métadonnées des partis.

Le **texte des programmes** dans `data/text/` n'est pas couvert par cette licence. Ce sont des œuvres protégées, dont les droits appartiennent aux partis, aux candidats et à leurs éditeurs. Le projet n'en revendique aucun droit et n'en concède aucun. Ce texte est reproduit à des fins documentaires et de citation : le serveur répond en citant mot pour mot, ce qui exige une copie fidèle et vérifiable de la source. Trois des sites de campagne de 2022 ayant déjà disparu, cette copie fait aussi office d'archive.

Chaque document porte son URL de provenance, son empreinte SHA-256 et son parti. La liste complète est dans `ingest/manifest.ts`, et `npm run ingest` reproduit `data/text/` depuis ces URLs.

Le détail des attributions et la procédure de retrait sont dans [NOTICE](NOTICE). Toute demande de retrait d'un ayant droit est honorée sans discussion : le corpus se reconstruit depuis ses sources, retirer un document ne coûte qu'une entrée de manifeste.

Le projet ne prend aucune position politique. Les partis sont traités selon une règle uniforme et le serveur est conçu pour citer, pas pour résumer.
