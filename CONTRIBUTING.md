# Contribuer à Civis

Merci de l'intérêt que tu portes au projet. Civis est un serveur MCP qui donne accès aux programmes de la présidentielle française de 2022 en citant les sources mot pour mot. Toute contribution est bienvenue, à condition de préserver la règle qui fonde le projet.

## La règle qui prime sur tout

**Le serveur doit préférer ne rien dire plutôt que de laisser croire à une source qu'il n'a pas.**

Une requête sans correspondance renvoie zéro résultat et un `notFound` explicite. `compare_parties` déclare `not_found` pour un parti plutôt que d'inférer une position. Les citations sont identiques au caractère près au document d'origine.

Une contribution qui rendrait le serveur plus « utile » en assouplissant cette règle sera refusée, même si elle améliore les métriques de recherche.

## Neutralité politique

Le projet ne prend pas parti. Concrètement :

- Les partis sont traités par des règles uniformes. Si une source d'un type donné est ajoutée pour un parti, elle doit l'être pour tous ceux qui en disposent.
- Le déséquilibre de couverture entre partis reflète ce qu'ils ont réellement publié. On l'affiche, on ne le corrige pas en tronquant qui que ce soit.
- Le périmètre est programmatique : programmes, livrets thématiques, déclarations officielles, réponses écrites à des questionnaires publics. Pas de discours, pas de communiqués, pas d'autres scrutins.

## Démarrer

```bash
git clone <url-du-dépôt>
cd french-politics-mcp
npm install                # installe les hooks git et génère les types Worker
npm run ingest:normalize   # reconstruit data/corpus/corpus.json depuis data/text/
npm run ingest:sql         # génère data/sql/seed.sql
npm run db:reset:local     # charge le SQLite local
npm run dev                # http://localhost:8787
```

`worker-configuration.d.ts`, `corpus.json` et `seed.sql` sont des artefacts générés, absents du dépôt. Le premier est produit par `npm install` (via `prepare`), les deux autres par les commandes ci-dessus. Tout se reconstruit hors ligne : seule l'étape `ingest:fetch` a besoin du réseau.

Pour tester le serveur :

```bash
npx @modelcontextprotocol/inspector --cli http://localhost:8787/mcp \
  --transport http --method tools/list
```

## Avant d'ouvrir une pull request

```bash
npm run typecheck
npm run stem:check     # convergence du stemmer français
npm run corpus:check   # invariants du corpus
```

Et, serveur démarré dans un autre terminal :

```bash
npm run dev
npm run smoke          # session MCP réelle contre le serveur
```

Ces quatre commandes tournent aussi en CI. Le hook de pre-commit lance déjà le typecheck.

## Convention de commit

Le dépôt suit les [Conventional Commits](https://www.conventionalcommits.org/fr/). Le format est vérifié automatiquement par un hook `commit-msg` (husky + commitlint) : un message non conforme empêche le commit.

```
<type>(<portée optionnelle>): <description>
```

Types acceptés : `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `style`, `revert`.

La description commence par une minuscule et n'a pas de point final.

```
feat(search): add per-party cap on unfiltered results
fix(ingest): drop control characters emitted by poppler
docs: document branch protection prerequisites
chore(deps): bump wrangler to 4.115.0
```

La portée est libre : un nom de module (`search`, `storage`, `ingest`, `server`) ou un identifiant de parti. Un changement cassant se signale par un `!` avant les deux-points, ou par un pied `BREAKING CHANGE:`.

Si un hook te bloque à tort, `git commit --no-verify` existe, mais la CI, elle, ne se contourne pas.

## Style de code

Les détails sont dans [CLAUDE.md](CLAUDE.md). L'essentiel :

- **Commentaires en anglais**, même si les chaînes destinées aux utilisateurs sont en français. Descriptions d'outils, notices et prompts MCP sont du contenu produit et restent français.
- **Documenter les fonctions exportées uniquement**, en une ou deux phrases. Les helpers privés restent nus sauf comportement vraiment surprenant.
- Expliquer le *pourquoi*, jamais le *quoi*. Un commentaire qui paraphrase le code est à supprimer.
- Pas de tirets cadratins ni de séparateurs décoratifs dans les commentaires.
- SOLID et DRY : une responsabilité par module, aucune logique dupliquée. Le pipeline linguistique est partagé entre l'ingestion et l'exécution précisément pour cette raison.

## Ajouter une source au corpus

C'est la contribution la plus utile, et la plus exigeante.

1. **Vérifier le `robots.txt` de l'hôte.** Deux hôtes refusent déjà le parcours automatisé et le projet les respecte. S'il interdit, chercher un miroir autorisé ou passer par l'archive Wayback avec un horodatage figé.
2. **Rester dans le périmètre programmatique.** Un discours ou un communiqué sera refusé.
3. **Appliquer une règle uniforme.** Une série de documents doit couvrir tous les partis qui en disposent, et l'absence chez l'un doit être documentée.
4. Ajouter l'entrée dans `ingest/manifest.ts` avec son titre, son `sourceType`, son format et sa collection.
5. Lancer `npm run ingest` puis `npm run corpus:check`, et vérifier que la couverture par document reste au-dessus de 95 %.
6. Contrôler quelques passages extraits à la main. L'extraction PDF échoue de façons subtiles : colonnes entrelacées, lettres espacées, caractères de contrôle invisibles. Un texte mal extrait fabrique des phrases que le candidat n'a jamais écrites, ce qui est exactement ce que le projet doit empêcher.

## Modifier le stemmer

`src/search/french.ts` est utilisé à l'identique à l'ingestion et à l'exécution. Toute modification impose de régénérer le seed :

```bash
npm run ingest:sql && npm run db:reset:local
```

Lance `npm run stem:check` pour vérifier que les variantes du vocabulaire clé convergent toujours.

## Signaler un problème

Les bugs, les erreurs de citation et les suggestions passent par les issues. Pour un problème de sécurité, voir [SECURITY.md](SECURITY.md).

Si tu détiens des droits sur un document reproduit dans `data/text/` et souhaites son retrait, ouvre une issue : la demande sera honorée sans discussion, comme indiqué dans [NOTICE](NOTICE).

## Licence

En contribuant, tu acceptes que ton code soit publié sous [Apache-2.0](LICENSE).
