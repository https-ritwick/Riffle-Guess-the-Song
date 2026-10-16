import { describe, expect, it } from 'vitest'
import { isEmojiOnly, MAX_CHAT_LENGTH, sanitizeChat, STICKERS } from '../../src/shared/chat'
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
