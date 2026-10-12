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

export type PresetGroup = 'charts' | 'decades' | 'genres' | 'desi'

export const PRESET_GROUPS: { id: PresetGroup; label: string }[] = [
  { id: 'charts', label: 'Top Charts' },
  { id: 'desi', label: 'Desi' },
  { id: 'decades', label: 'Decades' },
  { id: 'genres', label: 'Genres' },
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

  // ---- Decades -----------------------------------------------------------
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

export interface FeaturedPlaylist {
  provider: PlaylistProvider
  type: PlaylistKind
  id: string
  name: string
  owner: string
  /** Apple Music storefront for Apple links. */
  country?: RegionCode
}

export const FEATURED_PLAYLISTS: FeaturedPlaylist[] = [
  { provider: 'spotify', type: 'playlist', id: '4Y3NZDQJePGNtIXx28M6uG', name: 'Bollywood Item Songs 💃', owner: 'Sheetall_ar' },
  { provider: 'spotify', type: 'playlist', id: '51Wuh0Ev8wAQCAOOCpjcOW', name: 'Bollywood Item Songs (Old & New)', owner: 'Sharoena' },
  { provider: 'spotify', type: 'playlist', id: '3HQvntcJ6dfRhu0LpblSuZ', name: 'Hindi Item Songs 2026', owner: 'Subba Reddy Gowru' },
  { provider: 'spotify', type: 'playlist', id: '37i9dQZF1DX8xfQRRX1PDm', name: 'Bollywood Dance Music', owner: 'Spotify' },
  { provider: 'spotify', type: 'playlist', id: '37i9dQZF1DX0XUfTFmNBRM', name: 'Hot Hits Hindi', owner: 'Spotify' },
  { provider: 'spotify', type: 'playlist', id: '37i9dQZF1DWXtlo6ENS92N', name: 'Bollywood Central', owner: 'Spotify' },
  { provider: 'spotify', type: 'playlist', id: '37i9dQZF1DWTwzVdyRpXm1', name: 'Desi Hits', owner: 'Spotify' },
  { provider: 'spotify', type: 'playlist', id: '37i9dQZF1DX5cZuAHLNjGz', name: 'Punjabi 101', owner: 'Spotify' },
  { provider: 'spotify', type: 'playlist', id: '0Gd0yQzB6wttuaLlawHlYI', name: '90s Bollywood', owner: 'Nikita' },
  { provider: 'spotify', type: 'playlist', id: '09nWEs2d4zbyjGXMaA8oiQ', name: 'Bollywood Romance Top 100+', owner: 'Gourab' },
  { provider: 'spotify', type: 'playlist', id: '37i9dQZF1DX5q67ZpWyRrZ', name: 'Indie India', owner: 'Spotify' },
  { provider: 'spotify', type: 'playlist', id: '37i9dQZF1DXcBWIGoYBM5M', name: 'Today’s Top Hits', owner: 'Spotify' },
  { provider: 'spotify', type: 'playlist', id: '37i9dQZF1DXbTxeAdrVG2l', name: 'All Out 90s', owner: 'Spotify' },
  { provider: 'spotify', type: 'playlist', id: '37i9dQZF1DX4o1oenSJRJd', name: 'All Out 2000s', owner: 'Spotify' },
  { provider: 'spotify', type: 'playlist', id: '37i9dQZF1DWWMOmoXKqHTD', name: 'Songs to Sing in the Car', owner: 'Spotify' },
  { provider: 'apple', type: 'playlist', id: 'pl.0b6396cf63594f5cb834aff82520eb84', name: 'Global Hits', owner: 'Apple Music', country: 'in' },
]
