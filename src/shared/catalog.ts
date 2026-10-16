// Song sources a host can pick. Everything here resolves to iTunes Search API
// calls (free, no key, 30-second previews) made by the host's browser.

export const REGIONS = [
  { code: 'in', label: 'India' },
  { code: 'us', label: 'United States' },
  { code: 'gb', label: 'United Kingdom' },
  { code: 'ca', label: 'Canada' },
  { code: 'au', label: 'Australia' },
  { code: 'kr', label: 'South Korea' },
  { code: 'br', label: 'Brazil' },
  { code: 'mx', label: 'Mexico' },
  { code: 'fr', label: 'France' },
  { code: 'de', label: 'Germany' },
  { code: 'jp', label: 'Japan' },
] as const

export type RegionCode = (typeof REGIONS)[number]['code']
export const REGION_CODES = REGIONS.map((r) => r.code) as [RegionCode, ...RegionCode[]]

export type PresetGroup = 'charts' | 'decades' | 'genres' | 'desi' | 'moods' | 'world'

export const PRESET_GROUPS: { id: PresetGroup; label: string }[] = [
  { id: 'charts', label: 'Top Charts' },
  { id: 'desi', label: 'Desi' },
  { id: 'decades', label: 'Decades' },
  { id: 'genres', label: 'Genres' },
  { id: 'moods', label: 'Moods' },
  { id: 'world', label: 'World' },
]

interface PresetBase {
  id: string
  name: string
  blurb: string
  emoji: string
  /** Two colors used to paint the tile artwork. */
  colors: [string, string]
  group: PresetGroup
}

/** Live "top songs" chart from the iTunes store. */
export interface ChartPreset extends PresetBase {
  kind: 'chart'
  genre?: number
  /** Fixed store country. When absent the room's region is used. */
  country?: RegionCode
}

/** A mix built from several artist (or keyword) searches, optionally limited to a year range. */
export interface MixPreset extends PresetBase {
  kind: 'mix'
  artists?: string[]
  terms?: string[]
  years?: [number, number]
  country?: RegionCode
}

export type Preset = ChartPreset | MixPreset

