// Room chat (text, emoji, stickers) and voice channel definitions shared by the
// server (validation, relay) and the UI (pickers, rendering).

export const MAX_CHAT_LENGTH = 300
/** Messages the room keeps so people who join late (or refresh) see the conversation. */
export const CHAT_HISTORY = 60
export const CHAT_COOLDOWN_MS = 500
/** WebRTC offers/answers/ICE candidates relayed between players in the voice channel. */
export const MAX_SIGNAL_LENGTH = 20_000

/** Stickers: a big emoji with a punchy caption, drawn as a die-cut sticker. */
export const STICKERS = [
  { id: 'banger', emoji: '🔥', label: 'BANGER', colors: ['#f97316', '#db2777'] },
  { id: 'gg', emoji: '🏆', label: 'GG', colors: ['#facc15', '#f97316'] },
  { id: 'ez', emoji: '😎', label: 'TOO EASY', colors: ['#22d3ee', '#2563eb'] },
  { id: 'noway', emoji: '🤯', label: 'NO WAY', colors: ['#a855f7', '#ec4899'] },
  { id: 'iknewit', emoji: '🧠', label: 'I KNEW IT', colors: ['#10b981', '#0e7490'] },
  { id: 'rigged', emoji: '🤨', label: 'RIGGED', colors: ['#ef4444', '#7f1d1d'] },
  { id: 'skill', emoji: '💅', label: 'SKILL ISSUE', colors: ['#ec4899', '#8b5cf6'] },
  { id: 'lucky', emoji: '🍀', label: 'LUCKY GUESS', colors: ['#22c55e', '#15803d'] },
  { id: 'vibe', emoji: '🎧', label: 'VIBE CHECK', colors: ['#06b6d4', '#7c3aed'] },
  { id: 'onemore', emoji: '🔁', label: 'ONE MORE', colors: ['#f59e0b', '#dc2626'] },
  { id: 'whosang', emoji: '🎤', label: 'WHO SANG THIS?', colors: ['#6366f1', '#0ea5e9'] },
  { id: 'myjam', emoji: '💃', label: 'MY JAM', colors: ['#f43f5e', '#f59e0b'] },
  { id: 'oyehoye', emoji: '🥁', label: 'OYE HOYE', colors: ['#eab308', '#16a34a'] },
  { id: 'kyascene', emoji: '🤌', label: 'BHAI KYA SCENE', colors: ['#fb923c', '#be123c'] },
  { id: 'goat', emoji: '🐐', label: 'GOAT', colors: ['#a3a3a3', '#404040'] },
  { id: 'savage', emoji: '😈', label: 'SAVAGE', colors: ['#7c3aed', '#111827'] },
  { id: 'crying', emoji: '😭', label: 'CRYING', colors: ['#38bdf8', '#1d4ed8'] },
  { id: 'dead', emoji: '💀', label: "I'M DEAD", colors: ['#d4d4d8', '#52525b'] },
  { id: 'hurry', emoji: '⏰', label: 'HURRY UP', colors: ['#fbbf24', '#b45309'] },
  { id: 'nexxt', emoji: '⏭️', label: 'NEXT!', colors: ['#34d399', '#2563eb'] },
  { id: 'chill', emoji: '🧊', label: 'STAY CHILL', colors: ['#67e8f9', '#0891b2'] },
  { id: 'cheater', emoji: '🕵️', label: 'CHEATER', colors: ['#f87171', '#991b1b'] },
  { id: 'clutch', emoji: '⚡', label: 'CLUTCH', colors: ['#fde047', '#ca8a04'] },
  { id: 'hello', emoji: '👋', label: 'HELLO!', colors: ['#f472b6', '#c026d3'] },
] as const

export type StickerId = (typeof STICKERS)[number]['id']
export const STICKER_IDS = STICKERS.map((s) => s.id) as [StickerId, ...StickerId[]]

export function findSticker(id: string) {
  return STICKERS.find((s) => s.id === id)
}

