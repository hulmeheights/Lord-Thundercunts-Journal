/**
 * Trading and psychology quotes for the Observer, one a day. Only lines with a
 * known source; where the attribution is popular rather than certain it says so.
 */
export type QuoteLine = { text: string; cite: string };

export const OBSERVER_QUOTES: QuoteLine[] = [
  { text: "Wiser about everyone else's trading than our own — until we step outside.", cite: "Solomon's paradox · Grossmann & Kross, 2014" },
  { text: "Anything can happen.", cite: "Mark Douglas · Trading in the Zone" },
  { text: "You don't need to know what is going to happen next in order to make money.", cite: "Mark Douglas · Trading in the Zone" },
  { text: "An edge is nothing more than an indication of a higher probability of one thing happening over another.", cite: "Mark Douglas · Trading in the Zone" },
  { text: "Every moment in the market is unique.", cite: "Mark Douglas · Trading in the Zone" },
  { text: "The elements of good trading are: cutting losses, cutting losses, and cutting losses.", cite: "Ed Seykota · Market Wizards" },
  { text: "Win or lose, everybody gets what they want out of the market.", cite: "Ed Seykota · Market Wizards" },
  { text: "If you can't take a small loss, sooner or later you will take the mother of all losses.", cite: "Ed Seykota" },
  { text: "Losers average losers.", cite: "Paul Tudor Jones · Market Wizards" },
  { text: "Don't focus on making money; focus on protecting what you have.", cite: "Paul Tudor Jones" },
  { text: "It never was my thinking that made the big money for me. It always was my sitting.", cite: "Reminiscences of a Stock Operator · Edwin Lefèvre, 1923" },
  { text: "There is nothing new in Wall Street. There can't be, because speculation is as old as the hills.", cite: "Reminiscences of a Stock Operator · Edwin Lefèvre, 1923" },
  { text: "Markets are never wrong — opinions often are.", cite: "Attributed to Jesse Livermore" },
  { text: "I just wait until there is money lying in the corner, and all I have to do is go over there and pick it up.", cite: "Jim Rogers · Market Wizards" },
  { text: "It's not whether you're right or wrong, but how much you make when you're right and how much you lose when you're wrong.", cite: "George Soros" },
  { text: "Do more of what works and less of what doesn't.", cite: "Steve Clark · Hedge Fund Market Wizards" },
  { text: "The goal of a successful trader is to make the best trades. Money is secondary.", cite: "Alexander Elder · Trading for a Living" },
  { text: "The best loser wins.", cite: "Tom Hougaard · Best Loser Wins" },
  { text: "The market can remain irrational longer than you can remain solvent.", cite: "Attributed to John Maynard Keynes" },
  { text: "The four most dangerous words in investing are: this time it's different.", cite: "Sir John Templeton" },
  { text: "Risk comes from not knowing what you're doing.", cite: "Warren Buffett" },
  { text: "The stock market is a device for transferring money from the impatient to the patient.", cite: "Warren Buffett" },
  { text: "Know what you own, and know why you own it.", cite: "Peter Lynch" },
  { text: "Cut your losses short and let your profits run.", cite: "Old trading maxim" },
  { text: "Plan the trade, and trade the plan.", cite: "Old trading maxim" },
  { text: "Losses loom larger than gains.", cite: "Kahneman & Tversky · Prospect Theory, 1979" },
  { text: "Nothing in life is as important as you think it is, while you are thinking about it.", cite: "Daniel Kahneman · Thinking, Fast and Slow" },
  { text: "The first principle is that you must not fool yourself — and you are the easiest person to fool.", cite: "Richard Feynman, 1974" },
  { text: "We are what we repeatedly do. Excellence, then, is not an act but a habit.", cite: "Will Durant · The Story of Philosophy" },
  { text: "You do not rise to the level of your goals. You fall to the level of your systems.", cite: "James Clear · Atomic Habits" },
  { text: "We suffer more often in imagination than in reality.", cite: "Seneca · Letters to Lucilius" },
  { text: "The impediment to action advances action. What stands in the way becomes the way.", cite: "Marcus Aurelius · Meditations" },
  { text: "Fear is the mind-killer.", cite: "Frank Herbert · Dune" },
];

/** The same quote all day, a different one tomorrow, every quote before any repeats. */
export function quoteOfDay(day: string, list: readonly QuoteLine[] = OBSERVER_QUOTES): QuoteLine {
  const n = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  return list[((n % list.length) + list.length) % list.length]!;
}