export const PRESETS: Preset[] = [
  // ---- Live charts -------------------------------------------------------
  { kind: 'chart', id: 'top-songs', group: 'charts', name: 'Top Songs', blurb: 'What your region is playing right now', emoji: '🔥', colors: ['#f97316', '#db2777'] },
  { kind: 'chart', id: 'chart-bollywood', group: 'charts', genre: 1263, country: 'in', name: 'Bollywood Now', blurb: 'Current Bollywood chart', emoji: '🎬', colors: ['#f59e0b', '#dc2626'] },
  { kind: 'chart', id: 'chart-pop', group: 'charts', genre: 14, name: 'Pop Chart', blurb: 'Today’s biggest pop songs', emoji: '🎤', colors: ['#ec4899', '#8b5cf6'] },
  { kind: 'chart', id: 'chart-hiphop', group: 'charts', genre: 18, country: 'us', name: 'Hip-Hop Chart', blurb: 'US hip-hop & rap chart', emoji: '🎧', colors: ['#facc15', '#16a34a'] },
  { kind: 'chart', id: 'chart-rock', group: 'charts', genre: 21, country: 'us', name: 'Rock Chart', blurb: 'US rock chart', emoji: '🎸', colors: ['#ef4444', '#111827'] },
  { kind: 'chart', id: 'chart-dance', group: 'charts', genre: 17, country: 'us', name: 'Dance Chart', blurb: 'Dance & house hits', emoji: '🪩', colors: ['#06b6d4', '#7c3aed'] },
  { kind: 'chart', id: 'chart-country', group: 'charts', genre: 6, country: 'us', name: 'Country Chart', blurb: 'US country chart', emoji: '🤠', colors: ['#d97706', '#78350f'] },
  { kind: 'chart', id: 'chart-latin', group: 'charts', genre: 12, country: 'mx', name: 'Latin Chart', blurb: 'Reggaeton, pop latino & more', emoji: '💃', colors: ['#f43f5e', '#f59e0b'] },
  { kind: 'chart', id: 'chart-tamil', group: 'charts', genre: 1264, country: 'in', name: 'Tamil Chart', blurb: 'Current Tamil hits', emoji: '🌴', colors: ['#10b981', '#0e7490'] },
  { kind: 'chart', id: 'chart-telugu', group: 'charts', genre: 1265, country: 'in', name: 'Telugu Chart', blurb: 'Current Telugu hits', emoji: '🌶️', colors: ['#dc2626', '#9333ea'] },
  { kind: 'chart', id: 'chart-indian-pop', group: 'charts', genre: 1185, country: 'in', name: 'Indian Pop Chart', blurb: 'Indie-pop & non-film hits', emoji: '🎙️', colors: ['#f472b6', '#0d9488'] },
  { kind: 'chart', id: 'chart-sufi', group: 'charts', genre: 1268, country: 'in', name: 'Sufi Chart', blurb: 'Qawwali, sufi & ghazal favourites', emoji: '🕌', colors: ['#0f766e', '#a16207'] },
  { kind: 'chart', id: 'chart-devotional', group: 'charts', genre: 1267, country: 'in', name: 'Devotional Chart', blurb: 'Bhajans, aartis & chants', emoji: '🪔', colors: ['#f59e0b', '#b91c1c'] },
  { kind: 'chart', id: 'chart-us', group: 'charts', country: 'us', name: 'US Top Songs', blurb: 'The US chart right now', emoji: '🇺🇸', colors: ['#2563eb', '#dc2626'] },
  { kind: 'chart', id: 'chart-uk', group: 'charts', country: 'gb', name: 'UK Top Songs', blurb: 'The UK chart right now', emoji: '🇬🇧', colors: ['#1d4ed8', '#be123c'] },
  { kind: 'chart', id: 'chart-alternative', group: 'charts', genre: 20, country: 'us', name: 'Alternative Chart', blurb: 'Indie & alt-rock right now', emoji: '🌀', colors: ['#14b8a6', '#4c1d95'] },
  { kind: 'chart', id: 'chart-rnb', group: 'charts', genre: 15, country: 'us', name: 'R&B Chart', blurb: 'R&B and soul right now', emoji: '🌹', colors: ['#be123c', '#4c1d95'] },
  { kind: 'chart', id: 'chart-electronic', group: 'charts', genre: 7, country: 'us', name: 'Electronic Chart', blurb: 'House, techno & electronica', emoji: '🎛️', colors: ['#0ea5e9', '#a21caf'] },
  { kind: 'chart', id: 'chart-jpop', group: 'charts', genre: 27, country: 'jp', name: 'J-Pop Chart', blurb: 'What Japan is playing', emoji: '🗾', colors: ['#f43f5e', '#f9a8d4'] },
  { kind: 'chart', id: 'chart-brazil', group: 'charts', country: 'br', name: 'Brazil Top Songs', blurb: 'Sertanejo, funk & pop', emoji: '🇧🇷', colors: ['#16a34a', '#facc15'] },
  { kind: 'chart', id: 'chart-reggae', group: 'charts', genre: 24, country: 'us', name: 'Reggae Chart', blurb: 'Reggae & dancehall favourites', emoji: '🇯🇲', colors: ['#16a34a', '#eab308'] },
  { kind: 'chart', id: 'chart-jazz', group: 'charts', genre: 11, country: 'us', name: 'Jazz Chart', blurb: 'Jazz standards & new jazz', emoji: '🎷', colors: ['#92400e', '#1e3a8a'] },

  // ---- Desi --------------------------------------------------------------
  {
    kind: 'mix', id: 'bollywood-hits', group: 'desi', country: 'in', name: 'Bollywood Hits', blurb: 'Modern Bollywood favourites', emoji: '💖', colors: ['#e11d48', '#f59e0b'],
    artists: ['Arijit Singh', 'Shreya Ghoshal', 'Jubin Nautiyal', 'Neha Kakkar', 'Pritam', 'Vishal Mishra', 'Darshan Raval', 'B Praak', 'Sachet Tandon', 'Atif Aslam', 'Vishal-Shekhar', 'Sachin-Jigar'],
    years: [2010, 2030],
  },
  {
    kind: 'mix', id: 'bollywood-90s', group: 'desi', country: 'in', name: '90s Bollywood', blurb: 'Kumar Sanu, Udit, Alka & the golden 90s', emoji: '📼', colors: ['#7c3aed', '#db2777'],
    artists: ['Kumar Sanu', 'Udit Narayan', 'Alka Yagnik', 'Sonu Nigam', 'Abhijeet', 'Kavita Krishnamurthy', 'Nadeem-Shravan', 'Jatin-Lalit', 'Anu Malik', 'A.R. Rahman'],
  },
  {
    kind: 'mix', id: 'bollywood-2000s', group: 'desi', country: 'in', name: '2000s Bollywood', blurb: 'KK, Shaan, Atif & the 2000s', emoji: '💿', colors: ['#2563eb', '#db2777'],
    artists: ['KK', 'Shaan', 'Atif Aslam', 'Mohit Chauhan', 'Sunidhi Chauhan', 'Himesh Reshammiya', 'Shankar-Ehsaan-Loy', 'Vishal-Shekhar', 'Pritam', 'Shreya Ghoshal', 'Javed Ali'],
  },
  {
    kind: 'mix', id: 'retro-bollywood', group: 'desi', country: 'in', name: 'Retro Classics', blurb: 'Kishore, Rafi, Lata & Asha', emoji: '🎙️', colors: ['#a16207', '#7f1d1d'],
    artists: ['Kishore Kumar', 'Mohd. Rafi', 'Lata Mangeshkar', 'Asha Bhosle', 'R. D. Burman', 'Mukesh', 'Kalyanji-Anandji', 'Laxmikant-Pyarelal'],
  },
  {
    kind: 'mix', id: 'punjabi', group: 'desi', country: 'in', name: 'Punjabi Bangers', blurb: 'Diljit, Sidhu, AP Dhillon, Karan Aujla', emoji: '🥁', colors: ['#f59e0b', '#16a34a'],
    artists: ['Diljit Dosanjh', 'Sidhu Moose Wala', 'AP Dhillon', 'Karan Aujla', 'Guru Randhawa', 'Shubh', 'Ammy Virk', 'Yo Yo Honey Singh', 'Harrdy Sandhu', 'Jass Manak'],
  },
  {
    kind: 'mix', id: 'desi-hiphop', group: 'desi', country: 'in', name: 'Desi Hip-Hop', blurb: 'DIVINE, Raftaar, KR$NA, Seedhe Maut', emoji: '🎤', colors: ['#111827', '#ea580c'],
    artists: ['DIVINE', 'Raftaar', 'KR$NA', 'Emiway Bantai', 'Seedhe Maut', 'MC Stan', 'Badshah', 'Ikka', 'King'],
  },
  {
    kind: 'mix', id: 'indian-indie', group: 'desi', country: 'in', name: 'Indian Indie', blurb: 'Prateek Kuhad, Anuv Jain, Ritviz…', emoji: '🌙', colors: ['#0d9488', '#4338ca'],
    artists: ['Prateek Kuhad', 'Anuv Jain', 'The Local Train', 'When Chai Met Toast', 'Ritviz', 'Lifafa', 'Taba Chake', 'Nucleya', 'Aditya Rikhari', 'Osho Jain'],
  },
  {
    kind: 'mix', id: 'south-hits', group: 'desi', country: 'in', name: 'South Superhits', blurb: 'Anirudh, Sid Sriram, DSP & more', emoji: '🔥', colors: ['#16a34a', '#dc2626'],
    artists: ['Anirudh Ravichander', 'Sid Sriram', 'Devi Sri Prasad', 'Yuvan Shankar Raja', 'Harris Jayaraj', 'S.S. Thaman', 'G. V. Prakash', 'Ilaiyaraaja'],
  },

  {
    kind: 'mix', id: 'bollywood-2010s', group: 'desi', country: 'in', name: '2010s Bollywood', blurb: 'Aashiqui 2 to Kabir Singh', emoji: '📲', colors: ['#db2777', '#4f46e5'],
    artists: ['Arijit Singh', 'Mithoon', 'Ankit Tiwari', 'Amaal Mallik', 'Armaan Malik', 'Neha Kakkar', 'Meet Bros', 'Tanishk Bagchi', 'Pritam', 'Vishal-Shekhar', 'Sachin-Jigar', 'Shreya Ghoshal', 'Badshah'],
    years: [2010, 2019],
  },
  {
    kind: 'mix', id: 'bollywood-80s', group: 'desi', country: 'in', name: '80s Bollywood', blurb: 'Bappi da, disco & filmy melodies', emoji: '🪩', colors: ['#c026d3', '#f59e0b'],
    artists: ['Bappi Lahiri', 'Kishore Kumar', 'Lata Mangeshkar', 'Asha Bhosle', 'Laxmikant-Pyarelal', 'Amit Kumar', 'Alisha Chinai', 'Anuradha Paudwal', 'Mohammed Aziz', 'Suresh Wadkar', 'R. D. Burman'],
  },
  {
    kind: 'mix', id: 'bollywood-romance', group: 'desi', country: 'in', name: 'Bollywood Romance', blurb: 'Love songs for the lovers', emoji: '💘', colors: ['#f43f5e', '#7c3aed'],
    artists: ['Arijit Singh', 'Atif Aslam', 'Armaan Malik', 'KK', 'Mohit Chauhan', 'Rahat Fateh Ali Khan', 'Palak Muchhal', 'Javed Ali', 'Ankit Tiwari', 'Jubin Nautiyal', 'Tulsi Kumar', 'Shreya Ghoshal'],
    years: [2005, 2030],
  },
  {
    kind: 'mix', id: 'bollywood-party', group: 'desi', country: 'in', name: 'Bollywood Party', blurb: 'Dance-floor fillers & sangeet bangers', emoji: '🪅', colors: ['#f97316', '#c026d3'],
    artists: ['Badshah', 'Yo Yo Honey Singh', 'Neha Kakkar', 'Mika Singh', 'Guru Randhawa', 'Tanishk Bagchi', 'Benny Dayal', 'Vishal Dadlani', 'Sunidhi Chauhan', 'Sukhwinder Singh', 'Diljit Dosanjh', 'Nucleya'],
  },
  {
    kind: 'mix', id: 'shaadi', group: 'desi', country: 'in', name: 'Shaadi Songs', blurb: 'Mehndi, sangeet & baraat anthems', emoji: '💍', colors: ['#dc2626', '#facc15'],
    terms: ['Mehndi', 'Shaadi', 'Dulhan', 'Baraat', 'Sangeet', 'Banno', 'Doli', 'Kudmayi', 'London Thumakda', 'Gallan Goodiyaan', 'Navrai Majhi', 'Mehndi Laga Ke Rakhna'],
  },
  {
    kind: 'mix', id: 'garba', group: 'desi', country: 'in', name: 'Garba & Dandiya', blurb: 'Navratri nights, all night long', emoji: '🪘', colors: ['#ea580c', '#be185d'],
    artists: ['Falguni Pathak', 'Kinjal Dave', 'Aishwarya Majmudar', 'Parthiv Gohil', 'Kirtidan Gadhvi', 'Osman Mir', 'Geeta Rabari'],
    terms: ['Garba', 'Dandiya', 'Navratri'],
  },
  {
    kind: 'mix', id: 'sufi', group: 'desi', country: 'in', name: 'Sufi & Qawwali', blurb: 'Nusrat, Rahat, Abida & Kailash', emoji: '🕌', colors: ['#0f766e', '#a16207'],
    artists: ['Nusrat Fateh Ali Khan', 'Rahat Fateh Ali Khan', 'Abida Parveen', 'Kailash Kher', 'Sabri Brothers', 'Wadali Brothers', 'Harshdeep Kaur', 'Sukhwinder Singh', 'Kavita Seth'],
  },
  {
    kind: 'mix', id: 'ghazals', group: 'desi', country: 'in', name: 'Ghazals', blurb: 'Jagjit, Ghulam Ali & Mehdi Hassan', emoji: '🥀', colors: ['#7f1d1d', '#1e3a8a'],
    artists: ['Jagjit Singh', 'Ghulam Ali', 'Mehdi Hassan', 'Pankaj Udhas', 'Chitra Singh', 'Talat Aziz', 'Hariharan', 'Anup Jalota', 'Begum Akhtar'],
  },
  {
    kind: 'mix', id: 'coke-studio', group: 'desi', country: 'in', name: 'Coke Studio & Pakistani Pop', blurb: 'Pasoori, Afreen Afreen & more', emoji: '🥤', colors: ['#dc2626', '#0f172a'],
    artists: ['Ali Sethi', 'Atif Aslam', 'Ali Zafar', 'Young Stunners', 'Talha Anjum', 'Hasan Raheem', 'Asim Azhar', 'Momina Mustehsan', 'Quratulain Balouch', 'Abdul Hannan', 'Strings'],
    terms: ['Coke Studio'],
  },
  {
    kind: 'mix', id: 'tamil-evergreen', group: 'desi', country: 'in', name: 'Tamil Evergreen', blurb: 'Raja, SPB, Chithra & the 90s', emoji: '🌺', colors: ['#b45309', '#166534'],
    artists: ['Ilaiyaraaja', 'S. P. Balasubrahmanyam', 'K. S. Chithra', 'S. Janaki', 'Deva', 'Vidyasagar', 'Harris Jayaraj', 'Hariharan', 'Unnikrishnan', 'Yuvan Shankar Raja'],
  },
  {
    kind: 'mix', id: 'malayalam', group: 'desi', country: 'in', name: 'Malayalam Hits', blurb: 'Mollywood melodies & new wave', emoji: '🛶', colors: ['#15803d', '#0369a1'],
    artists: ['K. J. Yesudas', 'K. S. Chithra', 'Vineeth Sreenivasan', 'Sushin Shyam', 'Gopi Sundar', 'Shaan Rahman', 'Hesham Abdul Wahab', 'Vidyasagar', 'Sithara Krishnakumar', 'Job Kurian'],
  },
  {
    kind: 'mix', id: 'kannada', group: 'desi', country: 'in', name: 'Kannada Hits', blurb: 'Sandalwood superhits', emoji: '🐘', colors: ['#facc15', '#b91c1c'],
    artists: ['Arjun Janya', 'V. Harikrishna', 'Vijay Prakash', 'Rajesh Krishnan', 'Ravi Basrur', 'B. Ajaneesh Loknath', 'Charan Raj', 'Gurukiran', 'Hamsalekha'],
  },
  {
    kind: 'mix', id: 'marathi', group: 'desi', country: 'in', name: 'Marathi Hits', blurb: 'Ajay-Atul, Zingaat & lavani', emoji: '🚩', colors: ['#f97316', '#7c2d12'],
    artists: ['Ajay-Atul', 'Avadhoot Gupte', 'Swapnil Bandodkar', 'Bela Shende', 'Adarsh Shinde', 'Anand Shinde', 'Vaishali Samant', 'Rohit Raut', 'Arya Ambekar'],
  },
  {
    kind: 'mix', id: 'bengali', group: 'desi', country: 'in', name: 'Bengali Hits', blurb: 'From Manna Dey to Anupam Roy', emoji: '🐟', colors: ['#dc2626', '#0ea5e9'],
    artists: ['Anupam Roy', 'Rupankar Bagchi', 'Nachiketa Chakraborty', 'Hemanta Mukherjee', 'Manna Dey', 'Lagnajita Chakraborty', 'Iman Chakraborty', 'Anjan Dutt', 'Fossils', 'Shilajit Majumder', 'Kabir Suman'],
  },

  // ---- Decades -----------------------------------------------------------
  {
    kind: 'mix', id: 'decade-60s', group: 'decades', name: '60s', blurb: 'Beatles, Motown & the British invasion', emoji: '🌼', colors: ['#f59e0b', '#0d9488'],
    artists: ['The Beatles', 'Elvis Presley', 'The Rolling Stones', 'The Beach Boys', 'The Supremes', 'Aretha Franklin', 'Marvin Gaye', 'Simon & Garfunkel', 'The Doors', 'Frank Sinatra', 'Ray Charles', 'Otis Redding', 'The Kinks', 'The Monkees'],
    years: [1958, 1972],
  },
  {
    kind: 'mix', id: 'decade-70s', group: 'decades', name: '70s', blurb: 'Disco, rock & soul', emoji: '🕺', colors: ['#ea580c', '#a21caf'],
    artists: ['ABBA', 'Bee Gees', 'Queen', 'Elton John', 'Fleetwood Mac', 'Stevie Wonder', 'Eagles', 'Donna Summer', 'Earth, Wind & Fire', 'Led Zeppelin', 'Gloria Gaynor', 'Boney M.'],
    years: [1968, 1982],
  },
  {
    kind: 'mix', id: 'decade-80s', group: 'decades', name: '80s', blurb: 'The most iconic songs of the 1980s', emoji: '📼', colors: ['#f59e0b', '#ec4899'],
    artists: ['Michael Jackson', 'Madonna', 'Prince', 'a-ha', 'Bon Jovi', 'Whitney Houston', 'Cyndi Lauper', 'Eurythmics', 'Journey', 'Duran Duran', 'The Police', 'Tears for Fears', 'Toto', 'George Michael'],
    years: [1979, 1991],
  },
  {
    kind: 'mix', id: 'decade-90s', group: 'decades', name: '90s', blurb: 'Boy bands, grunge & pop', emoji: '💾', colors: ['#14b8a6', '#8b5cf6'],
    artists: ['Backstreet Boys', 'Spice Girls', 'Britney Spears', 'Nirvana', 'Oasis', 'TLC', 'Mariah Carey', 'Celine Dion', 'No Doubt', 'Green Day', 'Ace of Base', 'Savage Garden', 'Alanis Morissette', 'Red Hot Chili Peppers'],
    years: [1989, 2001],
  },
  {
    kind: 'mix', id: 'decade-2000s', group: 'decades', name: '2000s', blurb: 'Y2K pop, R&B and rock', emoji: '📱', colors: ['#3b82f6', '#ec4899'],
    artists: ['Beyoncé', 'Rihanna', 'Eminem', 'Usher', 'Black Eyed Peas', 'Coldplay', 'Linkin Park', 'Kelly Clarkson', 'Nelly Furtado', 'OutKast', 'The Killers', 'Avril Lavigne', 'Justin Timberlake', 'Shakira'],
    years: [1999, 2010],
  },
  {
    kind: 'mix', id: 'decade-2010s', group: 'decades', name: '2010s', blurb: 'Streaming-era megahits', emoji: '🎧', colors: ['#8b5cf6', '#06b6d4'],
    artists: ['Ed Sheeran', 'Taylor Swift', 'Bruno Mars', 'Adele', 'Imagine Dragons', 'The Weeknd', 'Dua Lipa', 'Post Malone', 'Ariana Grande', 'Justin Bieber', 'Maroon 5', 'Katy Perry', 'Sia', 'Calvin Harris'],
    years: [2009, 2020],
  },
  {
    kind: 'mix', id: 'decade-2020s', group: 'decades', name: '2020s', blurb: 'Hits from this decade', emoji: '✨', colors: ['#22d3ee', '#a855f7'],
    artists: ['Olivia Rodrigo', 'Sabrina Carpenter', 'Billie Eilish', 'Doja Cat', 'Harry Styles', 'The Weeknd', 'Dua Lipa', 'SZA', 'Benson Boone', 'Chappell Roan', 'Bad Bunny', 'Taylor Swift'],
    years: [2020, 2030],
  },

  // ---- Genres ------------------------------------------------------------
  {
    kind: 'mix', id: 'genre-pop', group: 'genres', name: 'Pop', blurb: 'Chart-topping pop', emoji: '🎤', colors: ['#ec4899', '#f97316'],
    artists: ['Taylor Swift', 'Ariana Grande', 'Dua Lipa', 'Ed Sheeran', 'Harry Styles', 'Katy Perry', 'Lady Gaga', 'Bruno Mars', 'Billie Eilish', 'Justin Bieber', 'Olivia Rodrigo', 'Sabrina Carpenter'],
  },
  {
    kind: 'mix', id: 'genre-rap', group: 'genres', name: 'Rap', blurb: 'Hip-hop classics & new heat', emoji: '🎙️', colors: ['#facc15', '#111827'],
    artists: ['Eminem', 'Drake', 'Kendrick Lamar', 'Travis Scott', '50 Cent', 'Kanye West', 'J. Cole', 'Nicki Minaj', 'Snoop Dogg', '2Pac', 'The Notorious B.I.G.', 'Lil Wayne'],
  },
  {
    kind: 'mix', id: 'genre-rock', group: 'genres', name: 'Rock', blurb: 'Rock legends & anthems', emoji: '🎸', colors: ['#dc2626', '#1f2937'],
    artists: ['Queen', 'AC/DC', "Guns N' Roses", 'Led Zeppelin', 'Nirvana', 'Bon Jovi', 'Aerosmith', 'The Rolling Stones', 'Foo Fighters', 'Linkin Park', 'Red Hot Chili Peppers', 'Arctic Monkeys'],
  },
  {
    kind: 'mix', id: 'genre-metal', group: 'genres', name: 'Metal', blurb: 'Heavy riffs only', emoji: '🤘', colors: ['#52525b', '#0a0a0a'],
    artists: ['Metallica', 'Iron Maiden', 'Black Sabbath', 'Slipknot', 'System Of A Down', 'Megadeth', 'Pantera', 'Avenged Sevenfold', 'Rammstein', 'Bring Me The Horizon'],
  },
  {
    kind: 'mix', id: 'genre-kpop', group: 'genres', name: 'K-Pop', blurb: 'BTS, BLACKPINK & more', emoji: '💜', colors: ['#a855f7', '#ec4899'],
    artists: ['BTS', 'BLACKPINK', 'TWICE', 'Stray Kids', 'NewJeans', 'SEVENTEEN', 'EXO', 'Red Velvet', 'ITZY', 'aespa', 'BIGBANG', 'Jung Kook'],
  },
  {
    kind: 'mix', id: 'genre-edm', group: 'genres', name: 'EDM', blurb: 'Drops, builds and festival hits', emoji: '⚡', colors: ['#22d3ee', '#2563eb'],
    artists: ['Avicii', 'Calvin Harris', 'David Guetta', 'Martin Garrix', 'Marshmello', 'Alan Walker', 'The Chainsmokers', 'Zedd', 'Kygo', 'Swedish House Mafia', 'Daft Punk'],
  },
  {
    kind: 'mix', id: 'genre-rnb', group: 'genres', name: 'R&B', blurb: 'Smooth R&B and soul', emoji: '🌹', colors: ['#be123c', '#581c87'],
    artists: ['The Weeknd', 'SZA', 'Usher', 'Alicia Keys', 'Beyoncé', 'Frank Ocean', 'Chris Brown', 'Daniel Caesar', 'H.E.R.', 'Brent Faiyaz', 'Rihanna'],
  },
  {
    kind: 'mix', id: 'genre-latin', group: 'genres', name: 'Latin', blurb: 'Reggaeton & pop latino', emoji: '💃', colors: ['#f43f5e', '#facc15'],
    artists: ['Bad Bunny', 'J Balvin', 'Shakira', 'Daddy Yankee', 'Karol G', 'Ozuna', 'Maluma', 'Rosalía', 'Luis Fonsi', 'Feid'],
  },
  {
    kind: 'mix', id: 'genre-country', group: 'genres', name: 'Country', blurb: 'Boots, trucks & big choruses', emoji: '🤠', colors: ['#b45309', '#365314'],
    artists: ['Morgan Wallen', 'Luke Combs', 'Zach Bryan', 'Chris Stapleton', 'Carrie Underwood', 'Kenny Chesney', 'Florida Georgia Line', 'Shania Twain', 'Dolly Parton', 'Johnny Cash'],
  },
  {
    kind: 'mix', id: 'genre-movies', group: 'genres', name: 'Movie Soundtracks', blurb: 'Disney, musicals & film hits', emoji: '🍿', colors: ['#0ea5e9', '#f59e0b'],
    terms: ['Disney soundtrack', 'Frozen soundtrack', 'Moana soundtrack', 'The Greatest Showman', 'Encanto soundtrack', 'The Lion King soundtrack', 'Mamma Mia soundtrack', 'Barbie the album'],
  },
  {
    kind: 'mix', id: 'genre-christmas', group: 'genres', name: 'Christmas', blurb: 'Festive favourites', emoji: '🎄', colors: ['#16a34a', '#dc2626'],
    terms: ['Christmas', 'Christmas pop', 'Jingle Bell', 'Last Christmas', 'Christmas classics', 'Santa Claus'],
  },
  {
    kind: 'mix', id: 'genre-indie', group: 'genres', name: 'Indie & Alternative', blurb: 'Arctic Monkeys, Tame Impala & co', emoji: '🌀', colors: ['#14b8a6', '#4c1d95'],
    artists: ['Arctic Monkeys', 'The 1975', 'Tame Impala', 'The Strokes', 'Florence + The Machine', 'Hozier', 'Vampire Weekend', 'Phoebe Bridgers', 'Glass Animals', 'Lana Del Rey', 'Cage The Elephant', 'Foster The People'],
  },
  {
    kind: 'mix', id: 'genre-poppunk', group: 'genres', name: 'Pop-Punk & Emo', blurb: 'Blink, Paramore & MCR', emoji: '🖤', colors: ['#111827', '#e11d48'],
    artists: ['blink-182', 'Green Day', 'Paramore', 'My Chemical Romance', 'Fall Out Boy', 'Sum 41', 'Simple Plan', 'Good Charlotte', 'All Time Low', 'Panic! At The Disco', 'Yellowcard', 'The All-American Rejects'],
  },
  {
    kind: 'mix', id: 'genre-bands', group: 'genres', name: 'Boy Bands & Girl Groups', blurb: 'Backstreet to One Direction', emoji: '🕺', colors: ['#38bdf8', '#f472b6'],
    artists: ['Backstreet Boys', '*NSYNC', 'One Direction', 'Westlife', 'Spice Girls', 'Little Mix', "Destiny's Child", 'Jonas Brothers', 'Take That', 'Boyz II Men', 'Fifth Harmony', 'Pussycat Dolls'],
  },
  {
    kind: 'mix', id: 'genre-soul', group: 'genres', name: 'Soul & Motown', blurb: 'Marvin, Aretha, Stevie & more', emoji: '🎺', colors: ['#b45309', '#581c87'],
    artists: ['Marvin Gaye', 'Stevie Wonder', 'Aretha Franklin', 'The Temptations', 'Diana Ross', 'Otis Redding', 'Al Green', 'Sam Cooke', 'The Jackson 5', 'Smokey Robinson', 'Bill Withers', 'Etta James'],
  },
  {
    kind: 'mix', id: 'genre-jazz', group: 'genres', name: 'Jazz & Swing', blurb: 'Sinatra, Ella, Satchmo & Bublé', emoji: '🎷', colors: ['#92400e', '#1e3a8a'],
    artists: ['Frank Sinatra', 'Ella Fitzgerald', 'Louis Armstrong', 'Nat King Cole', 'Billie Holiday', 'Michael Bublé', 'Norah Jones', 'Nina Simone', 'Tony Bennett', 'Dean Martin', 'Diana Krall'],
  },
  {
    kind: 'mix', id: 'genre-reggae', group: 'genres', name: 'Reggae & Dancehall', blurb: 'Marley, Shaggy & Sean Paul', emoji: '🇯🇲', colors: ['#16a34a', '#eab308'],
    artists: ['Bob Marley & The Wailers', 'Shaggy', 'Sean Paul', 'UB40', 'Damian Marley', 'Jimmy Cliff', 'Toots & The Maytals', 'Inner Circle', 'Peter Tosh', 'Beenie Man'],
  },
  {
    kind: 'mix', id: 'genre-acoustic', group: 'genres', name: 'Acoustic & Singer-Songwriter', blurb: 'Guitars, pianos & big feelings', emoji: '🪕', colors: ['#a16207', '#0f766e'],
    artists: ['Ed Sheeran', 'John Mayer', 'Jason Mraz', 'Lewis Capaldi', 'Passenger', 'James Bay', 'Vance Joy', 'Jack Johnson', 'Noah Kahan', 'Gracie Abrams', 'Tracy Chapman', 'Ben Howard'],
  },
  {
    kind: 'mix', id: 'genre-musicals', group: 'genres', name: 'Broadway & Musicals', blurb: 'Hamilton, Wicked, Les Mis & more', emoji: '🎭', colors: ['#7c3aed', '#f59e0b'],
    terms: ['Hamilton original broadway cast', 'Wicked original broadway cast', 'Les Misérables original cast', 'The Phantom of the Opera', 'Grease soundtrack', 'Hairspray soundtrack', 'Dear Evan Hansen', 'La La Land soundtrack', 'The Sound of Music soundtrack', 'Rent original broadway cast'],
  },

  // ---- Moods -------------------------------------------------------------
  {
    kind: 'mix', id: 'mood-party', group: 'moods', name: 'Party Starters', blurb: 'Instant dance-floor energy', emoji: '🎉', colors: ['#f43f5e', '#7c3aed'],
    artists: ['Pitbull', 'LMFAO', 'Flo Rida', 'Black Eyed Peas', 'Calvin Harris', 'Rihanna', 'David Guetta', 'Kesha', 'Jason Derulo', 'Usher', 'Lady Gaga', 'Bruno Mars'],
  },
  {
    kind: 'mix', id: 'mood-love', group: 'moods', name: 'Love Songs', blurb: 'Slow dances & first dances', emoji: '💞', colors: ['#ec4899', '#be123c'],
    artists: ['John Legend', 'Whitney Houston', 'Celine Dion', 'Lionel Richie', 'Shania Twain', 'Elvis Presley', 'Christina Perri', 'Calum Scott', 'Westlife', 'Bryan Adams', 'Ed Sheeran', 'Bruno Mars'],
  },
  {
    kind: 'mix', id: 'mood-heartbreak', group: 'moods', name: 'Heartbreak', blurb: 'Songs to cry in the car to', emoji: '💔', colors: ['#1e3a8a', '#6b21a8'],
    artists: ['Adele', 'Lewis Capaldi', 'Olivia Rodrigo', 'Sam Smith', 'Tom Odell', 'James Arthur', 'Gracie Abrams', 'Joji', 'Billie Eilish', 'Shawn Mendes', 'Selena Gomez', 'Mariah Carey'],
  },
  {
    kind: 'mix', id: 'mood-workout', group: 'moods', name: 'Workout Pump', blurb: 'One more rep. One more song.', emoji: '💪', colors: ['#dc2626', '#f97316'],
    artists: ['Eminem', 'Imagine Dragons', 'Kanye West', 'Travis Scott', 'Linkin Park', 'AC/DC', 'The Weeknd', 'Dua Lipa', 'Queen', 'Drake', 'Kendrick Lamar', 'Skillet'],
  },
  {
    kind: 'mix', id: 'mood-roadtrip', group: 'moods', name: 'Road Trip Singalongs', blurb: 'Windows down, volume up', emoji: '🚗', colors: ['#0ea5e9', '#f59e0b'],
    artists: ['Queen', 'Journey', 'Bon Jovi', 'Fleetwood Mac', 'Toto', 'The Killers', 'Coldplay', 'Tom Petty', 'Elton John', 'Bruce Springsteen', 'Lynyrd Skynyrd', 'Oasis'],
  },
  {
    kind: 'mix', id: 'mood-chill', group: 'moods', name: 'Chill Vibes', blurb: 'Laid-back, late-night listening', emoji: '🌙', colors: ['#0f766e', '#312e81'],
    artists: ['Lauv', 'Khalid', 'Rex Orange County', 'Daniel Caesar', 'Jeremy Zucker', 'Clairo', 'Cigarettes After Sex', 'keshi', 'Frank Ocean', 'Mac DeMarco', 'Wallows', 'beabadoobee'],
  },
  {
    kind: 'mix', id: 'mood-karaoke', group: 'moods', name: 'Karaoke Classics', blurb: 'Everyone knows the words', emoji: '🎤', colors: ['#c026d3', '#facc15'],
    artists: ['ABBA', 'Queen', 'Whitney Houston', 'Bon Jovi', 'Spice Girls', 'Backstreet Boys', 'Britney Spears', 'Gloria Gaynor', 'Cyndi Lauper', 'Celine Dion', 'Journey', 'Bonnie Tyler'],
  },
  {
    kind: 'mix', id: 'mood-viral', group: 'moods', name: 'Viral Hits', blurb: 'The songs all over your feed', emoji: '📱', colors: ['#06b6d4', '#ec4899'],
    artists: ['Sabrina Carpenter', 'Chappell Roan', 'Doechii', 'Tate McRae', 'Benson Boone', 'Teddy Swims', 'Alex Warren', 'Djo', 'Shaboozey', 'Tommy Richman', 'Hozier', 'Gracie Abrams'],
    years: [2022, 2030],
  },
  {
    kind: 'mix', id: 'mood-happy', group: 'moods', name: 'Feel-Good Hits', blurb: 'Guaranteed good mood', emoji: '😄', colors: ['#facc15', '#f97316'],
    artists: ['Pharrell Williams', 'Katrina & The Waves', 'Mark Ronson', 'Justin Timberlake', 'Lizzo', 'Walk The Moon', 'OneRepublic', 'Bill Withers', 'Earth, Wind & Fire', 'Bruno Mars', 'Dua Lipa', 'Harry Styles'],
  },

  // ---- World -------------------------------------------------------------
  {
    kind: 'mix', id: 'world-afrobeats', group: 'world', name: 'Afrobeats', blurb: 'Burna, Wizkid, Rema & Tems', emoji: '🌍', colors: ['#16a34a', '#f59e0b'],
    artists: ['Burna Boy', 'Wizkid', 'Davido', 'Rema', 'Tems', 'Ayra Starr', 'Asake', 'CKay', 'Tyla', 'Fireboy DML', 'Omah Lay', 'Mr Eazi'],
  },
  {
    kind: 'mix', id: 'world-anime', group: 'world', name: 'J-Pop & Anime', blurb: 'YOASOBI, LiSA, Kenshi Yonezu', emoji: '🗾', colors: ['#f43f5e', '#6366f1'],
    artists: ['YOASOBI', 'LiSA', 'Kenshi Yonezu', 'Aimer', 'Official HIGE DANdism', 'King Gnu', 'Ado', 'RADWIMPS', 'Eve', 'Fujii Kaze', 'Mrs. GREEN APPLE', 'Creepy Nuts'],
  },
  {
    kind: 'mix', id: 'world-arabic', group: 'world', name: 'Arabic Hits', blurb: 'Amr Diab, Nancy, Elissa & more', emoji: '🌙', colors: ['#0f766e', '#ca8a04'],
    artists: ['Amr Diab', 'Nancy Ajram', 'Elissa', 'Mohamed Hamaki', 'Tamer Hosny', 'Wegz', 'Haifa Wehbe', 'Fairuz', 'Saad Lamjarred', 'Ragheb Alama', 'Cairokee', 'Assala'],
  },
  {
    kind: 'mix', id: 'world-espanol', group: 'world', name: 'Pop en Español', blurb: 'Enrique, Shakira, Juanes & Aitana', emoji: '🇪🇸', colors: ['#dc2626', '#facc15'],
    artists: ['Enrique Iglesias', 'Alejandro Sanz', 'Shakira', 'Juanes', 'Ricky Martin', 'Pablo Alborán', 'Aitana', 'Camilo', 'Sebastián Yatra', 'Álvaro Soler', 'Jesse & Joy', 'Reik'],
  },
  {
    kind: 'mix', id: 'world-french', group: 'world', country: 'fr', name: 'French Pop', blurb: 'Stromae, Indila, Aya Nakamura', emoji: '🥐', colors: ['#2563eb', '#ef4444'],
    artists: ['Stromae', 'Indila', 'Aya Nakamura', 'Angèle', 'Édith Piaf', 'Zaz', 'Louane', 'Kendji Girac', 'Christophe Maé', 'Gims', 'Vianney', 'Céline Dion'],
  },
  {
    kind: 'mix', id: 'world-brazil', group: 'world', country: 'br', name: 'Brazilian Hits', blurb: 'Anitta, sertanejo & bossa nova', emoji: '🇧🇷', colors: ['#16a34a', '#2563eb'],
    artists: ['Anitta', 'Ludmilla', 'Jorge & Mateus', 'Marília Mendonça', 'Gusttavo Lima', 'Henrique & Juliano', 'Luan Santana', 'Ivete Sangalo', 'Seu Jorge', 'Tom Jobim', 'Caetano Veloso', 'Pabllo Vittar'],
  },
  {
    kind: 'mix', id: 'world-turkish', group: 'world', name: 'Turkish Pop', blurb: 'Tarkan, Sezen Aksu & more', emoji: '🧿', colors: ['#dc2626', '#0ea5e9'],
    artists: ['Tarkan', 'Sezen Aksu', 'Mabel Matiz', 'Sertab Erener', 'Mustafa Sandal', 'Hadise', 'Edis', 'Simge', 'Murat Boz', 'Gülşen'],
  },
  {
    kind: 'mix', id: 'world-kpop-classics', group: 'world', name: 'K-Pop Classics', blurb: 'Gangnam Style to Gee', emoji: '💿', colors: ['#a855f7', '#22d3ee'],
    artists: ['PSY', "Girls' Generation", 'BIGBANG', 'SHINee', '2NE1', 'Super Junior', 'Wonder Girls', 'IU', 'TVXQ!', 'f(x)', 'MAMAMOO', 'GOT7'],
  },
]

