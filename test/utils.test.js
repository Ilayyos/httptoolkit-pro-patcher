import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { isPatched, rm } from '../utils.js'

test('isPatched detects patched and unpatched apps', () => {
  const dir = path.join(os.tmpdir(), 'httptoolkit-test')
  fs.mkdirSync(dir, { recursive: true })
  const asarPath = path.join(dir, 'app.asar')
  fs.writeFileSync(asarPath, 'Injected by HTTP Toolkit Patcher')
  assert.ok(isPatched(dir))
  fs.writeFileSync(asarPath, 'regular content')
  assert.ok(!isPatched(dir))
  rm(dir)
})