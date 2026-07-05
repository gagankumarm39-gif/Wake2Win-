import type { GeneratedQuestion, QuestionRequest } from "@/types";
import { shuffle } from "@/lib/utils";

/**
 * Built-in offline question bank — the final fallback so the user NEVER sees an error.
 * In production this is complemented by the `question_bank` table in Supabase
 * (thousands of verified MCQs, seeded per exam). This local copy guarantees the
 * alarm challenge works even fully offline.
 */
interface BankItem {
  exam: string;
  subject: string;
  difficulty: string;
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  hint?: string;
}

const BANK: BankItem[] = [
  {
    exam: "NEET", subject: "Biology", difficulty: "medium",
    question: "Which organelle is known as the powerhouse of the cell?",
    options: ["Mitochondria", "Ribosome", "Golgi apparatus", "Lysosome"],
    correctIndex: 0,
    explanation: "Mitochondria produce ATP through cellular respiration.",
    hint: "It has its own DNA.",
  },
  {
    exam: "NEET", subject: "Chemistry", difficulty: "medium",
    question: "What is the hybridisation of carbon in methane (CH4)?",
    options: ["sp3", "sp2", "sp", "dsp2"],
    correctIndex: 0,
    explanation: "Methane has four equivalent sigma bonds arranged tetrahedrally, so carbon is sp3 hybridised.",
  },
  {
    exam: "JEE", subject: "Physics", difficulty: "medium",
    question: "A body in uniform circular motion has constant:",
    options: ["Speed", "Velocity", "Acceleration", "Momentum"],
    correctIndex: 0,
    explanation: "Speed is constant; velocity, acceleration and momentum change direction continuously.",
    hint: "Direction changes every instant.",
  },
  {
    exam: "JEE", subject: "Mathematics", difficulty: "medium",
    question: "The derivative of sin(x) with respect to x is:",
    options: ["cos(x)", "-cos(x)", "-sin(x)", "tan(x)"],
    correctIndex: 0,
    explanation: "d/dx[sin(x)] = cos(x) by first principles.",
  },
  {
    exam: "UPSC", subject: "Polity", difficulty: "medium",
    question: "Which article of the Indian Constitution deals with the Right to Equality?",
    options: ["Article 14", "Article 19", "Article 21", "Article 32"],
    correctIndex: 0,
    explanation: "Article 14 guarantees equality before the law and equal protection of the laws.",
  },
  {
    exam: "SSC", subject: "Quantitative Aptitude", difficulty: "easy",
    question: "What is 15% of 240?",
    options: ["36", "32", "38", "34"],
    correctIndex: 0,
    explanation: "15% of 240 = 0.15 × 240 = 36.",
  },
  {
    exam: "GATE", subject: "Computer Science", difficulty: "medium",
    question: "The worst-case time complexity of binary search is:",
    options: ["O(log n)", "O(n)", "O(n log n)", "O(1)"],
    correctIndex: 0,
    explanation: "Binary search halves the search space each step: O(log n).",
  },
  {
    exam: "CAT", subject: "Quantitative Ability", difficulty: "medium",
    question: "If a train travels 360 km in 4 hours, its average speed is:",
    options: ["90 km/h", "80 km/h", "85 km/h", "95 km/h"],
    correctIndex: 0,
    explanation: "Average speed = distance / time = 360 / 4 = 90 km/h.",
  },
  {
    exam: "BOARDS", subject: "Science", difficulty: "easy",
    question: "The chemical formula of water is:",
    options: ["H2O", "CO2", "O2", "H2O2"],
    correctIndex: 0,
    explanation: "Water is two hydrogen atoms bonded to one oxygen atom.",
  },
];

export function getLocalQuestions(req: QuestionRequest): GeneratedQuestion[] {
  // Prefer exact exam + subject, then exam, then anything — never return empty.
  const tiers = [
    BANK.filter((q) => q.exam === req.exam && q.subject.toLowerCase() === req.subject.toLowerCase()),
    BANK.filter((q) => q.exam === req.exam),
    BANK,
  ];
  const pool = tiers.find((t) => t.length > 0)!;
  const picked = shuffle(pool).slice(0, req.count);

  // Top up by cycling if the pool is smaller than requested.
  while (picked.length < req.count) picked.push(pool[picked.length % pool.length]);

  return picked.map((q) => {
    const order = shuffle([0, 1, 2, 3]);
    return {
      id: crypto.randomUUID(),
      question: q.question,
      options: order.map((i) => q.options[i]),
      correctIndex: order.indexOf(q.correctIndex),
      explanation: q.explanation,
      hint: q.hint,
      source: "local" as const,
    };
  });
}
