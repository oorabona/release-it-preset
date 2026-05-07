import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('package.json files field', () => {
  it('includes scripts/templates so workflow templates ship in the tarball', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(pkg.files).toBeDefined()
    expect(pkg.files).toContain('scripts/templates')
  })
})
