import type { RankingEntry, RankingType, RegionScope } from "./wca";

const demoPeople = [
  ["Teodor Zajder", "2022ZAJD01", "Poland", "Poland", "PL", "_Europe"],
  ["Xuanyi Geng (耿暄一)", "2023GENG02", "China", "China", "CN", "_Asia"],
  ["Yiheng Wang (王艺衡)", "2019WANY36", "China", "China", "CN", "_Asia"],
  ["Max Park", "2012PARK03", "USA", "United States", "US", "_North America"],
  ["Tymon Kolasiński", "2016KOLA02", "Poland", "Poland", "PL", "_Europe"],
  ["Matty Hiroto Inaba", "2016INAB01", "USA", "United States", "US", "_North America"],
  ["Luke Garrett", "2015GARR01", "USA", "United States", "US", "_North America"],
  ["Jules Desjardin", "2015DESJ03", "France", "France", "FR", "_Europe"],
  ["Leandro Martín López", "2019LOPE06", "Argentina", "Argentina", "AR", "_South America"],
  ["Ruihang Xu (徐瑞航)", "2018XURU04", "China", "China", "CN", "_Asia"],
  ["Seung Hyuk Nahm (남승혁)", "2017NAHM01", "South Korea", "South Korea", "KR", "_Asia"],
  ["Feliks Zemdegs", "2009ZEMD01", "Australia", "Australia", "AU", "_Oceania"],
] as const;

const givenNames = ["Mina", "Leo", "Ari", "Noah", "Sofia", "Eli", "Maya", "Jonas", "Lina", "Ravi"];
const familyNames = ["Chen", "Silva", "Nowak", "Kim", "Martin", "Singh", "Sato", "Brown", "García", "Müller"];
const countries = [
  ["USA", "United States", "US", "_North America"],
  ["China", "China", "CN", "_Asia"],
  ["Poland", "Poland", "PL", "_Europe"],
  ["Brazil", "Brazil", "BR", "_South America"],
  ["Australia", "Australia", "AU", "_Oceania"],
  ["South Africa", "South Africa", "ZA", "_Africa"],
] as const;

export function makeDemoRankings({
  eventId,
  type,
  scope,
  regionId,
  startRank,
  limit,
}: {
  eventId: string;
  type: RankingType;
  scope: RegionScope;
  regionId: string;
  startRank: number;
  limit: number;
}): RankingEntry[] {
  const rows: RankingEntry[] = [];
  let candidateRank = 1;
  let matchingSubRank = 0;

  while (rows.length < limit) {
    const index = candidateRank - 1;
    const featured = demoPeople[index];
    const country = featured
      ? ([featured[2], featured[3], featured[4], featured[5]] as const)
      : countries[index % countries.length];
    const matchesRegion =
      scope === "world" ||
      (scope === "continent" && (!regionId || country[3] === regionId)) ||
      (scope === "country" && (!regionId || country[0] === regionId));

    if (matchesRegion) {
      matchingSubRank += 1;
      if (matchingSubRank < startRank) {
        candidateRank += 1;
        continue;
      }
      const personName = featured
        ? featured[0]
        : `${givenNames[index % givenNames.length]} ${familyNames[(index * 3) % familyNames.length]}`;
      const personId = featured
        ? featured[1]
        : `${2010 + (index % 17)}${familyNames[(index * 3) % familyNames.length]
            .normalize("NFD")
            .replace(/[^A-Z]/gi, "")
            .toUpperCase()
            .slice(0, 4)
            .padEnd(4, "X")}${String((index % 99) + 1).padStart(2, "0")}`;
      const eventBase = eventId === "333" ? (type === "single" ? 276 : 371) : 700;
      const growth = Math.round(Math.log2(candidateRank + 1) * 31 + candidateRank * 0.012);

      rows.push({
        rank: candidateRank,
        subRank: matchingSubRank,
        personId,
        personName,
        countryId: country[0],
        countryName: country[1],
        countryIso2: country[2],
        continentId: country[3],
        best: eventBase + growth,
        competitionId: "",
        competitionName: "",
      });
    }

    candidateRank += 1;
  }

  return rows;
}
