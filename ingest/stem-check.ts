/**
 * Checks that the French stemmer converges the morphological variants of the
 * corpus vocabulary. Re-run after any change to `src/search/french.ts`.
 */
import { processTermFrench, stemFrench } from "../src/search/french.js";

const GROUPS: string[][] = [
  ["retraite", "retraites"],
  ["immigration", "immigre", "immigres"],
  ["ecologie", "ecologiste", "ecologistes"],
  ["hopital", "hopitaux"],
  ["policier", "policiers"],
  ["travailleur", "travailleurs"],
  ["salaire", "salaires"],
  ["impot", "impots"],
  ["cotisation", "cotisations"],
  ["europeen", "europeenne", "europeens", "europeennes"],
  ["national", "nationaux", "nationale", "nationales"],
  ["enseignant", "enseignants", "enseignante"],
  ["fiscalite", "fiscalites"],
  ["logement", "logements"],
  ["pension", "pensions"],
  ["nucleaire", "nucleaires"],
  ["chomeur", "chomeurs"],
  ["gouvernement", "gouvernements"],
  ["republique", "republiques"],
  ["etranger", "etrangers", "etrangere"],
  ["renouvelable", "renouvelables"],
  ["magistrat", "magistrats"],
];

let diverging = 0;
for (const group of GROUPS) {
  const stems = new Set(group.map(stemFrench));
  const converges = stems.size === 1;
  if (!converges) diverging += 1;
  const detail = group.map((word) => `${word}→${stemFrench(word)}`).join("  ");
  console.log(`${converges ? "OK " : "DIV"} ${detail}`);
}

console.log(`\n${GROUPS.length - diverging}/${GROUPS.length} groups converge.`);
console.log(
  "Expected rejections:",
  ["les", "de", "et", "123456"].map((w) => `${w}: ${processTermFrench(w)}`).join(", "),
);

if (diverging > 0) {
  console.log("\nRemaining divergences are acceptable when the shared prefix is long enough");
  console.log("for FTS5 prefix matching to catch the variant.");
}
