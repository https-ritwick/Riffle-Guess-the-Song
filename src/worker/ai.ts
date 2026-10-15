// Gemini writes fresh Bollywood challenge questions and themed award names.
//
// Everything here is optional: without GEMINI_API_KEY the games use the curated
// bank and the built-in award names. Every AI answer is schema-checked and
// sanity-checked before it reaches a room, and callers treat failures as "no AI
// this time" rather than errors.
import * as z from 'zod'
import { AWARD_CATEGORIES, type AwardName } from '../shared/awards'
import { bankItems, challengeKey, knownPrompts, sameLine, type ChallengeItem, type GameKind } from '../shared/challenges'
import { compareKey, similarity } from '../shared/text'

/**
 * Tried in order until one answers; GEMINI_MODEL (if set) goes first. Strongest first:
 * a busy model fails fast (503) and the fast lite models take over. Names change often.
 */
const MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite']

/**
 * Google AI Studio keys ("AIza…" and the newer "AQ.…") normally work on the Gemini
 * API; some AQ. keys only work on Vertex AI's express endpoint. Both are tried.
 */
const ENDPOINTS = [
  (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
  (model: string) => `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent`,
]

/** The bindings this module needs (kept narrow so tests can import it). */
type AiEnv = { GEMINI_API_KEY?: string; GEMINI_MODEL?: string }

const SYSTEM = `You write content for Riffle, a Bollywood party quiz that groups of friends in India play on their phones.
Accuracy matters more than novelty: include only items you are certain about — real films, real songs, dialogues as they are actually spoken and credited to the right film and actor. Prefer famous, widely quoted material; skip anything you are unsure of.
Write Hindi in the casual romanised Hinglish people type in WhatsApp. Keep it fun and family-friendly: no slurs, no sexual content, nothing about real people's private lives.
Reply with JSON only, matching the requested schema.`

export function aiEnabled(env: AiEnv): boolean {
  return !!env.GEMINI_API_KEY?.trim()
}

/** The endpoint and model that last worked in this isolate, tried first next time. */
let working: { endpoint: number; model: string } | null = null

class GeminiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/** Gemini's response schema is an OpenAPI subset: upper-case types, no additionalProperties. */
function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema)
  if (!node || typeof node !== 'object') return node
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === 'type' && typeof v === 'string') out.type = v.toUpperCase()
    else if (k === 'properties' && v && typeof v === 'object') {
      out.properties = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, toGeminiSchema(pv)]))
      out.propertyOrdering = Object.keys(v)
    }
    else if (k === 'items' || k === 'required' || k === 'description' || k === 'enum') out[k] = toGeminiSchema(v)
  }
  return out
}

async function call(url: string, key: string, body: unknown, timeoutMs: number): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const data = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]
    promptFeedback?: { blockReason?: string }
    error?: { message?: string; status?: string }
  } | null
  if (!res.ok) throw new GeminiError(res.status, `${data?.error?.status ?? ''} ${data?.error?.message ?? `HTTP ${res.status}`}`.trim())
  const cand = data?.candidates?.[0]
  if (!cand) throw new GeminiError(200, `no answer (${data?.promptFeedback?.blockReason ?? 'empty'})`)
  if (cand.finishReason && cand.finishReason !== 'STOP') throw new GeminiError(200, `stopped: ${cand.finishReason}`)
  return (cand.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('')
}

/** Keep thinking short: these are quick creative tasks, and players are waiting. */
function thinkingFor(model: string): Record<string, unknown> {
  if (model.startsWith('gemini-3')) return { thinkingConfig: { thinkingLevel: 'low' } }
  if (model.startsWith('gemini-2.5')) return { thinkingConfig: { thinkingBudget: model.includes('pro') ? 128 : 0 } }
  return {}
}

export interface Attempt {
  endpoint: 'gemini-api' | 'vertex-express'
  model: string
  result: string
  ms: number
}

/**
 * Ask Gemini for JSON matching `schema`; null when nothing works. Tries the models
 * (and both endpoints) in turn until one answers or the time budget runs out.
 */
