import { describe, expect, it } from 'vitest'
import { CONFIRM_THRESHOLD, matchProperties, suggestProperty, tokenize } from './address'

const CORDOBA = { id: 'cordoba', address: 'Cordoba 320, 2A' }
const MITRE = { id: 'mitre', address: 'Bartolome Mitre 1588 2D' }

/** A bill for the Cordoba apartment that also name-drops Bartolome Mitre — the
 * vendor's own office is on that street. The motivating false positive. */
const cordobaBill = `
  EDENOR S.A. FACTURA B 0001-00123456
  Domicilio comercial: Bartolome Mitre 4100, Ciudad de Buenos Aires
  Periodo: 05/2026  Vencimiento: 18/06/2026
  Titular: A. Antonov
  Domicilio de suministro: CORDOBA 320 PISO 2 DTO A - C1030
  Numero de cuenta: 12345678  Total a pagar: $ 24.310,55
`

const score = (text: string, id: string) =>
  matchProperties(text, [CORDOBA, MITRE]).find((m) => m.propertyId === id)?.confidence ?? 0

describe('matchProperties', () => {
  it('picks the property whose address is clustered in the bill, not the street it merely mentions', () => {
    const [top, ...rest] = matchProperties(cordobaBill, [CORDOBA, MITRE])
    expect(top.propertyId).toBe('cordoba')
    expect(top.confidence).toBeGreaterThanOrEqual(CONFIRM_THRESHOLD)
    // Mitre's street is right there in the text, but "1588" isn't next to it.
    expect(rest[0].propertyId).toBe('mitre')
    expect(rest[0].confidence).toBeLessThan(0.5)
  })

  it('ranks a real bill missing its apartment above a passing mention of another street', () => {
    // Cordoba's own bill, apartment not printed, and the vendor's Mitre office
    // in the header. Cordoba has more of its address here and must rank first —
    // counting whole tokens instead of characters gets this backwards, because
    // "2A" is two tokens and "1588" is only one.
    const bill = `
      Domicilio comercial: Bartolome Mitre 4100, CABA
      Domicilio de suministro: CORDOBA 320 - C1030 - CABA
    `
    const out = matchProperties(bill, [CORDOBA, MITRE])
    expect(out.map((m) => m.propertyId)).toEqual(['cordoba', 'mitre'])
    // ...but neither is strong enough to ask a yes/no about.
    expect(suggestProperty(bill, [CORDOBA, MITRE])?.confident).toBe(false)
  })

  it('scores a street mention without its number far below the threshold', () => {
    const text = 'Oficina comercial: Bartolome Mitre 4100. Pague en linea.'
    expect(score(text, 'mitre')).toBeLessThan(0.5)
    expect(score(text, 'mitre')).toBeGreaterThan(0)
  })

  it('ignores accents on either side', () => {
    const accented = { id: 'mitre', address: 'Bartolomé Mitre 1588' }
    const bill = 'Domicilio: BARTOLOME MITRE 1588, CABA'
    expect(matchProperties(bill, [accented])[0].confidence).toBeGreaterThanOrEqual(CONFIRM_THRESHOLD)

    const plain = { id: 'mitre', address: 'Bartolome Mitre 1588' }
    const accentedBill = 'Domicilio: Bartolomé Mitre 1588, CABA'
    expect(matchProperties(accentedBill, [plain])[0].confidence).toBeGreaterThanOrEqual(CONFIRM_THRESHOLD)
  })

  it('matches every apartment spelling against one saved address', () => {
    const spellings = [
      'Cordoba 320, 2A',
      'CORDOBA 320 2° A',
      'Cordoba 320 02-A',
      'Cordoba 320 2-A',
      'Cordoba 320 2 A',
      'Cordoba 320 - Piso 2, Dto. A',
      'CORDOBA 320 PISO 2 DEPTO A',
    ]
    for (const bill of spellings) {
      expect(
        matchProperties(`Domicilio de suministro: ${bill} - C1049`, [CORDOBA])[0]?.confidence,
        `bill spelled "${bill}"`,
      ).toBeGreaterThanOrEqual(CONFIRM_THRESHOLD)
    }
  })

  it('is not fooled by short address tokens landing in ambient prose', () => {
    // "a" is also a Spanish preposition and "2" is just a digit, so all four of
    // Cordoba's tokens really do turn up within a few words here. What saves us
    // is order: the address reads cordoba→320→2→a, this prose reads
    // cordoba→320→a→2. Keep the digit here equal to the apartment's — with any
    // other digit these decoys pass for the wrong reason (a missing token) and
    // stop guarding the ordering rule at all.
    const decoys = [
      'Suministro: Cordoba 320 corresponde a la factura 2 del periodo',
      'Cordoba 320 - vence a los 2 dias',
      'Calle Cordoba 320 Total a pagar 2.310,55',
    ]
    for (const text of decoys) {
      expect(matchProperties(text, [CORDOBA])[0]?.confidence ?? 0, `decoy: "${text}"`).toBeLessThan(CONFIRM_THRESHOLD)
    }
  })

  it('does not match a different building on the same street', () => {
    // 3204 and 210 are their own tokens — neither is "320". Both bills name
    // apartment 2A, so the street number is the only thing standing between
    // them and a confident match.
    for (const text of ['Domicilio: Cordoba 3204, piso 2 depto A', 'Domicilio: Cordoba 210 2A']) {
      expect(matchProperties(text, [CORDOBA])[0]?.confidence ?? 0, `bill: "${text}"`).toBeLessThan(CONFIRM_THRESHOLD)
    }
  })

  it('drops a property whose address matches nothing', () => {
    expect(matchProperties('Av. Corrientes 1234', [CORDOBA])).toEqual([])
  })

  it('drops a property with an empty address instead of matching everything', () => {
    expect(matchProperties(cordobaBill, [{ id: 'blank', address: '' }])).toEqual([])
    expect(matchProperties(cordobaBill, [{ id: 'punct', address: ' , - ' }])).toEqual([])
  })

  it('does not reward tokens scattered across the page', () => {
    const filler = 'lorem ipsum dolor sit amet '.repeat(20)
    const scattered = `CORDOBA ${filler} 320 ${filler} 2 A`
    expect(matchProperties(scattered, [CORDOBA])[0]?.confidence ?? 0).toBeLessThan(CONFIRM_THRESHOLD)
  })

  it('returns matches best-first', () => {
    const out = matchProperties(cordobaBill, [MITRE, CORDOBA])
    expect(out.map((m) => m.propertyId)).toEqual(['cordoba', 'mitre'])
  })
})