export function findPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id)
}

export const ROUND_OPTIONS = [5, 10, 15, 20] as const
export const GUESS_SECONDS_OPTIONS = [10, 15, 20, 30] as const

// ---------------------------------------------------------------------------
// Featured public playlists (verified to load with previews). Hosts can also
// paste any public Spotify or Apple Music playlist/album link.

export type PlaylistProvider = 'spotify' | 'apple'
export type PlaylistKind = 'playlist' | 'album'

export type PlaylistCategory = 'desi' | 'hits' | 'throwback' | 'genres' | 'moods' | 'world'

export const PLAYLIST_CATEGORIES: { id: PlaylistCategory; label: string }[] = [
  { id: 'desi', label: 'Desi' },
  { id: 'hits', label: 'Top Hits' },
  { id: 'throwback', label: 'Throwback' },
  { id: 'genres', label: 'Genres' },
  { id: 'moods', label: 'Moods & Party' },
  { id: 'world', label: 'World' },
]

export interface FeaturedPlaylist {
  provider: PlaylistProvider
  type: PlaylistKind
  id: string
  name: string
  owner: string
  category: PlaylistCategory
  /** Apple Music storefront for Apple links. */
  country?: RegionCode
}

const spotify = (category: PlaylistCategory, id: string, name: string, owner = 'Spotify'): FeaturedPlaylist => ({ provider: 'spotify', type: 'playlist', id, name, owner, category })

