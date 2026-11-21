import { describe, expect, it } from 'vitest'
import { DELETE_CONFIRM_WORD, DeleteAccountSchema, isDeleteConfirmation } from '../../src/shared/account'

describe('account deletion confirmation', () => {
  it.each(['DELETE', 'delete', '  Delete ', 'dElEtE'])('accepts %j', (text) => {
    expect(isDeleteConfirmation(text)).toBe(true)
    expect(DeleteAccountSchema.safeParse({ confirm: text }).success).toBe(true)
  })

  it.each(['', 'DELET', 'DELETE ME', 'yes', 'DEL ETE'])('rejects %j', (text) => {
    expect(isDeleteConfirmation(text)).toBe(false)
    const parsed = DeleteAccountSchema.safeParse({ confirm: text })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.message).toBe(`Type ${DELETE_CONFIRM_WORD} to confirm.`)
  })

  it('rejects missing or non-string confirmations', () => {
    for (const body of [null, {}, { confirm: true }, { confirm: 1 }, { confirm: 'x'.repeat(41) }]) {
      expect(DeleteAccountSchema.safeParse(body).success).toBe(false)
    }
    expect(isDeleteConfirmation(undefined)).toBe(false)
  })
})
