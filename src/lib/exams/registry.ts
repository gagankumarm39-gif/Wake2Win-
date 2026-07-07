/**
 * Extensible exam registry for the AI Test Generator & Notes Studio.
 *
 * Adding a future exam = adding one entry to TEST_EXAMS below — no schema
 * change, no new routes, no new components. Everything (wizard, prompts,
 * grading, notes) is driven by this definition.
 *
 * Client-safe: static metadata only.
 */

import type { SubjectiveKind } from "@/types/ai-studio";

export type ExamPaperStyle = "mcq" | "mcq-numerical" | "subjective";

export interface SubjectiveSection {
  kind: SubjectiveKind;
  label: string;
  marks: number;
  /** Share of the paper (all shares across sections sum to 1). */
  share: number;
}

export interface OfficialPattern {
  label: string;
  totalQuestions: number;
  totalMarks: number;
  durationMinutes: number;
  /** Question count per subject, e.g. { Physics: 45, … }. */
  subjectCounts: Record<string, number>;
}

export interface ExamDefinition {
  id: string;
  name: string;
  short: string;
  tagline: string;
  paperStyle: ExamPaperStyle;
  /** Subject → chapter list. */
  subjects: Record<string, string[]>;
  marking: { correct: number; incorrect: number };
  /** Fraction of questions that are numerical (mcq-numerical style only). */
  numericalShare?: number;
  /** Subjective paper structure (subjective style only). */
  subjectiveSections?: SubjectiveSection[];
  defaultDurationMinutes: number;
  defaultQuestionCount: number;
  supportsNegativeMarking: boolean;
  officialPattern?: OfficialPattern;
}

/* ── Chapter lists (Indian syllabus, class 11 + 12 where applicable) ── */

const PHYSICS = [
  "Units and Measurement", "Motion in a Straight Line", "Motion in a Plane",
  "Laws of Motion", "Work, Energy and Power", "Rotational Motion", "Gravitation",
  "Mechanical Properties of Solids", "Mechanical Properties of Fluids",
  "Thermal Properties of Matter", "Thermodynamics", "Kinetic Theory",
  "Oscillations", "Waves", "Electric Charges and Fields",
  "Electrostatic Potential and Capacitance", "Current Electricity",
  "Moving Charges and Magnetism", "Magnetism and Matter",
  "Electromagnetic Induction", "Alternating Current", "Electromagnetic Waves",
  "Ray Optics", "Wave Optics", "Dual Nature of Radiation and Matter",
  "Atoms", "Nuclei", "Semiconductor Electronics",
];

const CHEMISTRY = [
  "Some Basic Concepts of Chemistry", "Structure of Atom",
  "Classification of Elements and Periodicity", "Chemical Bonding and Molecular Structure",
  "States of Matter", "Thermodynamics", "Equilibrium", "Redox Reactions",
  "Hydrogen", "The s-Block Elements", "The p-Block Elements",
  "Organic Chemistry: Basic Principles", "Hydrocarbons", "Environmental Chemistry",
  "Solutions", "Electrochemistry", "Chemical Kinetics", "Surface Chemistry",
  "The d- and f-Block Elements", "Coordination Compounds",
  "Haloalkanes and Haloarenes", "Alcohols, Phenols and Ethers",
  "Aldehydes, Ketones and Carboxylic Acids", "Amines", "Biomolecules",
  "Polymers", "Chemistry in Everyday Life",
];

const MATHS = [
  "Sets", "Relations and Functions", "Trigonometric Functions",
  "Complex Numbers and Quadratic Equations", "Linear Inequalities",
  "Permutations and Combinations", "Binomial Theorem", "Sequences and Series",
  "Straight Lines", "Conic Sections", "Introduction to 3D Geometry",
  "Limits and Derivatives", "Mathematical Reasoning", "Statistics", "Probability",
  "Inverse Trigonometric Functions", "Matrices", "Determinants",
  "Continuity and Differentiability", "Application of Derivatives",
  "Integrals", "Application of Integrals", "Differential Equations",
  "Vector Algebra", "Three Dimensional Geometry", "Linear Programming",
];

