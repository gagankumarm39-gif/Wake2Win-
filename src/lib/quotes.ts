const QUOTES = [
  "Success is the sum of small efforts, repeated day in and day out.",
  "The pain of discipline weighs ounces; the pain of regret weighs tons.",
  "Your future is created by what you do today, not tomorrow.",
  "Rank is rented, and the rent is due every morning.",
  "Don't count the hours. Make the hours count.",
  "Toppers aren't born. They are built one session at a time.",
  "You don't have to be great to start, but you have to start to be great.",
  "A year from now you'll wish you had started today.",
  "Focus on progress, not perfection.",
  "The exam doesn't care about your excuses. It rewards your preparation.",
  "Winners are ordinary people with extraordinary consistency.",
  "Every question you solve today is a mark you earn tomorrow.",
  "Discipline is choosing between what you want now and what you want most.",
  "Small daily improvements are the key to staggering long-term results.",
  "Study while others sleep. Win while others wish.",
];

export function randomQuote(): string {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}
