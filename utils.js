import fs from 'fs'
import path from 'path'

export const rm = dirPath => {
  if (!fs.existsSync(dirPath)) return
  if (!fs.lstatSync(dirPath).isDirectory()) return fs.rmSync(dirPath, { force: true })
  for (const entry of fs.readdirSync(dirPath)) {
    const entryPath = path.join(dirPath, entry)
    if (fs.lstatSync(entryPath).isDirectory()) rm(entryPath)
    else fs.rmSync(entryPath, { force: true })
  }
}

export const canWrite = dirPath => {
  try {
    fs.accessSync(dirPath, fs.constants.W_OK)
    return true
  } catch {
    return false
  }
}

export const isPatched = appPath => {
  const filePath = path.join(appPath, 'app.asar')
  if (!fs.existsSync(filePath)) return false
  try {
    return fs.readFileSync(filePath).includes('Injected by HTTP Toolkit Patcher')
  } catch {
    return false
  }
}