const BOTANY = [
  "The Living World", "Biological Classification", "Plant Kingdom",
  "Morphology of Flowering Plants", "Anatomy of Flowering Plants",
  "Cell: The Unit of Life", "Cell Cycle and Cell Division",
  "Photosynthesis in Higher Plants", "Respiration in Plants",
  "Plant Growth and Development", "Sexual Reproduction in Flowering Plants",
  "Principles of Inheritance and Variation", "Molecular Basis of Inheritance",
  "Microbes in Human Welfare", "Organisms and Populations", "Ecosystem",
  "Biodiversity and Conservation",
];

const ZOOLOGY = [
  "Animal Kingdom", "Structural Organisation in Animals", "Biomolecules",
  "Breathing and Exchange of Gases", "Body Fluids and Circulation",
  "Excretory Products and their Elimination", "Locomotion and Movement",
  "Neural Control and Coordination", "Chemical Coordination and Integration",
  "Human Reproduction", "Reproductive Health", "Human Health and Disease",
  "Evolution", "Biotechnology: Principles and Processes",
  "Biotechnology and its Applications",
];

const BIOLOGY = [...BOTANY, ...ZOOLOGY];

const ENGLISH_CORE = [
  "Reading Comprehension", "Note Making and Summarising", "Notices and Advertisements",
  "Letter Writing", "Article and Report Writing", "Grammar and Usage",
  "Flamingo: Prose", "Flamingo: Poetry", "Vistas: Supplementary Reader",
];

/* ── The registry ── */