async function ask<T extends z.ZodType>(
  env: AiEnv,
  schema: T,
  prompt: string,
  maxTokens: number,
  budgetMs = 55_000,
  attempts: Attempt[] = [],
  perCallMs = 30_000,
): Promise<z.infer<T> | null> {
  const key = env.GEMINI_API_KEY?.trim()
  if (!key) return null
  const base = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  }
  const config = {
    responseMimeType: 'application/json',
    responseSchema: toGeminiSchema(z.toJSONSchema(schema)),
    temperature: 0.9,
    maxOutputTokens: maxTokens,
  }
  const models = [...new Set([env.GEMINI_MODEL?.trim(), ...MODELS].filter((m): m is string => !!m))]
  const endpoints = working ? [working.endpoint, ...ENDPOINTS.keys()].filter((e, i, a) => a.indexOf(e) === i) : [...ENDPOINTS.keys()]
  const deadline = Date.now() + budgetMs
  for (const endpoint of endpoints) {
    for (const model of models) {
      const left = deadline - Date.now()
      if (left < 3000) {
        console.error('ai: out of time', JSON.stringify(attempts))
        return null
      }
      const started = Date.now()
      const note = (result: string) => attempts.push({ endpoint: endpoint === 0 ? 'gemini-api' : 'vertex-express', model, result: result.slice(0, 200), ms: Date.now() - started })
      try {
        const text = await call(ENDPOINTS[endpoint]!(model), key, { ...base, generationConfig: { ...config, ...thinkingFor(model) } }, Math.min(left, perCallMs))
        const parsed = schema.safeParse(JSON.parse(text))
        if (!parsed.success) {
          note('answer did not match the schema')
          continue
        }
        note('ok')
        working = { endpoint, model }
        return parsed.data
      } catch (err) {
        if (err instanceof GeminiError) {
          note(`${err.status} ${err.message}`)
          // This key isn't accepted on this endpoint: try the other one.
          if (err.status === 401 || err.status === 403 || (err.status === 400 && /api key|credential|token/i.test(err.message))) break
          // A setting this model doesn't support: retry it once without the thinking settings.
          if (err.status === 400 && /thinking/i.test(err.message)) {
            try {
              const text = await call(ENDPOINTS[endpoint]!(model), key, { ...base, generationConfig: config }, Math.min(deadline - Date.now(), perCallMs))
              const parsed = schema.safeParse(JSON.parse(text))
              if (parsed.success) {
                note('ok (without thinking settings)')
                working = { endpoint, model }
                return parsed.data
              }
            } catch {
              // fall through to the next model
            }
          }
          // Quota exhausted for the whole key: no point trying more models.
          if (err.status === 429 && /quota/i.test(err.message) && !/model/i.test(err.message)) {
            console.warn('ai: quota exhausted', JSON.stringify(attempts))
            return null
          }
          continue
        }
        // Timeouts and network errors: try the next model.
        note(err instanceof Error ? `${err.name}: ${err.message}` : 'failed')
      }
    }
  }
  console.error('ai: no endpoint/model worked', JSON.stringify(attempts))
  return null
}

/** For /api/ai/health: does the key work, which model answers, and what did each attempt say? */
export async function aiHealth(env: AiEnv, probe?: string | null): Promise<{ configured: boolean; ok: boolean; model: string | null; endpoint: string | null; attempts: Attempt[] }> {
  if (!aiEnabled(env)) return { configured: false, ok: false, model: null, endpoint: null, attempts: [] }
  const attempts: Attempt[] = []
  working = null
  // ?model=… tries that model first (with longer to answer), to compare models.
  const model = probe && /^[a-z0-9.-]{3,48}$/.test(probe) ? probe : null
  const res = await ask(model ? { ...env, GEMINI_MODEL: model } : env, z.object({ ok: z.boolean() }), 'Reply with {"ok": true}.', 300, 28_000, attempts, model ? 25_000 : 9_000)
  // `ask` sets this when a model answers (TypeScript can't see that through the call).
  const w = working as { endpoint: number; model: string } | null
  return { configured: true, ok: !!res?.ok, model: w?.model ?? null, endpoint: w ? (w.endpoint === 0 ? 'gemini-api' : 'vertex-express') : null, attempts }
}

// ---------------------------------------------------------------------------
// Challenge questions

const Decoys = z.array(z.string()).describe('Exactly 3 believable wrong answers')

const DialogueSchema = z.object({
  items: z.array(
    z.object({
      dialogue: z.string().describe('The line as spoken, in Hinglish, under 160 characters'),
      meaning: z.string().describe('Short English meaning'),
      movie: z.string(),
      year: z.number().int(),
      character: z.string(),
      actor: z.string(),
      wrongMovies: Decoys,
    }),
  ),
})

const StarSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      clues: z.array(z.string()).describe('Exactly 3 clues, hardest first, never naming the star'),
      peakDecade: z.number().int(),
      wrongStars: Decoys,
    }),
  ),
})

