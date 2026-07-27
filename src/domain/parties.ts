import { normalizeLabel } from "../utils/text.js";
import { PARTY_IDS, type PartyId } from "./types.js";

export interface PartyProfile {
  id: PartyId;
  name: string;
  shortName: string;
  candidate2022: string;
  bloc: string;
  /** Terms a client may use to refer to this party. */
  aliases: string[];
}

export const PARTIES: Record<PartyId, PartyProfile> = {
  lfi: {
    id: "lfi",
    name: "La France insoumise",
    shortName: "LFI",
    candidate2022: "Jean-Luc Mélenchon",
    bloc: "Gauche radicale (Union populaire)",
    aliases: ["lfi", "france insoumise", "insoumis", "melenchon", "mélenchon", "union populaire"],
  },
  rn: {
    id: "rn",
    name: "Rassemblement national",
    shortName: "RN",
    candidate2022: "Marine Le Pen",
    bloc: "Extrême droite",
    aliases: ["rn", "rassemblement national", "le pen", "lepen", "front national"],
  },
  renaissance: {
    id: "renaissance",
    name: "Renaissance (ex-La République en marche)",
    shortName: "Renaissance",
    candidate2022: "Emmanuel Macron",
    bloc: "Centre (Ensemble)",
    aliases: ["renaissance", "lrem", "la republique en marche", "ensemble", "macron", "majorite presidentielle"],
  },
  ps: {
    id: "ps",
    name: "Parti socialiste",
    shortName: "PS",
    candidate2022: "Anne Hidalgo",
    bloc: "Gauche sociale-démocrate",
    aliases: ["ps", "parti socialiste", "socialiste", "hidalgo"],
  },
  lr: {
    id: "lr",
    name: "Les Républicains",
    shortName: "LR",
    candidate2022: "Valérie Pécresse",
    bloc: "Droite",
    aliases: ["lr", "les republicains", "républicains", "pecresse", "pécresse", "droite republicaine"],
  },
};

export const PARTY_LIST: PartyProfile[] = PARTY_IDS.map((id) => PARTIES[id]);

export function isPartyId(value: string): value is PartyId {
  return (PARTY_IDS as readonly string[]).includes(value);
}

/** Resolves a party id from a free-form label such as "Mélenchon" or "RN". */
export function resolveParty(input: string): PartyId | undefined {
  const normalized = normalizeLabel(input);
  if (isPartyId(normalized)) return normalized;
  for (const profile of PARTY_LIST) {
    if (profile.aliases.some((alias) => normalizeLabel(alias) === normalized)) return profile.id;
  }
  return undefined;
}
