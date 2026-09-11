export type View = 'day' | 'teaching' | 'feedback' | 'schedule' | 'cases';
export type Course = {
  id: string;
  title: string;
  subject: string;
  group: string;
  tone: string;
  description: string;
  period: string;
  lessons: string[];
};
export const courses: Course[] = [
  {
    id: 'argument',
    title: 'Ord som gör skillnad',
    subject: 'Svenska',
    group: '8A',
    tone: 'blue',
    description: 'Att formulera en tes, ge belägg och bemöta en invändning.',
    period: '31 aug – 18 sep',
    lessons: [
      'Vad får oss att lyssna?',
      'Tes, argument och belägg',
      'Från första utkast till tydligt argument',
      'Att bemöta en invändning',
      'Bearbeta med respons',
      'Dela och reflektera',
    ],
  },
  {
    id: 'reading',
    title: 'Läs mellan raderna',
    subject: 'Svenska',
    group: '8B',
    tone: 'violet',
    description: 'Utforska berättarperspektiv och det som inte sägs rakt ut.',
    period: '31 aug – 11 sep',
    lessons: [
      'En berättelse, flera perspektiv',
      'Vad säger texten mellan raderna?',
      'Samtala med stöd i texten',
      'Pröva ett annat perspektiv',
      'Sammanfatta vår läsning',
    ],
  },
  {
    id: 'mentor',
    title: 'Veckan tillsammans',
    subject: 'Mentorstid',
    group: '8A',
    tone: 'green',
    description: 'Planera veckan, dela erfarenheter och lyssna på varandra.',
    period: 'Höstterminen 2026',
    lessons: ['Stäm av veckan', 'Planera tillsammans', 'Avslutande reflektion'],
  },
];
export type Feedback = { student: string; text: string; revision: number };
export const students = [
  {
    id: 'e14',
    name: 'Testelev 014',
    initials: '14',
    text: 'Skolan bör skapa fler lugna arbetsplatser. Det skulle hjälpa eleverna att koncentrera sig bättre. Alla behöver ibland kunna arbeta i lugn och ro.',
    revision:
      'Skolan bör skapa fler lugna arbetsplatser. När flera samtal pågår tappar jag tråden i texten. En lugn arbetsplats kan därför göra det lättare att hålla kvar tanken. Någon kanske tycker att grupprum räcker, men de är inte alltid lediga.',
  },
  {
    id: 'e08',
    name: 'Testelev 008',
    initials: '08',
    text: 'Vi borde ha mer lästid i skolan. Läsning gör att vi lär oss nya ord. Om vi läser varje dag kan vi bli bättre på att förstå svåra texter.',
    revision:
      'Vi borde ha mer gemensam lästid. I vår läslogg såg jag hur nya ord blev lättare att förstå när vi pratade om dem. Därför tycker jag att lästid ska kombineras med korta samtal.',
  },
  {
    id: 'e21',
    name: 'Testelev 021',
    initials: '21',
    text: 'Skolan behöver fler cykelställ. Det är ofta fullt på morgonen och då står cyklarna i vägen. Fler cykelställ skulle göra det enklare att cykla till skolan.',
    revision:
      'Skolan behöver fler cykelställ nära entrén. Tre morgnar i rad har jag sett cyklar stå framför gången eftersom ställen var fulla. Med fler platser kan gången hållas fri.',
  },
];
export const initialTasks = [
  {
    id: 'delivery',
    title: 'Bekräfta att insatsen genomförts',
    owner: 'Alex Lind · Lärare',
    done: true,
  },
  {
    id: 'voice',
    title: 'Följ upp elevens erfarenhet',
    owner: 'Alex Lind · Mentor',
    done: false,
  },
  {
    id: 'effect',
    title: 'Bedöm effekt och fortsatt behov',
    owner: 'Robin Berg · Ansvarig rektor',
    done: false,
  },
];
export function closureReasons(tasks: { done: boolean }[], conclusion: string) {
  const reasons = [];
  if (tasks.some((t) => !t.done))
    reasons.push('Alla uppföljningsuppgifter är inte klara.');
  if (!conclusion.trim())
    reasons.push('Avslutsgrund och fortsatt ansvar behöver dokumenteras.');
  return reasons;
}
export function weekDates(offset: number) {
  const monday = new Date(Date.UTC(2026, 7, 31 + offset * 7));
  return Array.from(
    { length: 5 },
    (_, i) => new Date(monday.getTime() + i * 86400000),
  );
}