// Order matters: pick the song, work out the decode, and only then write the emojis.
const EmojiSchema = z.object({
  items: z.array(
    z.object({
      song: z.string().describe('Song title exactly as on the official soundtrack'),
      movie: z.string(),
      year: z.number().int(),
      singer: z.string(),
      decode: z.string().describe('How each emoji maps to the title, e.g. "📅 kal (tomorrow) · 🤷 ho naa ho (may or may not be)"'),
      emojis: z.string().describe('3 to 6 emojis, in title order, exactly the ones in the decode'),
      wrongSongs: Decoys,
    }),
  ),
})

const thisYear = () => new Date().getUTCFullYear()

function brief(game: Exclude<GameKind, 'songs'>, count: number): string {
  const y = thisYear()
  switch (game) {
    case 'dialogue':
      return `Write ${count} "guess the movie from the dialogue" questions. Mix eras from the 1960s to ${y}: mostly blockbusters and cult classics, a few from the last three years, and dialogues that became memes. For each give the dialogue, its English meaning, the film (title as commonly written), release year, the character and the actor who says it, and 3 wrong-answer Hindi films that are easy to confuse with it (same star, same era or same genre) — never the right film.`
    case 'actor':
      return `Write ${count} "guess the star" questions about Hindi film actors and actresses (pan-India stars from the South are fine). Cover legends, 90s icons, today's stars and fan favourites from OTT. For each give the name, 3 clues from hardest to easiest (under 110 characters each, never containing the name or surname), the decade of their peak, and 3 wrong-answer stars of the same gender and a similar era.`
    case 'emoji':
      return `Write ${count} "guess the Bollywood song from emojis" puzzles. Players see only the emojis and pick the song from four titles.

What makes a good puzzle:
- Encode the song TITLE, word by word and in order: translate each Hindi word to the thing it means (kal = 📅 tomorrow, chaand = 🌙, baarish/barsa = 🌧️, dil = ❤️, aankhen = 👀, rang = 🎨, ek do teen = 1️⃣2️⃣3️⃣), or use a sound-alike. You may add ONE emoji for the song's famous picturisation (the train in "Chaiyya Chaiyya", Holi colours in "Balam Pichkari").
- Every emoji must map to a word or that one iconic visual. No filler, mood or decoration emojis (no ✨🎶❤️‍🔥 just for vibes).
- A fan should crack it within a few seconds once they think of the words; the emojis must NOT fit dozens of other songs. "🎵❤️😍" is a bad puzzle.
- Only real, very popular Hindi film songs whose title has concrete, picturable words. Use the exact soundtrack title, film and year — skip any song you are not sure about.
- No letters, digits written as text, or flags that spell the answer.
- Mix classics, 90s and 2000s hits and recent chartbusters (up to ${y}).

Good examples (do not reuse them):
- Kal Ho Naa Ho (Kal Ho Naa Ho, 2003) → 📅➡️🤷❓ — decode: 📅➡️ kal (tomorrow) · 🤷❓ ho naa ho (may or may not be)
- Ek Do Teen (Tezaab, 1988) → 1️⃣2️⃣3️⃣💃 — decode: 1️⃣2️⃣3️⃣ ek do teen · 💃 Madhuri's dance
- Tum Hi Ho (Aashiqui 2, 2013) → 🫵☝️❤️ — decode: 🫵 tum (you) · ☝️ hi (only) · ❤️ ho (are — a love song)
- Tip Tip Barsa Paani (Mohra, 1994) → 💧💧🌧️🔥 — decode: 💧💧 tip tip · 🌧️ barsa paani (rain falls) · 🔥 "paani ne aag lagayi"
- Kajra Re (Bunty Aur Babli, 2005) → 👁️🖤💃 — decode: 👁️🖤 kajra (kohl on the eyes) · 💃 the mujra

For each puzzle give the song title, film, year, main singer, the decode, the emojis, and 3 wrong-answer real Hindi film song titles a player could believably confuse it with (same era, mood or a similar word).`
  }
}

function clean(s: string, max: number): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Three distinct wrong answers that aren't (a spelling of) the right one. */
function decoys(list: string[], answer: string): string[] | null {
  const out: string[] = []
  for (const raw of list) {
    const d = clean(raw, 80)
    if (!d || compareKey(d) === compareKey(answer) || similarity(d, answer) >= 0.85) continue
    if (out.some((o) => compareKey(o) === compareKey(d))) continue
    out.push(d)
  }
  return out.length >= 3 ? out.slice(0, 3) : null
}