export const TEST_EXAMS: Record<string, ExamDefinition> = {
  neet: {
    id: "neet",
    name: "NEET UG",
    short: "NEET",
    tagline: "Medical entrance · 720 marks",
    paperStyle: "mcq",
    subjects: { Physics: PHYSICS, Chemistry: CHEMISTRY, Botany: BOTANY, Zoology: ZOOLOGY },
    marking: { correct: 4, incorrect: 1 },
    defaultDurationMinutes: 180,
    defaultQuestionCount: 45,
    supportsNegativeMarking: true,
    officialPattern: {
      label: "Official NEET pattern — 180 questions · 720 marks · 3 hours",
      totalQuestions: 180,
      totalMarks: 720,
      durationMinutes: 180,
      subjectCounts: { Physics: 45, Chemistry: 45, Botany: 45, Zoology: 45 },
    },
  },
  "jee-main": {
    id: "jee-main",
    name: "JEE Main",
    short: "JEE Main",
    tagline: "Engineering entrance · 300 marks",
    paperStyle: "mcq-numerical",
    subjects: { Physics: PHYSICS, Chemistry: CHEMISTRY, Mathematics: MATHS },
    marking: { correct: 4, incorrect: 1 },
    numericalShare: 0.2,
    defaultDurationMinutes: 180,
    defaultQuestionCount: 30,
    supportsNegativeMarking: true,
    officialPattern: {
      label: "Official JEE Main pattern — 75 questions · 300 marks · 3 hours",
      totalQuestions: 75,
      totalMarks: 300,
      durationMinutes: 180,
      subjectCounts: { Physics: 25, Chemistry: 25, Mathematics: 25 },
    },
  },
  "jee-advanced": {
    id: "jee-advanced",
    name: "JEE Advanced",
    short: "JEE Adv",
    tagline: "IIT entrance · concept-heavy",
    paperStyle: "mcq-numerical",
    subjects: { Physics: PHYSICS, Chemistry: CHEMISTRY, Mathematics: MATHS },
    marking: { correct: 4, incorrect: 2 },
    numericalShare: 0.35,
    defaultDurationMinutes: 180,
    defaultQuestionCount: 30,
    supportsNegativeMarking: true,
  },
  kcet: {
    id: "kcet",
    name: "KCET",
    short: "KCET",
    tagline: "Karnataka CET · no negative marking",
    paperStyle: "mcq",
    subjects: { Physics: PHYSICS, Chemistry: CHEMISTRY, Mathematics: MATHS, Biology: BIOLOGY },
    marking: { correct: 1, incorrect: 0 },
    defaultDurationMinutes: 80,
    defaultQuestionCount: 60,
    supportsNegativeMarking: false,
  },
  comedk: {
    id: "comedk",
    name: "COMEDK UGET",
    short: "COMEDK",
    tagline: "Karnataka private colleges · 180 marks",
    paperStyle: "mcq",
    subjects: { Physics: PHYSICS, Chemistry: CHEMISTRY, Mathematics: MATHS },
    marking: { correct: 1, incorrect: 0 },
    defaultDurationMinutes: 180,
    defaultQuestionCount: 60,
    supportsNegativeMarking: false,
    officialPattern: {
      label: "Official COMEDK pattern — 180 questions · 180 marks · 3 hours",
      totalQuestions: 180,
      totalMarks: 180,
      durationMinutes: 180,
      subjectCounts: { Physics: 60, Chemistry: 60, Mathematics: 60 },
    },
  },
  cbse: {
    id: "cbse",
    name: "CBSE Board (XII)",
    short: "CBSE",
    tagline: "Subjective board papers",
    paperStyle: "subjective",
    subjects: {
      Physics: PHYSICS,
      Chemistry: CHEMISTRY,
      Mathematics: MATHS,
      Biology: BIOLOGY,
      English: ENGLISH_CORE,
    },
    marking: { correct: 1, incorrect: 0 },
    subjectiveSections: [
      { kind: "vsa", label: "Very Short Answer", marks: 2, share: 0.35 },
      { kind: "sa", label: "Short Answer", marks: 3, share: 0.3 },
      { kind: "la", label: "Long Answer", marks: 5, share: 0.2 },
      { kind: "case", label: "Case Study", marks: 4, share: 0.15 },
    ],
    defaultDurationMinutes: 180,
    defaultQuestionCount: 20,
    supportsNegativeMarking: false,
  },
  "karnataka-board": {
    id: "karnataka-board",
    name: "Karnataka Board (II PUC)",
    short: "KAR Board",
    tagline: "PUC subjective papers",
    paperStyle: "subjective",
    subjects: {
      Physics: PHYSICS,
      Chemistry: CHEMISTRY,
      Mathematics: MATHS,
      Biology: BIOLOGY,
      English: ENGLISH_CORE,
    },
    marking: { correct: 1, incorrect: 0 },
    subjectiveSections: [
      { kind: "vsa", label: "Very Short Answer", marks: 1, share: 0.35 },
      { kind: "sa", label: "Short Answer", marks: 3, share: 0.3 },
      { kind: "la", label: "Long Answer", marks: 5, share: 0.2 },
      { kind: "case", label: "Case / Source Based", marks: 4, share: 0.15 },
    ],
    defaultDurationMinutes: 195,
    defaultQuestionCount: 20,
    supportsNegativeMarking: false,
  },
  upsc: {
    id: "upsc",
    name: "UPSC Prelims (GS-I)",
    short: "UPSC",
    tagline: "Civil services · GS Paper I",
    paperStyle: "mcq",
    subjects: {
      Polity: [
        "Constitution: Historical Underpinnings", "Fundamental Rights and Duties",
        "Union and State Executive", "Parliament and State Legislatures", "Judiciary",
        "Federalism and Centre-State Relations", "Local Government and Panchayati Raj",
        "Constitutional and Non-Constitutional Bodies", "Elections and RPA",
      ],
      History: [
        "Ancient India", "Medieval India", "Modern India: Advent of Europeans",
        "Revolt of 1857", "Indian National Movement 1885-1919",
        "Gandhian Era 1919-1947", "Art and Culture", "Post-Independence India",
      ],
      Geography: [
        "Geomorphology", "Climatology", "Oceanography", "Indian Physical Geography",
        "Indian Climate and Monsoon", "Drainage Systems", "Agriculture and Soils",
        "Minerals, Industry and Infrastructure", "World Geography Highlights",
      ],
      Economy: [
        "National Income and Growth", "Money and Banking", "Inflation",
        "Fiscal Policy and Budget", "External Sector and Trade",
        "Agriculture and Food Management", "Industry and Services",
        "Poverty, Employment and Inclusion", "Economic Survey Themes",
      ],
      Environment: [
        "Ecology Fundamentals", "Biodiversity and Conservation",
        "Climate Change and Agreements", "Environmental Pollution",
        "Protected Areas and Legislation", "Sustainable Development",
      ],
      "Science & Tech": [
        "Space Technology", "Biotechnology", "IT and Communication",
        "Defence Technology", "Energy and Nuclear", "Everyday Science",
      ],
    },
    marking: { correct: 2, incorrect: 0.66 },
    defaultDurationMinutes: 120,
    defaultQuestionCount: 50,
    supportsNegativeMarking: true,
    officialPattern: {
      label: "Official Prelims GS-I — 100 questions · 200 marks · 2 hours",
      totalQuestions: 100,
      totalMarks: 200,
      durationMinutes: 120,
      subjectCounts: { Polity: 18, History: 16, Geography: 16, Economy: 16, Environment: 18, "Science & Tech": 16 },
    },
  },
  ssc: {
    id: "ssc",
    name: "SSC CGL (Tier I)",
    short: "SSC",
    tagline: "Staff Selection · Tier I pattern",
    paperStyle: "mcq",
    subjects: {
      "Quantitative Aptitude": [
        "Number System", "Percentage", "Ratio and Proportion", "Averages",
        "Profit and Loss", "Simple and Compound Interest", "Time and Work",
        "Time, Speed and Distance", "Algebra", "Geometry", "Mensuration",
        "Trigonometry", "Data Interpretation",
      ],
      Reasoning: [
        "Analogy", "Classification", "Series", "Coding-Decoding",
        "Blood Relations", "Direction Sense", "Syllogism", "Venn Diagrams",
        "Puzzles and Seating", "Non-Verbal Reasoning",
      ],
      English: [
        "Reading Comprehension", "Cloze Test", "Error Spotting",
        "Sentence Improvement", "Fill in the Blanks", "Synonyms and Antonyms",
        "Idioms and Phrases", "One Word Substitution", "Active-Passive and Narration",
      ],
      "General Awareness": [
        "Indian History", "Indian Polity", "Geography", "Economy",
        "General Science", "Static GK", "Current Affairs",
      ],
    },
    marking: { correct: 2, incorrect: 0.5 },
    defaultDurationMinutes: 60,
    defaultQuestionCount: 50,
    supportsNegativeMarking: true,
    officialPattern: {
      label: "Official Tier I — 100 questions · 200 marks · 1 hour",
      totalQuestions: 100,
      totalMarks: 200,
      durationMinutes: 60,
      subjectCounts: { "Quantitative Aptitude": 25, Reasoning: 25, English: 25, "General Awareness": 25 },
    },
  },
  cuet: {
    id: "cuet",
    name: "CUET UG",
    short: "CUET",
    tagline: "Central universities entrance",
    paperStyle: "mcq",
    subjects: {
      Physics: PHYSICS,
      Chemistry: CHEMISTRY,
      Mathematics: MATHS,
      Biology: BIOLOGY,
      English: ENGLISH_CORE,
      "General Test": [
        "General Knowledge", "Current Affairs", "Numerical Ability",
        "Quantitative Reasoning", "Logical and Analytical Reasoning",
      ],
    },
    marking: { correct: 5, incorrect: 1 },
    defaultDurationMinutes: 60,
    defaultQuestionCount: 40,
    supportsNegativeMarking: true,
  },
};

export const TEST_EXAM_ORDER = Object.keys(TEST_EXAMS);

export function getExam(id: string): ExamDefinition | null {
  return TEST_EXAMS[id] ?? null;
}

export const QUESTION_COUNT_PRESETS = [30, 45, 60, 90, 180] as const;

export const SUBJECTIVE_KIND_LABELS: Record<SubjectiveKind, string> = {
  vsa: "Very Short Answer",
  sa: "Short Answer",
  la: "Long Answer",
  case: "Case Study",
};

/** Sensible time limit when the student doesn't pick one: ~72s per question. */
export function suggestedDuration(exam: ExamDefinition, questionCount: number): number {
  if (exam.officialPattern && questionCount === exam.officialPattern.totalQuestions) {
    return exam.officialPattern.durationMinutes;
  }
  return Math.max(10, Math.round((questionCount * 72) / 60 / 5) * 5);
}