export const FEATURED_PLAYLISTS: FeaturedPlaylist[] = [
  // ---- Desi --------------------------------------------------------------
  spotify('desi', '37i9dQZF1DX0XUfTFmNBRM', 'Hot Hits Hindi'),
  spotify('desi', '37i9dQZEVXbLZ52XmnySJg', 'Top 50 – India'),
  spotify('desi', '37i9dQZF1DXbVhgADFy3im', 'Trending Now India'),
  spotify('desi', '37i9dQZF1DXd8cOUiye1o2', 'New Music Hindi'),
  spotify('desi', '37i9dQZF1DWXtlo6ENS92N', 'Bollywood Central'),
  spotify('desi', '37i9dQZF1DX8xfQRRX1PDm', 'Bollywood Dance Music'),
  spotify('desi', '37i9dQZF1DWTwzVdyRpXm1', 'Desi Hits'),
  spotify('desi', '37i9dQZF1DXdpQPPZq3F7n', 'Bollywood Mush'),
  spotify('desi', '37i9dQZF1DX14CbVHtvHRB', 'Trending Valentine’s Hits'),
  spotify('desi', '37i9dQZF1DXdFesNN9TzXT', 'Sad Hindi Melodies'),
  spotify('desi', '37i9dQZF1DWYztMONFqfvX', 'This Is Arijit Singh'),
  spotify('desi', '37i9dQZF1DWYRTlrhMB12D', 'Old is Gold'),
  spotify('desi', '0Gd0yQzB6wttuaLlawHlYI', '90s Bollywood', 'Nikita'),
  spotify('desi', '09nWEs2d4zbyjGXMaA8oiQ', 'Bollywood Romance Top 100+', 'Gourab'),
  spotify('desi', '4Y3NZDQJePGNtIXx28M6uG', 'Bollywood Item Songs 💃', 'Sheetall_ar'),
  spotify('desi', '51Wuh0Ev8wAQCAOOCpjcOW', 'Bollywood Item Songs (Old & New)', 'Sharoena'),
  spotify('desi', '3HQvntcJ6dfRhu0LpblSuZ', 'Hindi Item Songs 2026', 'Subba Reddy Gowru'),
  spotify('desi', '37i9dQZF1DX5cZuAHLNjGz', 'Punjabi 101'),
  spotify('desi', '37i9dQZF1DX5q67ZpWyRrZ', 'Indie India'),
  spotify('desi', '37i9dQZF1DX1i3hvzHpcQV', 'Hot Hits Tamil'),
  spotify('desi', '37i9dQZF1DX4Im4BTs2WMg', 'Trending Now Tamil'),
  spotify('desi', '37i9dQZF1DX6XE7HRLM75P', 'Hot Hits Telugu'),

  // ---- Top hits ----------------------------------------------------------
  spotify('hits', '37i9dQZF1DXcBWIGoYBM5M', 'Today’s Top Hits'),
  spotify('hits', '37i9dQZEVXbMDoHDwVN2tF', 'Top 50 – Global'),
  spotify('hits', '37i9dQZF1DX4JAvHpjipBk', 'New Music Friday'),
  spotify('hits', '37i9dQZF1DX2L0iB23Enbq', 'Viral Hits'),
  spotify('hits', '37i9dQZF1DXbYM3nMM0oPk', 'Mega Hit Mix'),
  spotify('hits', '37i9dQZF1DWUa8ZRTfalHk', 'Pop Rising'),
  spotify('hits', '37i9dQZF1DX5Vy6DFOcx00', 'big on the internet'),
  spotify('hits', '37i9dQZF1DX18jTM2l2fJY', 'Top Tracks of 2025 – Global'),
  spotify('hits', '37i9dQZF1DXcZDD7cfEKhW', 'Pop Remix'),
  { provider: 'apple', type: 'playlist', id: 'pl.0b6396cf63594f5cb834aff82520eb84', name: 'Global Hits', owner: 'Apple Music', category: 'hits', country: 'in' },

  // ---- Throwback ---------------------------------------------------------
  spotify('throwback', '37i9dQZF1DWTJ7xPn4vNaz', 'All Out 70s'),
  spotify('throwback', '37i9dQZF1DX4UtSsGT1Sbe', 'All Out 80s'),
  spotify('throwback', '37i9dQZF1DXbTxeAdrVG2l', 'All Out 90s'),
  spotify('throwback', '37i9dQZF1DX4o1oenSJRJd', 'All Out 2000s'),
  spotify('throwback', '37i9dQZF1DX5Ejj0EkURtP', 'All Out 2010s'),
  spotify('throwback', '37i9dQZF1DXb57FjYWz00c', '80s Hits'),
  spotify('throwback', '37i9dQZF1DWVq1SXCH6uFn', '00’s Love Hits'),
  spotify('throwback', '37i9dQZF1DWXRqgorJj26U', 'Rock Classics'),
  spotify('throwback', '37i9dQZF1DWWwzidNQX6jx', '70s Rock Anthems'),
  spotify('throwback', '37i9dQZF1DX1rVvRgjX59F', '90s Rock Anthems'),
  spotify('throwback', '37i9dQZF1DX186v583rmzp', 'I Love My ’90s Hip-Hop'),
  spotify('throwback', '37i9dQZF1DWVA1Gq4XHa6U', 'Gold School'),
  spotify('throwback', '37i9dQZF1DX6ThddIjWuGT', 'Latin Pop Classics'),

  // ---- Genres ------------------------------------------------------------
  spotify('genres', '37i9dQZF1DX0XUsuxWHRQd', 'RapCaviar'),
  spotify('genres', '37i9dQZF1DX2RxBh64BHjQ', 'Most Necessary'),
  spotify('genres', '37i9dQZF1DWY4xHQp97fN6', 'Get Turnt'),
  spotify('genres', '37i9dQZF1DX4dyzvuaRJ0n', 'mint'),
  spotify('genres', '37i9dQZF1DX0BcQWzuB7ZO', 'Dance Hits'),
  spotify('genres', '37i9dQZF1DX8tZsk68tuDw', 'Dance Rising'),
  spotify('genres', '37i9dQZF1DXa8NOEUWPn9W', 'Housewerk'),
  spotify('genres', '37i9dQZF1DWZryfp6NSvtz', 'All New Rock'),
  spotify('genres', '37i9dQZF1DXdbXrPNafg9d', 'All New Indie'),
  spotify('genres', '37i9dQZF1DX9qNs32fujYe', 'Heavy Metal'),
  spotify('genres', '37i9dQZF1DX1lVhptIYRda', 'Hot Country'),
  spotify('genres', '37i9dQZF1DWXi7h4mmmkzD', 'Country Party'),
  spotify('genres', '37i9dQZF1DXbITWG1ZJKYt', 'Jazz Classics'),
  spotify('genres', '37i9dQZF1DX8C9xQcOrE6T', 'Disney Hits'),
  spotify('genres', '37i9dQZF1DWVs8I62NcHks', 'Disney Favorites'),

  // ---- Moods & party -----------------------------------------------------
  spotify('moods', '37i9dQZF1DXaXB8fQg7xif', 'Dance Party'),
  spotify('moods', '37i9dQZF1DXdPec7aLTmlC', 'Happy Hits!'),
  spotify('moods', '37i9dQZF1DX3rxVfibe1L0', 'Mood Booster'),
  spotify('moods', '37i9dQZF1DWSf2RDTDayIx', 'Happy Beats'),
  spotify('moods', '37i9dQZF1DX4fpCWaHOned', 'Confidence Boost'),
  spotify('moods', '37i9dQZF1DX0Uv9tZ47pWo', 'Girls’ Night'),
  spotify('moods', '37i9dQZF1DWSqmBTGDYngZ', 'Songs to Sing in the Shower'),
  spotify('moods', '37i9dQZF1DWWMOmoXKqHTD', 'Songs to Sing in the Car'),
  spotify('moods', '37i9dQZF1DX9wC1KY45plY', 'Classic Road Trip Songs'),
  spotify('moods', '37i9dQZF1DX70RN3TfWWJh', 'Workout'),
  spotify('moods', '37i9dQZF1DX7qK8ma5wgG1', 'Sad Songs'),
  spotify('moods', '37i9dQZF1DX4WYpdgoIcn6', 'Chill Hits'),
  spotify('moods', '37i9dQZF1DX7cmFV9rWM0u', 'Zumba® Beats'),
  spotify('moods', '37i9dQZF1DX0Yxoavh5qJV', 'Christmas Hits'),
  spotify('moods', '37i9dQZF1DX6R7QUWePReA', 'Christmas Classics'),

  // ---- World -------------------------------------------------------------
  spotify('world', '37i9dQZF1DX10zKzsJ2jva', 'Viva Latino'),
  spotify('world', '37i9dQZF1DX3omIq8ziEt6', 'Esenciales'),
  spotify('world', '37i9dQZF1DX1HCSfq0nSal', 'PEGAO'),
  spotify('world', '37i9dQZF1DX9tPFwDMOaN1', 'K-Pop ON! (온)'),
  spotify('world', '37i9dQZF1DWUXxc8Mc6MmJ', 'Best of Korean OSTs'),
  spotify('world', '37i9dQZF1DWYkaDif7Ztbp', 'African Heat'),
  spotify('world', '37i9dQZF1DWT6SJaitNDax', 'Big Mood'),
  spotify('world', '37i9dQZF1DX5cO1uP1XC1g', 'Yalla'),
  spotify('world', '37i9dQZF1DXa2EiKmMLhFD', 'Hot Hits Indonesia'),
]