const validYear = (y: number) => (y >= 1940 && y <= thisYear() + 1 ? y : null)

/** Turn the AI's answer into playable items, dropping anything that fails a sanity check. */
export function toItems(game: Exclude<GameKind, 'songs'>, parsed: unknown): ChallengeItem[] {
  const out: ChallengeItem[] = []
  if (game === 'dialogue') {
    for (const d of (parsed as z.infer<typeof DialogueSchema>).items) {
      const movie = clean(d.movie, 80)
      const line = clean(d.dialogue, 200)
      const wrong = decoys(d.wrongMovies, movie)
      if (!movie || line.length < 4 || !wrong) continue
      // A dialogue that names its own film gives the answer away.
      if (compareKey(line).includes(compareKey(movie)) && compareKey(movie).length > 4) continue
      const year = validYear(d.year)
      out.push({
        id: challengeKey('dialogue', line, movie),
        kind: 'dialogue',
        prompt: line,
        clues: [],
        answer: movie,
        decoys: wrong,
        detail: `${clean(d.character, 60)} (${clean(d.actor, 60)}) · ${movie}${year ? ` (${year})` : ''}`,
        note: clean(d.meaning, 160),
        year,
        ai: true,
      })
    }
  } else if (game === 'actor') {
    for (const s of (parsed as z.infer<typeof StarSchema>).items) {
      const name = clean(s.name, 60)
      const clues = s.clues.map((c) => clean(c, 140)).filter(Boolean).slice(0, 3)
      const wrong = decoys(s.wrongStars, name)
      if (!name || clues.length < 3 || !wrong) continue
      // Clues must never contain any part of the name.
      const parts = name.toLowerCase().split(/\s+/).filter((p) => p.length > 2)
      if (clues.some((c) => parts.some((p) => c.toLowerCase().includes(p)))) continue
      out.push({ id: challengeKey('actor', '', name), kind: 'actor', prompt: '', clues, answer: name, decoys: wrong, detail: clues[2]!, note: '', year: s.peakDecade >= 1940 ? s.peakDecade : null, ai: true })
    }
  } else {
    for (const e of (parsed as z.infer<typeof EmojiSchema>).items) {
      const title = clean(e.song, 80)
      const emojis = clean(e.emojis, 40).replace(/\s+/g, '')
      const wrong = decoys(e.wrongSongs, title)
      // Emoji clues only (no letters that spell the answer out), and a decode that explains them.
      if (!title || !emojis || /[a-z]/i.test(emojis) || !wrong || clean(e.decode, 200).length < 6) continue
      if ([...new Intl.Segmenter().segment(emojis)].length < 2) continue
      const year = validYear(e.year)
      const movie = clean(e.movie, 80)
      const singer = clean(e.singer, 60)
      out.push({
        id: challengeKey('emoji', emojis, title),
        kind: 'emoji',
        prompt: emojis,
        clues: [],
        answer: title,
        decoys: wrong,
        detail: `${movie}${year ? ` (${year})` : ''} · ${singer}`,
        note: clean(e.decode, 200),
        year,
        song: { title, movie, singer },
        ai: true,
      })
    }
  }
  return out
}

/**
 * Fresh questions for a challenge game. `avoid` summarises items this room has
 * already seen; the curated bank is listed too so the AI writes new material.
 */
export async function generateChallenges(env: AiEnv, game: Exclude<GameKind, 'songs'>, count: number, avoid: string[]): Promise<ChallengeItem[]> {
  const schema = game === 'dialogue' ? DialogueSchema : game === 'actor' ? StarSchema : EmojiSchema
  // Emoji puzzles go through a strict review, so write extra.
  if (game === 'emoji') count = Math.round(count * 1.6)
  const skip = [...knownPrompts(game), ...avoid].slice(0, 260)
  const prompt = `${brief(game, count)}

Do not reuse any of these — they are already in the game:
${skip.map((s) => `- ${s}`).join('\n')}`
  const parsed = await ask(env, schema, prompt, 12_000)
  if (!parsed) return []
  const items = dropRepeats(game, toItems(game, parsed), avoid)
  return game === 'emoji' ? reviewEmoji(env, items) : items
}

const ReviewSchema = z.object({
  reviews: z.array(
    z.object({
      n: z.number().int().describe('The puzzle number'),
      problem: z.string().describe('What is weak about it, or "none"'),
      score: z.number().int().describe('1 to 5'),
    }),
  ),
})

/**
 * A second, strict pass: Gemini grades each emoji puzzle like a quiz editor, and
 * only clear, word-by-word puzzles are kept. If the review fails, the puzzles stay.
 */
