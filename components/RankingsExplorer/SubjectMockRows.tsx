import type { ExplorerSubject } from "../ExplorerSubjectSwitch/ExplorerSubjectSwitch";

type CompetitionRanking = "best-result" | "podiums" | "latitude";

type MockRow = {
  rank: number;
  title: string;
  detail: string;
  value: string;
  flag: string;
  valueDetail?: string;
};

const PERSONS: MockRow[] = [
  { rank: 1, title: "Teodor Zajder", detail: "2021ZAJD03 · Poland", value: "2.76", flag: "🇵🇱" },
  { rank: 2, title: "Xuanyi Geng", detail: "2023GENG02 · China", value: "2.80", flag: "🇨🇳" },
  { rank: 3, title: "Yiheng Wang", detail: "2019WANY36 · China", value: "3.06", flag: "🇨🇳" },
  { rank: 4, title: "Max Park", detail: "2012PARK03 · United States", value: "3.13", flag: "🇺🇸" },
];

const RESULTS: MockRow[] = [
  { rank: 1, title: "Teodor Zajder", detail: "GLS Big Cubes Gdańsk 2026 · Round 2", value: "2.76", flag: "🇵🇱" },
  { rank: 2, title: "Xuanyi Geng", detail: "Deqing Small & Special 2026 · Final", value: "2.80", flag: "🇨🇳" },
  { rank: 3, title: "Teodor Zajder", detail: "GLS Big Cubes Gdańsk 2026 · Round 1", value: "2.81", flag: "🇵🇱" },
  { rank: 4, title: "Yiheng Wang", detail: "Singapore Mofunland Cruise 2025 · Final", value: "3.06", flag: "🇨🇳" },
];

const COMPETITION_BESTS: MockRow[] = [
  { rank: 1, title: "GLS Big Cubes Gdańsk 2026", detail: "24–26 Jul 2026", value: "2.76", valueDetail: "Teodor Zajder", flag: "🇵🇱" },
  { rank: 2, title: "Deqing Small & Special 2026", detail: "18–19 Jul 2026", value: "2.80", valueDetail: "Xuanyi Geng", flag: "🇨🇳" },
  { rank: 3, title: "Singapore Mofunland Cruise 2025", detail: "12–15 Dec 2025", value: "3.06", valueDetail: "Yiheng Wang", flag: "🇸🇬" },
  { rank: 4, title: "Pride in Long Beach 2023", detail: "17–18 Jun 2023", value: "3.13", valueDetail: "Max Park", flag: "🇺🇸" },
];

const PODIUMS: MockRow[] = [
  { rank: 1, title: "Weihai Open 2026", detail: "Xuanyi Geng · Yiheng Wang · Zhaokun Li", value: "12.61", valueDetail: "3.74, 3.85, 5.02", flag: "🇨🇳" },
  { rank: 2, title: "Deqing Small & Special 2026", detail: "Xuanyi Geng · Bofan Zhang · Yiheng Wang", value: "12.71", valueDetail: "3.71, 4.38, 4.62", flag: "🇨🇳" },
  { rank: 3, title: "Huanggang Open 2026", detail: "Xuanyi Geng · Yiheng Wang · Zhaokun Li", value: "12.73", valueDetail: "3.67, 4.24, 4.34", flag: "🇨🇳" },
  { rank: 4, title: "Jiajiang Open 2026", detail: "Xuanyi Geng · Yize Dong · Qixian Cao", value: "13.39", valueDetail: "3.67, 4.62, 5.10", flag: "🇨🇳" },
  { rank: 5, title: "Hangzhou Open 2026", detail: "Yiheng Wang · Xuanyi Geng · Yufang Du", value: "13.55", valueDetail: "4.42, 4.53, 4.60", flag: "🇨🇳" },
  { rank: 6, title: "Xianju NXN 2026", detail: "Xuanyi Geng · Yiheng Wang · Yufang Du", value: "13.68", valueDetail: "4.26, 4.33, 5.09", flag: "🇨🇳" },
  { rank: 7, title: "Rubik's WCA World Championship 2025", detail: "Yiheng Wang · Xuanyi Geng · Tymon Kolasiński", value: "13.70", valueDetail: "4.23, 4.49, 4.98", flag: "🇺🇸" },
  { rank: 8, title: "Yancheng Spring Open 2026", detail: "Xuanyi Geng · Yiheng Wang · Yufang Du", value: "13.72", valueDetail: "4.42, 4.47, 4.83", flag: "🇨🇳" },
  { rank: 9, title: "Hefei Cubing League 3×3 I 2026", detail: "Xuanyi Geng · Yiheng Wang · Yi Shen", value: "13.74", valueDetail: "4.27, 4.31, 5.16", flag: "🇨🇳" },
  { rank: 10, title: "Beijing Spring Open 2026", detail: "Yiheng Wang · Xuanyi Geng · Yufang Du", value: "13.75", valueDetail: "4.37, 4.44, 4.94", flag: "🇨🇳" },
];

const LATITUDE_NORTH: MockRow[] = [
  { rank: 1, title: "Tromsø Open 2024", detail: "Tromsø, Norway", value: "69.65° N", flag: "🇳🇴" },
  { rank: 2, title: "Reykjavík Open 2025", detail: "Reykjavík, Iceland", value: "64.15° N", flag: "🇮🇸" },
  { rank: 3, title: "Helsinki Open 2025", detail: "Helsinki, Finland", value: "60.17° N", flag: "🇫🇮" },
  { rank: 4, title: "Cape Town Winter 2025", detail: "Cape Town, South Africa", value: "33.92° S", flag: "🇿🇦" },
];

function rowsFor({
  subject,
  competitionRanking,
  latitudeHemisphere,
}: {
  subject: ExplorerSubject;
  competitionRanking: CompetitionRanking;
  latitudeHemisphere: "north" | "south";
}) {
  if (subject === "people") return PERSONS;
  if (subject === "results") return RESULTS;
  if (competitionRanking === "podiums") return PODIUMS;
  if (competitionRanking === "latitude") {
    return latitudeHemisphere === "north" ? LATITUDE_NORTH : [...LATITUDE_NORTH].reverse();
  }
  return COMPETITION_BESTS;
}

export function SubjectMockRows(props: {
  subject: ExplorerSubject;
  competitionRanking: CompetitionRanking;
  latitudeHemisphere: "north" | "south";
}) {
  const rows = rowsFor(props);
  return (
    <ol className="subjectMockRows" aria-label="Ranking preview">
      {rows.map((row, index) => (
        <li className={`subjectMockRow${index % 2 ? " isAlternate" : ""}`} key={`${row.rank}-${row.title}`}>
          <span className="subjectMockRank">{row.rank}</span>
          <span className="subjectMockIdentity">
            <span className="subjectMockFlag" aria-hidden="true">{row.flag}</span>
            <span><strong>{row.title}</strong><small>{row.detail}</small></span>
          </span>
          <span className="subjectMockValue">
            <strong>{row.value}</strong>
            {row.valueDetail && <small>{row.valueDetail}</small>}
          </span>
        </li>
      ))}
    </ol>
  );
}
