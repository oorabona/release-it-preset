import { describe, expect, it } from 'vitest'
import {
  ChangelogError,
  GitError,
  ScriptError,
  ValidationError,
} from '../../scripts/lib/errors'

describe('ScriptError', () => {
  it('has a default exitCode of 1', () => {
    const err = new ScriptError('something went wrong')
    expect(err.exitCode).toBe(1)
  })

  it('accepts a custom exitCode', () => {
    const err = new ScriptError('something went wrong', { exitCode: 3 })
    expect(err.exitCode).toBe(3)
  })

  it('preserves cause when provided', () => {
    const cause = new Error('root cause')
    const err = new ScriptError('wrapper', { cause })
    expect(err.cause).toBe(cause)
  })

  it('does not set cause when not provided', () => {
    const err = new ScriptError('no cause')
    expect(err.cause).toBeUndefined()
  })

  it('is an instance of Error', () => {
    const err = new ScriptError('test')
    expect(err).toBeInstanceOf(Error)
  })

  it('has the correct name', () => {
    const err = new ScriptError('test')
    expect(err.name).toBe('ScriptError')
  })

  it('has the correct message', () => {
    const err = new ScriptError('my message')
    expect(err.message).toBe('my message')
  })
})

describe('ValidationError', () => {
  it('has exitCode 2', () => {
    const err = new ValidationError('bad input')
    expect(err.exitCode).toBe(2)
  })

  it('name is ValidationError', () => {
    const err = new ValidationError('bad input')
    expect(err.name).toBe('ValidationError')
  })

  it('is an instance of ScriptError and Error', () => {
    const err = new ValidationError('bad input')
    expect(err).toBeInstanceOf(ScriptError)
    expect(err).toBeInstanceOf(Error)
  })

  it('preserves cause', () => {
    const cause = new Error('underlying')
    const err = new ValidationError('validation failed', { cause })
    expect(err.cause).toBe(cause)
  })
})

describe('GitError', () => {
  it('has exitCode 1', () => {
    const err = new GitError('tag not found')
    expect(err.exitCode).toBe(1)
  })

  it('name is GitError', () => {
    const err = new GitError('tag not found')
    expect(err.name).toBe('GitError')
  })

  it('is an instance of ScriptError and Error', () => {
    const err = new GitError('tag not found')
    expect(err).toBeInstanceOf(ScriptError)
    expect(err).toBeInstanceOf(Error)
  })
})

describe('ChangelogError', () => {
  it('has exitCode 1', () => {
    const err = new ChangelogError('malformed changelog')
    expect(err.exitCode).toBe(1)
  })

  it('name is ChangelogError', () => {
    const err = new ChangelogError('malformed changelog')
    expect(err.name).toBe('ChangelogError')
  })

  it('is an instance of ScriptError and Error', () => {
    const err = new ChangelogError('malformed changelog')
    expect(err).toBeInstanceOf(ScriptError)
    expect(err).toBeInstanceOf(Error)
  })
})