describe('suggestProperty', () => {
  it('is confident about a full, tight, uncontested match', () => {
    const out = suggestProperty(cordobaBill, [CORDOBA, MITRE])
    expect(out).toMatchObject({ propertyId: 'cordoba', confident: true })
  })

  it('suggests but is not confident when the apartment is missing from the bill', () => {
    // Street and number are there; "4A" is nowhere — could be either unit.
    const bill = 'Domicilio de suministro: CORDOBA 320 - C1030 - CABA'
    const out = suggestProperty(bill, [CORDOBA, { id: 'cordoba-5b', address: 'Cordoba 320, 5B' }])
    expect(out?.confident).toBe(false)
  })

  it('is not confident when two units in the same building both fit', () => {
    // A bill naming only the building, with both units saved.
    const bill = 'Consorcio Cordoba 320 - expensas comunes del edificio'
    const out = suggestProperty(bill, [
      { id: 'a', address: 'Cordoba 320' },
      { id: 'b', address: 'Cordoba 320' },
    ])
    expect(out?.confident).toBe(false)
  })

  it('still resolves the right unit when the bill names it', () => {
    const out = suggestProperty(cordobaBill, [CORDOBA, { id: 'cordoba-5b', address: 'Cordoba 320, 5B' }])
    expect(out).toMatchObject({ propertyId: 'cordoba', confident: true })
  })

  it('returns null when nothing matches at all', () => {
    expect(suggestProperty('Av. Corrientes 1234', [CORDOBA, MITRE])).toBeNull()
  })

  it('returns null for a user with no properties', () => {
    expect(suggestProperty(cordobaBill, [])).toBeNull()
  })
})

describe('tokenize', () => {
  it('splits on separators and on letter/digit boundaries, and strips leading zeros', () => {
    expect(tokenize('Cordoba 320, 2A')).toEqual(['cordoba', '320', '2', 'a'])
    expect(tokenize('CORDOBA 320 2° A')).toEqual(['cordoba', '320', '2', 'a'])
    expect(tokenize('Cordoba 320 02-A')).toEqual(['cordoba', '320', '2', 'a'])
  })

  it('keeps a lone zero rather than stripping it away', () => {
    expect(tokenize('Piso 0')).toEqual(['piso', '0'])
  })

  it('returns nothing for text with no letters or digits', () => {
    expect(tokenize(' , - ° ')).toEqual([])
  })
})
