import { ScriptError } from './errors.js'

export interface RunScriptDeps {
  error: (msg: string) => void
  exit: (code: number) => never
}

/**
 * Wraps a script's main function with consistent error handling and
 * exit-code mapping. ScriptError subclasses exit with their specific
 * exitCode; any other thrown value exits 1 with a generic message.
 *
 * The function may be sync or async. Returns a promise that resolves
 * before exit() is called for the failure path; on success the promise
 * simply resolves (exit() is not invoked — caller can let process end
 * naturally with code 0).
 */
export async function runScript(
  deps: RunScriptDeps,
  fn: () => void | Promise<void>,
): Promise<void> {
  try {
    await fn()
  } catch (err: unknown) {
    if (err instanceof ScriptError) {
      deps.error(`❌ ${err.message}`)
      deps.exit(err.exitCode)
    }
    if (err instanceof Error) {
      deps.error(`❌ Unexpected error: ${err.message}`)
      deps.exit(1)
    }
    deps.error(`❌ Unknown error: ${String(err)}`)
    deps.exit(1)
  }
}
