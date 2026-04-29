import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ScriptError, ValidationError } from '../../scripts/lib/errors'
import { runScript, type RunScriptDeps } from '../../scripts/lib/run-script'

describe('runScript', () => {
  let deps: RunScriptDeps

  beforeEach(() => {
    deps = {
      error: vi.fn(),
      exit: vi.fn() as unknown as (code: number) => never,
    }
  })

  it('resolves silently when fn returns void', async () => {
    await runScript(deps, () => {})
    expect(deps.error).not.toHaveBeenCalled()
    expect(deps.exit).not.toHaveBeenCalled()
  })

  it('resolves silently when fn returns a resolved Promise', async () => {
    await runScript(deps, async () => {
      await Promise.resolve()
    })
    expect(deps.error).not.toHaveBeenCalled()
    expect(deps.exit).not.toHaveBeenCalled()
  })

  it('calls error with prefixed message and exits with ScriptError exitCode', async () => {
    const err = new ScriptError('something broke', { exitCode: 3 })
    await runScript(deps, () => {
      throw err
    })
    expect(deps.error).toHaveBeenCalledWith('❌ something broke')
    expect(deps.exit).toHaveBeenCalledWith(3)
  })

  it('exits with code 2 for ValidationError (subclass exitCode propagates)', async () => {
    const err = new ValidationError('bad precondition')
    await runScript(deps, () => {
      throw err
    })
    expect(deps.error).toHaveBeenCalledWith('❌ bad precondition')
    expect(deps.exit).toHaveBeenCalledWith(2)
  })

  it('exits 1 with "Unexpected error:" prefix for plain Error', async () => {
    await runScript(deps, () => {
      throw new Error('unexpected problem')
    })
    expect(deps.error).toHaveBeenCalledWith('❌ Unexpected error: unexpected problem')
    expect(deps.exit).toHaveBeenCalledWith(1)
  })

  it('exits 1 with "Unknown error:" prefix for non-Error throw', async () => {
    await runScript(deps, () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'a string was thrown'
    })
    expect(deps.error).toHaveBeenCalledWith('❌ Unknown error: a string was thrown')
    expect(deps.exit).toHaveBeenCalledWith(1)
  })

  it('handles async fn that rejects with a ScriptError', async () => {
    const err = new ScriptError('async failure', { exitCode: 1 })
    await runScript(deps, async () => {
      await Promise.reject(err)
    })
    expect(deps.error).toHaveBeenCalledWith('❌ async failure')
    expect(deps.exit).toHaveBeenCalledWith(1)
  })

  it('handles async fn that rejects with a ValidationError', async () => {
    const err = new ValidationError('async validation failure')
    await runScript(deps, async () => {
      await Promise.reject(err)
    })
    expect(deps.exit).toHaveBeenCalledWith(2)
  })
})