async function reviewEmoji(env: AiEnv, items: ChallengeItem[]): Promise<ChallengeItem[]> {
  if (items.length === 0) return items
  const list = items.map((it, i) => `${i + 1}. ${it.prompt} → "${it.answer}" (${it.detail}) — decode: ${it.note}`).join('\n')
  const review = await ask(
    env,
    ReviewSchema,
    `You are a strict quiz editor checking "guess the Bollywood song from emojis" puzzles before they go live.
For each puzzle, score 1–5:
5 = every emoji clearly stands for a word of the title (in order) or its one famous visual; a fan would get it in seconds.
4 = clear, with at most one slightly loose emoji.
3 = guessable only with luck, or one emoji is just mood/decoration.
2 = mostly vibes; fits many songs.
1 = wrong song, wrong film, misspelt title, or the emojis don't relate to the title.
Be harsh: a decoration emoji (✨💖🎬🎶) or a "vibe" emoji counts against it. Also check the song really is from that film.

${list}`,
    3000,
    40_000,
  )
  if (!review) return items
  const scores = new Map(review.reviews.map((r) => [r.n, r.score]))
  const kept = items.filter((_, i) => (scores.get(i + 1) ?? 0) >= 4)
  console.log(`ai: emoji review kept ${kept.length}/${items.length}`)
  return kept
}

/**
 * Drop AI items that are really ones we already have: the same dialogue spelt a
 * little differently, or the same star or song as the bank or an earlier batch.
 */
export function dropRepeats(game: Exclude<GameKind, 'songs'>, items: ChallengeItem[], seen: string[]): ChallengeItem[] {
  const bank = bankItems(game)
  const bankIds = new Set(bank.map((i) => i.id))
  const lines = [...bank.map((i) => i.prompt).filter(Boolean), ...seen.map((s) => s.split(' → ')[0]!).filter(Boolean)]
  const seenAnswers = new Set(seen.map((s) => compareKey(s.split(' → ').at(-1)!)))
  const out: ChallengeItem[] = []
  for (const item of items) {
    if (bankIds.has(item.id)) continue
    if (item.kind === 'dialogue' || item.kind === 'quote') {
      if (lines.some((l) => sameLine(l, item.prompt)) || out.some((o) => sameLine(o.prompt, item.prompt))) continue
    } else if (seenAnswers.has(compareKey(item.answer)) || out.some((o) => o.id === item.id)) continue
    out.push(item)
  }
  return out
}

// ---------------------------------------------------------------------------
// Award names

const AwardSchema = z.object({
  awards: z.array(
    z.object({
      id: z.string(),
      title: z.string().describe('2–5 words: a Bollywood film title, dialogue or trend, twisted to fit'),
      line: z.string().describe('A witty one-liner under 70 characters'),
    }),
  ),
})

/**
 * Brand-new names for this game's awards, themed on what was played. Falls back
 * to null (the caller keeps the built-in names).
 */
export async function generateAwardNames(
  env: AiEnv,
  context: { what: string; highlights: string[]; players: number; avoid: string[] },
): Promise<Record<string, AwardName> | null> {
  const categories = AWARD_CATEGORIES.map((c) => `- ${c.id}: ${c.meaning}`).join('\n')
  const prompt = `Name tonight's awards for a game of Riffle (${context.what}, ${context.players} player${context.players === 1 ? '' : 's'}).
Some of tonight's songs or questions: ${context.highlights.slice(0, 10).join('; ') || '—'}.

Give every category below a fresh, funny award name built from a famous Bollywood film title, dialogue, song hook or current Bollywood/Indian internet trend, bent to fit what the award is for — plus a one-line caption (a dialogue twist or roast works well). Hinglish is great. Where natural, riff on tonight's songs or questions. Each title must be different, and none of these recent names: ${context.avoid.slice(0, 60).join(', ') || '—'}.

Categories (use these ids exactly):
${categories}`
  const parsed = await ask(env, AwardSchema, prompt, 4000)
  if (!parsed) return null
  const out: Record<string, AwardName> = {}
  const used = new Set(context.avoid.map((a) => a.toLowerCase()))
  for (const a of parsed.awards) {
    const title = clean(a.title, 42)
    const line = clean(a.line, 90)
    if (!AWARD_CATEGORIES.some((c) => c.id === a.id) || !title || !line || used.has(title.toLowerCase())) continue
    used.add(title.toLowerCase())
    out[a.id] = { title, line }
  }
  return Object.keys(out).length ? out : null
}
