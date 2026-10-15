// The categories of the filmy awards handed out after each game, and a pool of
// Bollywood-flavoured names for each. Every game draws a fresh name per category
// (avoiding the room's recent ones); with an Anthropic key, Claude then writes
// brand-new names themed on that game (src/worker/ai.ts).

export interface AwardName {
  title: string
  /** A dialogue, pun or one-liner under the title. */
  line: string
}

export interface AwardCategory {
  id: string
  /** What the award is for, in plain words (also what the AI is told). */
  meaning: string
  names: AwardName[]
}

export const AWARD_CATEGORIES: AwardCategory[] = [
  {
    id: 'dhoom',
    meaning: 'the single fastest right answer of the game',
    names: [
      { title: 'Dhoom Machale', line: 'Fastest answer of the night' },
      { title: 'Bhaag Milkha Bhaag', line: 'Sprinted past everyone to the answer' },
      { title: 'Rocket Singh', line: 'Launched before the song even landed' },
      { title: 'Race 4', line: 'Even Saif’s car chases looked slow' },
      { title: 'Chennai Express', line: 'Arrived on time — unlike the train' },
      { title: 'Tez', line: 'Blink and you missed this answer' },
      { title: 'Pathaan Ki Speed', line: 'Zinda hai, aur bahut fast hai' },
    ],
  },
  {
    id: 'don',
    meaning: 'the longest streak of right answers in a row',
    names: [
      { title: 'Don', line: '“Don ko pakadna mushkil hi nahi, namumkin hai”' },
      { title: 'Rukna Nahi Hai, Bunny', line: '“Main udna chahta hoon… bas rukna nahi chahta”' },
      { title: 'Sultan', line: 'Pinned round after round to the mat' },
      { title: 'Singham Returns', line: 'Kept coming back, every single song' },
      { title: 'Lakshya', line: 'Locked on target and never blinked' },
      { title: 'Ziddi', line: 'Refused to get a single one wrong' },
    ],
  },
  {
    id: 'perfectionist',
    meaning: 'the best accuracy (share of right answers)',
    names: [
      { title: 'Mr. Perfectionist', line: 'Barely missed a beat' },
      { title: 'Kaabil', line: '“Kaabil bano… kaamyaabi jhak maarke aayegi”' },
      { title: 'Drishyam', line: 'Remembered every detail, 2nd October style' },
      { title: 'Rancho Certified', line: 'Aal izz well — and all answers right' },
      { title: 'Taare Zameen Par', line: 'Saw what everyone else missed' },
      { title: 'Sau Taka Sach', line: 'No guesswork, only facts' },
    ],
  },
  {
    id: 'baazigar',
    meaning: 'the biggest comeback up the leaderboard',
    names: [
      { title: 'Baazigar', line: '“Haar kar jeetne waale ko Baazigar kehte hain”' },
      { title: 'Mere Karan Arjun Aayenge', line: 'And boy, did they come back' },
      { title: 'Gadar 2', line: 'The sequel nobody saw coming' },
      { title: 'Ghajini Mode', line: 'Forgot they were losing' },
      { title: 'Rocky Aur Rani Ki Comeback Kahaani', line: 'From the bottom to the podium' },
    ],
  },
  {
    id: 'bullet-raja',
    meaning: 'the most "first right answer" bonuses',
    names: [
      { title: 'Bullet Raja', line: 'First to the right answer, again and again' },
      { title: 'Line Yahin Se Shuru', line: '“Hum jahan khade ho jaate hain, line wahin se shuru hoti hai”' },
      { title: 'Coolie No. 1', line: 'Number one, every time' },
      { title: 'First Day First Show', line: 'Always first in the queue' },
      { title: 'Pehla Nasha', line: 'Addicted to being first' },
    ],
  },
  {
    id: 'main-hoon-na',
    meaning: 'getting songs or questions that nobody else got',
    names: [
      { title: 'Main Hoon Na', line: 'Came through when nobody else could' },
      { title: 'Mere Paas Answer Hai', line: '“Tumhare paas kya hai?”' },
      { title: 'Swades', line: 'Knew the one nobody else did' },
      { title: 'Akela', line: 'A one-person rescue mission' },
      { title: 'Ek Tha Tiger', line: 'Hunted alone, and got it' },
    ],
  },
  {
    id: 'tareekh',
    meaning: 'the slowest average right answer (a friendly roast)',
    names: [
      { title: 'Tareekh Pe Tareekh', line: 'Got there… eventually' },
      { title: 'Kal Ho Naa Ho', line: 'Answered like there’s always tomorrow' },
      { title: 'Sattar Minute', line: 'Treated every timer like seventy minutes' },
      { title: 'Jab Tak Hai Jaan', line: 'Took their sweet, sweet time' },
      { title: 'Dheere Dheere Se', line: 'Slow and steady, Honey Singh style' },
    ],
  },
  {
    id: 'picture',
    meaning: 'nailing the final question of the game',
    names: [
      { title: 'Picture Abhi Baaki Hai', line: 'Saved the best for the last one' },
      { title: 'Climax Ka Hero', line: 'Showed up right before the end credits' },
      { title: 'Lagaan Last Ball', line: 'Hit the final delivery for six' },
      { title: 'Interval Ke Baad', line: 'The second half belonged to them' },
      { title: 'The End… Nahi, Twist!', line: 'Took the final round home' },
    ],
  },
  {
    id: 'superstar',
    meaning: 'in a Blend game, the player whose songs the room knew best',
    names: [
      { title: 'Superstar', line: 'Everyone knew their songs' },
      { title: 'Rockstar', line: 'Their playlist got a standing ovation' },
      { title: 'Kabhi Khushi Kabhie Gham', line: 'The whole family sang along' },
      { title: 'Hit Machine', line: 'Only chartbusters in that library' },
    ],
  },
  {
    id: 'mr-india',
    meaning: 'in a Blend game, the player whose songs stumped everyone',
    names: [
      { title: 'Mr. India', line: 'Their songs stayed invisible' },
      { title: 'Kahaani', line: 'Nobody solved their playlist' },
      { title: 'Gupt', line: 'Their taste is a well-kept secret' },
      { title: 'Underground Hero', line: 'Too indie for this room' },
    ],
  },
  {
    id: 'risk',
    meaning: 'the most wrong answers (bold guesses that missed)',
    names: [
      { title: 'Golmaal', line: '“Golmaal hai bhai sab golmaal hai”' },
      { title: 'Hera Pheri', line: 'Confident, quick… and wrong' },
      { title: 'Andaz Apna Apna', line: 'Galti se mistake ho gaya' },
      { title: 'Khiladi 420', line: 'Gambled on every round' },
      { title: 'Dil Hai Ki Maanta Nahi', line: 'Kept guessing anyway' },
    ],
  },
  {
    id: 'ghost',
    meaning: 'the most questions left unanswered',
    names: [
      { title: 'Itna Sannata Kyun Hai?', line: 'Not a peep for most of the game' },
      { title: 'Khamosh!', line: 'Shatrughan-level silence' },
      { title: 'Bhool Bhulaiyaa', line: 'Lost somewhere in the haveli' },
      { title: 'Chup Chup Ke', line: 'Hid from the answer buttons' },
    ],
  },
]

export const AWARD_IDS = AWARD_CATEGORIES.map((c) => c.id)

/** One name per category for this game, avoiding names the room saw recently. */
export function pickAwardNames(rand: () => number, recent: readonly string[] = []): Record<string, AwardName> {
  const seen = new Set(recent.map((t) => t.toLowerCase()))
  const out: Record<string, AwardName> = {}
  for (const c of AWARD_CATEGORIES) {
    const fresh = c.names.filter((n) => !seen.has(n.title.toLowerCase()))
    const pool = fresh.length ? fresh : c.names
    out[c.id] = pool[Math.floor(rand() * pool.length)]!
  }
  return out
}
