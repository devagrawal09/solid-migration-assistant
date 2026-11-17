/**
 * Whether an npm range allows a Solid 2 release: some `||` set of the range
 * has no upper bound below 2.0.0 and no lower bound above it. Prerelease
 * matching rules are ignored on purpose: the question is whether a package
 * was built for Solid 2 at all, not whether npm would pick the RC. A range
 * this can't read (tags, URLs) counts as not allowing it.
 */
export function allowsSolid2(range) {
  if (typeof range !== "string") return false;
  return range.split("||").some((set) => {
    const comparators = set.trim().replace(/\s+-\s+/g, " - ").split(/\s+/).filter(Boolean);
    if (comparators.length === 0 || comparators.every((c) => c === "*" || c === "x" || c === "latest")) {
      return comparators.length === 0 || comparators[0] !== "latest";
    }
    if (comparators.length === 3 && comparators[1] === "-") {
      return compare(comparators[0], "2") <= 0 && compare("2", comparators[2]) <= 0;
    }
    return comparators.every((comparator) => admits(comparator));
  });
}

function admits(comparator) {
  const match = /^(\^|~|>=|<=|>|<|=)?v?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-[0-9A-Za-z.-]+)?$/.exec(comparator);
  if (match === null) return false;
  const [, operator = "", major] = match;
  if (/[xX*]/.test(major)) return true;
  const value = Number(major);
  switch (operator) {
    case "^":
    case "~":
    case "":
    case "=":
      return value === 2;
    case ">=":
    case ">":
      return value < 2 || (value === 2 && operator === ">=" && isZero(match));
    case "<":
      return value > 2 || (value === 2 && !isZero(match));
    case "<=":
      return value >= 2;
    default:
      return false;
  }
}

function isZero(match) {
  return [match[3], match[4]].every((part) => part === undefined || part === "0" || /[xX*]/.test(part));
}

function compare(left, right) {
  return Number(/\d+/.exec(left)?.[0] ?? 0) - Number(/\d+/.exec(right)?.[0] ?? 0);
}
