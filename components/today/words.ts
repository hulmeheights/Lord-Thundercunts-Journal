const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** 0–9999 in words ("one hundred", "two thousand five hundred"); larger numbers fall back to digits. */
export function numberWord(n: number): string {
  n = Math.round(n);
  if (n < 0 || n > 9999) return n.toLocaleString("en-US");
  if (n < 20) return ONES[n]!;
  if (n < 100) return TENS[Math.floor(n / 10)]! + (n % 10 ? `-${ONES[n % 10]}` : "");
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` and ${numberWord(n % 100)}` : ""}`;
  return `${ONES[Math.floor(n / 1000)]} thousand${n % 1000 ? ` ${numberWord(n % 1000)}` : ""}`;
}

/** Wrap one word of a sentence in *asterisks* for the Manifesto's italic. */
export function emphasise(text: string): string {
  if (text.includes("*")) return text;
  const key = text.match(/\b(works|cleanly|consistency|waiting)\b/);
  if (key) return text.replace(key[0], `*${key[0]}*`);
  const money = text.match(/[−-]?\$[\d,]+(?:\.\d+)?[kM]?/);
  if (money) return text.replace(money[0], `*${money[0]}*`);
  return text.replace(/(\S+)([.!?]?)$/, "*$1*$2");
}
