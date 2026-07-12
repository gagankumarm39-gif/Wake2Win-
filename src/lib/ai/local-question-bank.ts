import type { GeneratedQuestion, QuestionRequest } from "@/types";
import { shuffle } from "@/lib/utils";

/**
 * Built-in offline question bank — the final fallback so the user NEVER sees an
 * error, and (Priority 3) so the alarm never keeps repeating the same handful
 * of questions when the AI providers are down. The NEET set below is large and
 * NCERT-grounded (Biology / Chemistry / Physics), covering direct, statement,
 * assertion-reason and match styles, across difficulties.
 *
 * In production this is complemented by the `question_bank` table in Supabase
 * (thousands of verified MCQs). This local copy guarantees the alarm works even
 * fully offline.
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

const NEET_BIOLOGY: BankItem[] = [
  {
    exam: "NEET", subject: "Biology", difficulty: "medium",
    question: "In which phase of mitosis do sister chromatids separate and move to opposite poles?",
    options: ["Anaphase", "Metaphase", "Prophase", "Telophase"],
    correctIndex: 0,
    explanation: "During anaphase the centromeres split and sister chromatids are pulled to opposite poles.",
    hint: "It comes right after metaphase alignment.",
  },
  {
    exam: "NEET", subject: "Biology", difficulty: "medium",
    question: "The enzyme responsible for unwinding the DNA double helix during replication is:",
    options: ["Helicase", "DNA ligase", "DNA polymerase", "Primase"],
    correctIndex: 0,
    explanation: "Helicase breaks the hydrogen bonds and unwinds the two strands at the replication fork.",
    hint: "It acts before polymerase can copy.",
  },
  {
    exam: "NEET", subject: "Biology", difficulty: "easy",
    question: "Which of the following is the site of the light-independent reactions of photosynthesis?",
    options: ["Stroma", "Thylakoid membrane", "Outer membrane", "Grana lumen"],
    correctIndex: 0,
    explanation: "The Calvin cycle (light-independent reactions) occurs in the stroma of the chloroplast.",
    hint: "Not on the thylakoid — in the fluid around it.",
  },
  {
    exam: "NEET", subject: "Biology", difficulty: "hard",
    question: "Assertion (A): RBCs are the most abundant cells in human blood. Reason (R): Mature mammalian RBCs lack a nucleus. Choose the correct option.",
    options: [
      "Both A and R are true and R is NOT the correct explanation of A",
      "Both A and R are true and R is the correct explanation of A",
      "A is true but R is false",
      "A is false but R is true",
    ],
    correctIndex: 0,
    explanation: "Both statements are individually true, but their high number is not caused by the absence of a nucleus, so R does not explain A.",
    hint: "Abundance and enucleation are independent facts.",
  },
  {
    exam: "NEET", subject: "Biology", difficulty: "medium",
    question: "Which hormone is known as the 'emergency hormone' released by the adrenal medulla?",
    options: ["Adrenaline", "Insulin", "Thyroxine", "Glucagon"],
    correctIndex: 0,
    explanation: "Adrenaline (epinephrine) from the adrenal medulla prepares the body for fight-or-flight.",
    hint: "Fight or flight.",
  },
  {
    exam: "NEET", subject: "Biology", difficulty: "medium",
    question: "The functional unit of the kidney is the:",
    options: ["Nephron", "Neuron", "Alveolus", "Nephridium"],
    correctIndex: 0,
    explanation: "The nephron is the structural and functional unit of the kidney that forms urine.",
    hint: "Not the nerve cell.",
  },
  {
    exam: "NEET", subject: "Biology", difficulty: "easy",
    question: "Which blood group is the universal donor?",
    options: ["O negative", "AB positive", "A positive", "B negative"],
    correctIndex: 0,
    explanation: "O negative has no A, B antigens or Rh factor, so it can be given to any recipient.",
    hint: "No antigens at all.",
  },
  {
    exam: "NEET", subject: "Biology", difficulty: "hard",
    question: "During which stage of meiosis does crossing over occur?",
    options: ["Pachytene of prophase I", "Metaphase I", "Anaphase II", "Zygotene of prophase II"],
    correctIndex: 0,
    explanation: "Crossing over (recombination) occurs at the pachytene stage of prophase I via chiasmata.",
    hint: "It's a sub-stage of prophase I.",
  },
  {
    exam: "NEET", subject: "Biology", difficulty: "medium",
    question: "Which of the following statements about the human heart is correct?",
    options: [
      "The left ventricle has the thickest muscular wall",
      "The right ventricle pumps blood to the whole body",
      "The bicuspid valve is on the right side",
      "Deoxygenated blood is carried by the pulmonary vein",
    ],
    correctIndex: 0,
    explanation: "The left ventricle pumps oxygenated blood to the entire body, so its wall is the thickest.",
    hint: "Highest pressure chamber.",
  },
  {
    exam: "NEET", subject: "Biology", difficulty: "medium",
    question: "The genetic material in most viruses that cause plant diseases is usually:",
    options: ["Single-stranded RNA", "Double-stranded DNA", "Single-stranded DNA", "Double-stranded RNA"],
    correctIndex: 0,
    explanation: "Most plant viruses (e.g., TMV) have single-stranded RNA as their genetic material.",
    hint: "Think TMV.",
  },
  {
    exam: "NEET", subject: "Biology", difficulty: "easy",
    question: "Which plant tissue is responsible for the transport of water and minerals?",
    options: ["Xylem", "Phloem", "Cambium", "Cortex"],
    correctIndex: 0,
    explanation: "Xylem conducts water and dissolved minerals from roots to the rest of the plant.",
    hint: "Upward transport.",
  },
  {
    exam: "NEET", subject: "Biology", difficulty: "hard",
    question: "Match: (i) Golgi apparatus (ii) Lysosome (iii) Ribosome with (P) protein synthesis (Q) packaging/secretion (R) intracellular digestion.",
    options: ["i-Q, ii-R, iii-P", "i-P, ii-Q, iii-R", "i-R, ii-P, iii-Q", "i-Q, ii-P, iii-R"],
    correctIndex: 0,
    explanation: "Golgi packages/secretes, lysosome digests, ribosome synthesises protein.",
    hint: "Ribosome always means protein.",
  },
  {
    exam: "NEET", subject: "Biology", difficulty: "medium",
    question: "The pigment that makes human skin and hair dark is:",
    options: ["Melanin", "Haemoglobin", "Carotene", "Chlorophyll"],
    correctIndex: 0,
    explanation: "Melanin, produced by melanocytes, is responsible for skin and hair pigmentation.",
    hint: "Made by melanocytes.",
  },
  {
    exam: "NEET", subject: "Biology", difficulty: "medium",
    question: "Which of the following is NOT a function of the liver?",
    options: ["Production of insulin", "Detoxification of drugs", "Storage of glycogen", "Production of bile"],
    correctIndex: 0,
    explanation: "Insulin is produced by the beta cells of the pancreas, not the liver.",
    hint: "One of these belongs to the pancreas.",
  },
  {
    exam: "NEET", subject: "Biology", difficulty: "medium",
    question: "The F1 (oxysome/ATP synthase) particles that carry out ATP synthesis during oxidative phosphorylation are located on the:",
    options: [
      "Inner mitochondrial membrane (cristae)",
      "Outer mitochondrial membrane",
      "Mitochondrial matrix",
      "Perimitochondrial space",
    ],
    correctIndex: 0,
    explanation: "Per NCERT, the F0–F1 ATP synthase (oxysomes) stud the inner mitochondrial membrane's cristae, where the proton gradient built by the ETC drives ATP formation.",
    hint: "Think about where the electron transport chain and the proton gradient sit.",
  },
];

const NEET_CHEMISTRY: BankItem[] = [
  {
    exam: "NEET", subject: "Chemistry", difficulty: "medium",
    question: "The hybridisation of carbon in ethyne (C2H2) is:",
    options: ["sp", "sp2", "sp3", "sp3d"],
    correctIndex: 0,
    explanation: "Ethyne has a triple bond; each carbon is sp hybridised with a linear geometry.",
    hint: "Triple bond ⇒ linear.",
  },
  {
    exam: "NEET", subject: "Chemistry", difficulty: "easy",
    question: "Which of the following has the highest first ionisation enthalpy?",
    options: ["Nitrogen", "Oxygen", "Carbon", "Boron"],
    correctIndex: 0,
    explanation: "Nitrogen's half-filled 2p3 configuration gives it extra stability, raising its ionisation enthalpy above oxygen.",
    hint: "Half-filled stability.",
  },
  {
    exam: "NEET", subject: "Chemistry", difficulty: "medium",
    question: "The IUPAC name of CH3-CH(OH)-CH3 is:",
    options: ["Propan-2-ol", "Propan-1-ol", "Propanal", "Propanoic acid"],
    correctIndex: 0,
    explanation: "The –OH is on the second carbon of a 3-carbon chain, giving propan-2-ol.",
    hint: "OH on the middle carbon.",
  },
  {
    exam: "NEET", subject: "Chemistry", difficulty: "hard",
    question: "For a first-order reaction, the half-life is:",
    options: [
      "Independent of initial concentration",
      "Directly proportional to initial concentration",
      "Inversely proportional to initial concentration",
      "Proportional to the square of initial concentration",
    ],
    correctIndex: 0,
    explanation: "t½ = 0.693/k for a first-order reaction — it does not depend on the initial concentration.",
    hint: "t½ = 0.693/k.",
  },
  {
    exam: "NEET", subject: "Chemistry", difficulty: "medium",
    question: "Which quantum number determines the shape of an orbital?",
    options: ["Azimuthal (l)", "Principal (n)", "Magnetic (m)", "Spin (s)"],
    correctIndex: 0,
    explanation: "The azimuthal (angular momentum) quantum number l defines the subshell and orbital shape.",
    hint: "s, p, d shapes.",
  },
  {
    exam: "NEET", subject: "Chemistry", difficulty: "easy",
    question: "The oxidation number of chromium in K2Cr2O7 is:",
    options: ["+6", "+3", "+7", "+2"],
    correctIndex: 0,
    explanation: "In dichromate, each Cr has an oxidation state of +6 (2(+1) + 2x + 7(−2) = 0).",
    hint: "Balance the charges.",
  },
  {
    exam: "NEET", subject: "Chemistry", difficulty: "medium",
    question: "Which of the following is a strong electrolyte?",
    options: ["NaCl", "CH3COOH", "NH4OH", "H2CO3"],
    correctIndex: 0,
    explanation: "NaCl dissociates completely in water; the others are weak acids/bases.",
    hint: "Fully ionises.",
  },
  {
    exam: "NEET", subject: "Chemistry", difficulty: "hard",
    question: "Assertion (A): o-nitrophenol is more volatile than p-nitrophenol. Reason (R): o-nitrophenol shows intramolecular hydrogen bonding.",
    options: [
      "Both A and R are true and R is the correct explanation of A",
      "Both A and R are true but R is not the correct explanation of A",
      "A is true but R is false",
      "A is false but R is true",
    ],
    correctIndex: 0,
    explanation: "Intramolecular H-bonding in the ortho isomer prevents intermolecular association, making it more volatile — R correctly explains A.",
    hint: "Chelation lowers boiling point.",
  },
  {
    exam: "NEET", subject: "Chemistry", difficulty: "medium",
    question: "The number of moles of solute per litre of solution is called:",
    options: ["Molarity", "Molality", "Normality", "Mole fraction"],
    correctIndex: 0,
    explanation: "Molarity (M) is moles of solute divided by volume of solution in litres.",
    hint: "Per litre of solution.",
  },
  {
    exam: "NEET", subject: "Chemistry", difficulty: "easy",
    question: "Which gas is evolved when a metal reacts with a dilute acid?",
    options: ["Hydrogen", "Oxygen", "Carbon dioxide", "Chlorine"],
    correctIndex: 0,
    explanation: "Active metals displace hydrogen gas from dilute acids.",
    hint: "Pop test.",
  },
  {
    exam: "NEET", subject: "Chemistry", difficulty: "medium",
    question: "The most electronegative element in the periodic table is:",
    options: ["Fluorine", "Oxygen", "Chlorine", "Nitrogen"],
    correctIndex: 0,
    explanation: "Fluorine has the highest electronegativity (≈4.0 on the Pauling scale).",
    hint: "Top-right, small atom.",
  },
  {
    exam: "NEET", subject: "Chemistry", difficulty: "hard",
    question: "Which of the following statements about colligative properties is INCORRECT?",
    options: [
      "They depend on the nature of the solute particles",
      "They depend on the number of solute particles",
      "Elevation of boiling point is a colligative property",
      "Osmotic pressure is a colligative property",
    ],
    correctIndex: 0,
    explanation: "Colligative properties depend only on the NUMBER of solute particles, not their nature.",
    hint: "Count, not kind.",
  },
];

const NEET_PHYSICS: BankItem[] = [
  {
    exam: "NEET", subject: "Physics", difficulty: "medium",
    question: "A body moving with uniform circular motion has a net acceleration directed:",
    options: ["Towards the centre", "Along the tangent", "Away from the centre", "Zero"],
    correctIndex: 0,
    explanation: "Centripetal acceleration always points towards the centre of the circular path.",
    hint: "Centripetal.",
  },
  {
    exam: "NEET", subject: "Physics", difficulty: "easy",
    question: "The SI unit of electric charge is the:",
    options: ["Coulomb", "Ampere", "Volt", "Ohm"],
    correctIndex: 0,
    explanation: "Charge is measured in coulombs (C); 1 C = 1 A·s.",
    hint: "Ampere-second.",
  },
  {
    exam: "NEET", subject: "Physics", difficulty: "medium",
    question: "Two resistors of 3 Ω and 6 Ω are connected in parallel. The equivalent resistance is:",
    options: ["2 Ω", "9 Ω", "4.5 Ω", "18 Ω"],
    correctIndex: 0,
    explanation: "1/R = 1/3 + 1/6 = 1/2, so R = 2 Ω.",
    hint: "Product over sum.",
  },
  {
    exam: "NEET", subject: "Physics", difficulty: "hard",
    question: "A convex lens of focal length 10 cm forms a real image at 20 cm. The object distance is:",
    options: ["20 cm", "10 cm", "6.7 cm", "30 cm"],
    correctIndex: 0,
    explanation: "1/f = 1/v − 1/u ⇒ 1/10 = 1/20 − 1/u ⇒ u = −20 cm, so object is at 20 cm.",
    hint: "Use the lens formula with sign convention.",
  },
  {
    exam: "NEET", subject: "Physics", difficulty: "medium",
    question: "The work done by a centripetal force on a body in circular motion is:",
    options: ["Zero", "Positive", "Negative", "Equal to kinetic energy"],
    correctIndex: 0,
    explanation: "Centripetal force is perpendicular to displacement, so it does no work.",
    hint: "Force ⟂ velocity.",
  },
  {
    exam: "NEET", subject: "Physics", difficulty: "easy",
    question: "Which of the following is a scalar quantity?",
    options: ["Speed", "Velocity", "Acceleration", "Force"],
    correctIndex: 0,
    explanation: "Speed has only magnitude; the others have both magnitude and direction.",
    hint: "No direction.",
  },
  {
    exam: "NEET", subject: "Physics", difficulty: "medium",
    question: "The escape velocity from Earth's surface is approximately:",
    options: ["11.2 km/s", "9.8 km/s", "7.9 km/s", "15 km/s"],
    correctIndex: 0,
    explanation: "Escape velocity from Earth is about 11.2 km/s.",
    hint: "Just above 11 km/s.",
  },
  {
    exam: "NEET", subject: "Physics", difficulty: "hard",
    question: "Assertion (A): A person in a freely falling lift feels weightless. Reason (R): The normal reaction on the person becomes zero.",
    options: [
      "Both A and R are true and R is the correct explanation of A",
      "Both A and R are true but R is not the correct explanation of A",
      "A is true but R is false",
      "A is false but R is true",
    ],
    correctIndex: 0,
    explanation: "In free fall the lift and person accelerate together at g, so the normal reaction is zero — hence weightlessness, and R explains A.",
    hint: "Apparent weight = N.",
  },
  {
    exam: "NEET", subject: "Physics", difficulty: "medium",
    question: "The dimensional formula of momentum is:",
    options: ["[M L T⁻¹]", "[M L T⁻²]", "[M L² T⁻²]", "[M L⁻¹ T⁻¹]"],
    correctIndex: 0,
    explanation: "Momentum = mass × velocity = [M][L T⁻¹] = [M L T⁻¹].",
    hint: "mass × velocity.",
  },
  {
    exam: "NEET", subject: "Physics", difficulty: "easy",
    question: "According to Ohm's law, V = IR. If voltage doubles and resistance stays constant, the current:",
    options: ["Doubles", "Halves", "Stays the same", "Becomes four times"],
    correctIndex: 0,
    explanation: "I = V/R, so doubling V doubles I at constant R.",
    hint: "Directly proportional.",
  },
];

const OTHER_EXAMS: BankItem[] = [
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
    exam: "JEE", subject: "Chemistry", difficulty: "medium",
    question: "The hybridisation of carbon in methane (CH4) is:",
    options: ["sp3", "sp2", "sp", "dsp2"],
    correctIndex: 0,
    explanation: "Methane has four equivalent sigma bonds arranged tetrahedrally, so carbon is sp3 hybridised.",
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

const BANK: BankItem[] = [...NEET_BIOLOGY, ...NEET_CHEMISTRY, ...NEET_PHYSICS, ...OTHER_EXAMS];

function toQuestion(q: BankItem): GeneratedQuestion {
  // Shuffle answer order per question (anti-cheat: no memorizable positions).
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
}

export function getLocalQuestions(req: QuestionRequest): GeneratedQuestion[] {
  // Prefer exact exam + subject, then exam, then anything — never return empty.
  const tiers = [
    BANK.filter((q) => q.exam === req.exam && q.subject.toLowerCase() === req.subject.toLowerCase()),
    BANK.filter((q) => q.exam === req.exam),
    BANK,
  ];
  const pool = tiers.find((t) => t.length > 0)!;

  // Draw without repetition first; only if the caller wants more than the pool
  // holds do we reshuffle and continue — so consecutive draws avoid duplicates
  // as long as possible (Priority 3: no identical fallback set every ring).
  const picked: BankItem[] = [];
  let deck = shuffle(pool);
  while (picked.length < req.count) {
    if (deck.length === 0) deck = shuffle(pool);
    picked.push(deck.pop()!);
  }

  return picked.map(toQuestion);
}
