/**
 * Host baseline contract for the fork: DSH peers/dev pins, the standalone
 * installers' CLI gate and npx fallback, the e2e fallback and CI must move
 * together, without floating CLI tags.
 *
 * Fork notes: `package.json` here is `dsh-better-sidebar-sanmu`, so the identity
 * assertions inherited from upstream no longer apply; what still matters is that
 * the *host* baseline (`0.2.1-rc.1`) is declared identically everywhere, and that
 * CI runs the gates this fork actually relies on (typecheck + bundle + the
 * vitest suite).
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const baseline = '0.2.1-rc.1'
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const bash = readFileSync(new URL('../scripts/install.sh', import.meta.url), 'utf8')
const powershell = readFileSync(new URL('../scripts/install.ps1', import.meta.url), 'utf8')
const e2e = readFileSync(new URL('../scripts/e2e-common.sh', import.meta.url), 'utf8')
const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')

describe('DSH host baseline', () => {
  it('keeps all DSH package peers and dev pins on the exact baseline', () => {
    for (const [section, prefix] of [['peerDependencies', '^'], ['devDependencies', '']] as const) {
      const entries = Object.entries(pkg[section]).filter(([name]) => name.startsWith('@deepseek-ai/dsh-'))
      expect(entries.length, section).toBeGreaterThan(0)
      for (const [name, version] of entries) {
        expect(version, `${section}.${name}`).toBe(`${prefix}${baseline}`)
      }
    }
  })

  it('does not publish or depend on the retired invariant companion', () => {
    expect(pkg.exports).not.toHaveProperty('./invariant')
    expect(pkg.files).not.toContain('lib/invariant.js')
    for (const section of ['peerDependencies', 'devDependencies', 'dependencies']) {
      expect(pkg[section]).not.toHaveProperty('@deepseek-ai/dsh-invariants')
    }
  })

  it('gates both installers on the same CLI floor as the package engines', () => {
    // The floor moves with the peers: the host compares the *installing* CLI
    // against the plugin's peer range, so an older CLI rejects the install.
    const floor = /^>=([^ <]+)/.exec(pkg.engines.dsh)?.[1]
    expect(floor).toBe(baseline)
    expect(bash).toContain(`DSH_BASELINE="${floor}"`)
    expect(powershell).toContain(`$DSH_BASELINE = '${floor}'`)
  })

  it('keeps both installer npx fallbacks on one named constant', () => {
    // A hard-coded version at the call site is what let an older CLI slip
    // through before; the fallback is one constant per script.
    expect(bash).toMatch(/^DSH_NPX_SPEC="\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?"$/m)
    expect(bash).toContain('printf \'npx -y --package @deepseek-ai/dsh@%s dsh\' "$DSH_NPX_SPEC"')
    expect(powershell).toMatch(/^\$DSH_NPX_SPEC = '\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?'$/m)
    expect(powershell).toContain('"@deepseek-ai/dsh@$DSH_NPX_SPEC"')
    for (const source of [bash, powershell]) {
      expect(source).not.toMatch(/package @deepseek-ai\/dsh@\d/)
    }
  })

  it('pins the e2e fallback and expected version to the same baseline', () => {
    expect(e2e).toContain('DSH_NPX_SPEC="${DSH_NPX_SPEC:-@deepseek-ai/dsh@' + baseline + '}"')
    expect(e2e).toContain('expected="${DSH_EXPECT_VERSION:-' + baseline + '}"')
  })

  it.each(['\n', '\r\n'])('runs typecheck, bundle and the vitest suite in CI (%j)', (eol) => {
    // Git may check out YAML as CRLF on Windows; the contract is the same.
    const source = ci.replace(/\r?\n/g, eol)
    expect(source).toContain('NODE_OPTIONS: --max-old-space-size=4096')
    expect(source).toContain('node node_modules/typescript/bin/tsc -p tsconfig.build.json')
    expect(source).toContain('node node_modules/tsdown/dist/run.mjs')
    // The inherited suite is the regression net for every reused upstream
    // module; a build-only lane let fork-wide breakage land unnoticed.
    expect(source).toContain('run: npm test')
    expect(source).toMatch(/branches: \[main, dev\]/)
  })
})
