import { describe, expect, it } from 'vitest'
import { isEmojiOnly, MAX_CHAT_LENGTH, recipientsOf, replySnapshot, sanitizeChat, STICKERS, tickState, type ChatMessage } from '../../src/shared/chat'
import { ClientMessageSchema } from '../../src/shared/protocol'

describe('chat text', () => {
  it('keeps emoji (including joined ones) and strips control characters', () => {
    expect(sanitizeChat('  hi\u0007 there 👨‍👩‍👧 ❤️  ')).toBe('hi there 👨‍👩‍👧 ❤️')
  })

  it('collapses blank lines and caps the length', () => {
    expect(sanitizeChat('a\r\n\n\n\nb')).toBe('a\n\nb')
    expect(sanitizeChat('x'.repeat(1000))).toHaveLength(MAX_CHAT_LENGTH)
  })

  it('spots emoji-only messages', () => {
    expect(isEmojiOnly('🔥🔥🔥')).toBe(true)
    expect(isEmojiOnly('❤️ 👏')).toBe(true)
    expect(isEmojiOnly('nice 🔥')).toBe(false)
    expect(isEmojiOnly('123')).toBe(false)
  })
})

describe('chat & voice messages', () => {
  it('accepts text, stickers, voice and signalling', () => {
    expect(ClientMessageSchema.safeParse({ t: 'chat', text: 'hello' }).success).toBe(true)
    expect(ClientMessageSchema.safeParse({ t: 'chat', sticker: STICKERS[0].id }).success).toBe(true)
    expect(ClientMessageSchema.safeParse({ t: 'voice', state: 'live' }).success).toBe(true)
    expect(ClientMessageSchema.safeParse({ t: 'voice', state: null }).success).toBe(true)
    expect(ClientMessageSchema.safeParse({ t: 'rtc', to: 'abc', data: '{}' }).success).toBe(true)
  })

  it('rejects unknown stickers and voice states', () => {
    expect(ClientMessageSchema.safeParse({ t: 'chat', sticker: 'nope' }).success).toBe(false)
    expect(ClientMessageSchema.safeParse({ t: 'voice', state: 'loud' }).success).toBe(false)
  })

  it('has unique sticker ids', () => {
    expect(new Set(STICKERS.map((s) => s.id)).size).toBe(STICKERS.length)
  })
})

describe('replies, typing and read receipts', () => {
  it('accepts replies, typing and seen messages', () => {
    expect(ClientMessageSchema.safeParse({ t: 'chat', text: 'same', replyTo: 'abc123' }).success).toBe(true)
    expect(ClientMessageSchema.safeParse({ t: 'typing', on: true }).success).toBe(true)
    expect(ClientMessageSchema.safeParse({ t: 'seen', at: 1_700_000_000_000 }).success).toBe(true)
    expect(ClientMessageSchema.safeParse({ t: 'seen', at: -1 }).success).toBe(false)
    expect(ClientMessageSchema.safeParse({ t: 'typing' }).success).toBe(false)
  })

  it('quotes a short snippet of the original', () => {
    const m: ChatMessage = { id: 'm1', from: 'a', name: 'Asha', avatar: 0, photo: null, at: 1, text: 'x'.repeat(500) }
    const r = replySnapshot(m)
    expect(r).toMatchObject({ id: 'm1', from: 'a', name: 'Asha' })
    expect(r.text!.length).toBeLessThan(200)
    expect(replySnapshot({ ...m, text: undefined, sticker: 'gg' })).toMatchObject({ sticker: 'gg' })
  })

  it('works out the ticks like WhatsApp', () => {
    const players = [{ id: 'me' }, { id: 'b' }, { id: 'c' }]
    const m = { id: 'm1', from: 'me', at: 100 }
    const base = { me: { since: 0, delivered: 100, read: 100 } }
    expect(tickState({ ...m, id: 'local:1', pending: true }, base, players)).toBe('pending')
    expect(tickState(m, { ...base, b: { since: 0, delivered: 100, read: 0 }, c: { since: 0, delivered: 50, read: 0 } }, players)).toBe('sent')
    expect(tickState(m, { ...base, b: { since: 0, delivered: 100, read: 100 }, c: { since: 0, delivered: 100, read: 0 } }, players)).toBe('delivered')
    expect(tickState(m, { ...base, b: { since: 0, delivered: 100, read: 100 }, c: { since: 0, delivered: 120, read: 120 } }, players)).toBe('read')
    // Someone who arrived after the message doesn't hold it back; nor does anyone who left.
    expect(tickState(m, { ...base, b: { since: 0, delivered: 100, read: 100 }, c: { since: 200, delivered: 0, read: 0 } }, players)).toBe('read')
    expect(recipientsOf(m, { ...base, b: { since: 0, delivered: 0, read: 0 }, gone: { since: 0, delivered: 0, read: 0 } }, players)).toEqual(['b'])
    // Nobody else around: a single tick.
    expect(tickState(m, base, [{ id: 'me' }])).toBe('sent')
  })
})
