export const SYSTEM_LIST_DEFINITIONS = [
  {
    key: "given-name-max",
    alias: "max",
    version: 1,
    name: "People named Max",
    token: "max",
  },
  {
    key: "given-name-luke",
    alias: "luke",
    version: 1,
    name: "People named Luke",
    token: "luke",
  },
];

export function primaryNameToken(name) {
  return String(name ?? "")
    .normalize("NFKC")
    .split("(", 1)[0]
    .trim()
    .split(/\s+/, 1)[0]
    .toLocaleLowerCase("en-US");
}
