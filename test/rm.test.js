import test from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { rm } from '../utils.js'

test('rm removes nested directories', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-test-'))
  const nested = path.join(base, 'a/b/c')
  fs.mkdirSync(nested, { recursive: true })
  fs.writeFileSync(path.join(nested, 'file.txt'), 'content')
  rm(base)
  assert.ok(!fs.existsSync(base))
})