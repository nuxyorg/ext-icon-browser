import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { flattenTranslations } from '@nuxyorg/core'
import manifest from '../manifest.json'
import en from '../locales/en.json'
import tr from '../locales/tr.json'
import ja from '../locales/ja.json'

const ROOT = join(__dirname, '..')
const keys = (o: object) => Object.keys(flattenTranslations(o as never)).sort()
const EN = flattenTranslations(en as never)

function sources(): string[] {
  return readdirSync(ROOT, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.ts$/.test(f) && !/(^|\/)(node_modules|tests|dist)\//.test(f))
    .filter((f) => !f.endsWith('.test.ts'))
}

describe('icon-browser i18n', () => {
  it('declares en, tr and ja in the manifest', () => {
    expect(manifest.locales).toEqual({ default: 'en', supported: ['en', 'tr', 'ja'] })
  })

  it('every locale has the same keys', () => {
    expect(keys(tr)).toEqual(keys(en))
    expect(keys(ja)).toEqual(keys(en))
  })

  it('every literal t() key used in the sources exists in en.json', () => {
    const missing: string[] = []
    for (const file of sources()) {
      const text = readFileSync(join(ROOT, file), 'utf8')
      for (const m of text.matchAll(/\bt\(\s*'([\w.]+)'/g)) {
        if (!(m[1] in EN)) missing.push(`${file}: ${m[1]}`)
      }
    }
    expect(missing).toEqual([])
  })
})