/** Emoji picker sections. */
export const EMOJI_SETS: { id: string; label: string; icon: string; emojis: string[] }[] = [
  {
    id: 'smileys', label: 'Smileys', icon: '😀',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🫡', '🤐', '🤨', '😐', '😑', '😶', '🫠', '😏', '😒', '🙄', '😬', '😮‍💨', '😌', '😔', '😪', '😴', '🤤', '😷', '🤒', '🥴', '😵‍💫', '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁', '😮', '😯', '😲', '😳', '🥺', '🥹', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👻', '👽', '🤖'],
  },
  {
    id: 'gestures', label: 'Gestures', icon: '👍',
    emojis: ['👍', '👎', '👏', '🙌', '🫶', '👐', '🤲', '🤝', '🙏', '✌️', '🤞', '🫰', '🤟', '🤘', '👌', '🤌', '🤏', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤙', '💪', '🦾', '🖕', '✍️', '🤳', '💅', '👀', '👁️', '👅', '👄', '🫦', '🧠', '🙈', '🙉', '🙊', '🤦', '🤷', '🙋', '🙆', '🙅', '💁', '🕺', '💃', '🏃', '🧘'],
  },
  {
    id: 'hearts', label: 'Hearts', icon: '❤️',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '🩷', '🩵', '💔', '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '💯', '💢', '💥', '💫', '💦', '💨', '🕳️', '💬', '💭', '💤'],
  },
  {
    id: 'music', label: 'Music', icon: '🎵',
    emojis: ['🎵', '🎶', '🎤', '🎧', '🎼', '🎹', '🥁', '🪘', '🎷', '🎺', '🪗', '🎸', '🪕', '🎻', '🪈', '📻', '🎙️', '🔊', '🔉', '🔈', '🔇', '📢', '📣', '🎬', '🎞️', '🍿', '📼', '💿', '📀', '🎟️', '🎫', '🪩', '🎭', '🎪'],
  },
  {
    id: 'party', label: 'Party', icon: '🎉',
    emojis: ['🎉', '🎊', '🥳', '🎈', '🎂', '🎁', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '👑', '💎', '🔥', '✨', '⭐', '🌟', '⚡', '🌈', '☀️', '🌙', '🎯', '🎲', '🎮', '🕹️', '🧩', '🃏', '🚀', '💸', '💰', '🧨', '🎆', '🎇', '🪅', '🍾', '🥂', '🍻'],
  },
  {
    id: 'food', label: 'Food', icon: '🍕',
    emojis: ['🍕', '🍔', '🍟', '🌭', '🌮', '🌯', '🥪', '🍗', '🍖', '🍜', '🍝', '🍛', '🍣', '🍱', '🥟', '🍤', '🍙', '🍚', '🥘', '🧆', '🥗', '🍿', '🧂', '🥨', '🍩', '🍪', '🎂', '🍰', '🧁', '🍫', '🍬', '🍭', '🍦', '🍨', '🥭', '🍉', '🍓', '🍌', '🌶️', '☕', '🍵', '🧋', '🥤', '🧃'],
  },
  {
    id: 'animals', label: 'Animals', icon: '🐶',
    emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🐔', '🐧', '🐦', '🦆', '🦅', '🦉', '🦄', '🐝', '🦋', '🐌', '🐞', '🐢', '🐍', '🦖', '🐙', '🦑', '🦀', '🐬', '🐳', '🦈', '🐊', '🐘', '🦒', '🐐', '🦚', '🦜', '🐉'],
  },
]

/** Keep printable characters (emoji included), collapse runs of blank lines and trim. */
export function sanitizeChat(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    // Control/format characters, except newlines and the zero-width joiner / variation selectors emoji need.
    .replace(/[^\P{C}\n‍️︎]/gu, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_CHAT_LENGTH)
}

/** True when a message is only a few emoji (shown big, like in messaging apps). */
export function isEmojiOnly(text: string): boolean {
  const t = text.replace(/\s+/g, '')
  if (!t || t.length > 24) return false
  return /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️)+$/u.test(t) && !/^[\d#*]+$/.test(t)
}

export interface ChatMessage {
  id: string
  /** Player id of the sender (they may have left since). */
  from: string
  name: string
  avatar: number
  photo: string | null
  at: number
  text?: string
  sticker?: StickerId
}

/** In the voice channel: listening with the mic muted, or talking. */
export type VoiceState = 'muted' | 'live'
