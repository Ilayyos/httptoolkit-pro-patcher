'use strict'

const { HttpsProxyAgent } = require('https-proxy-agent')
const axios = require('axios').default
const electron = require('electron')
const express = require('express')
const fs = require('fs')
const fsPromises = fs.promises
const nodePath = require('path')
const os = require('os')

function showPatchError(message) {
  console.error(message)
  electron.dialog.showErrorBox('Patch Error', message + '\n\nPlease report this issue on the GitHub repository (github.com/XielQs/httptoolkit-pro-patcher)')
}

const axiosInstance = axios.create({
  baseURL: 'https://app.httptoolkit.tech',
  timeout: 15000,
  httpsAgent:
    typeof globalProxy === 'string' && globalProxy
      ? new HttpsProxyAgent(
          globalProxy.startsWith('http')
            ? globalProxy.replace(/^http:/, 'https:')
            : 'https://' + globalProxy
        )
      : undefined //? Use proxy if set (globalProxy is injected by the patcher)
})

const hasInternet = async () => {
  try {
    await axiosInstance.head('/')
    return true
  } catch {
    return false
  }
}

const port = process.env.PORT || 5067
const tempPath = nodePath.join(os.tmpdir(), 'httptoolkit-patch')
const APP_URL = `http://localhost:${port}`

process.env.APP_URL = APP_URL
console.log(`[Patcher] Selected temp path: ${tempPath}`)

const app = express()

app.disable('x-powered-by')

app.all('*', async (req, res) => {
  console.log(`[Patcher] Request to: ${req.url}`)

  const { pathname } = new URL(req.url, APP_URL)
  let filePath = nodePath.join(tempPath, pathname === '/' ? 'index.html' : pathname)
  if (['/view', '/intercept', '/settings', '/mock'].includes(pathname)) {
    filePath += '.html'
  }

  //? Prevent loading service worker to avoid caching issues
  if (pathname === '/ui-update-worker.js') return res.status(404).send('Not found')

  if (!fs.existsSync(tempPath)) {
    console.log(`[Patcher] Temp path not found, creating: ${tempPath}`)
    fs.mkdirSync(tempPath, { recursive: true })
  }

  if (!(await hasInternet())) {
    console.log(`[Patcher] No internet connection, trying to serve directly from temp path`)
    if (fs.existsSync(filePath)) {
      console.log(`[Patcher] Serving from temp path: ${filePath}`)
      res.sendFile(filePath)
    } else {
      console.log(`[Patcher] File not found in temp path: ${filePath}`)
      res.status(404).send('No internet connection and file is not cached')
    }
    return
  }

  try {
    if (fs.existsSync(filePath)) { //? Check if file exists in temp path
      try {
        const remoteDate = await axiosInstance.head(req.url).then(res => new Date(res.headers['last-modified']))
        const localDate = (await fsPromises.stat(filePath)).mtime
        if (remoteDate <= localDate) {
          console.log(`[Patcher] File not changed, serving from temp path`)
          res.sendFile(filePath)
          return
        }
      } catch (e) {
        console.error(`[Patcher] [ERR] Failed to fetch remote file date`, e)
      }
    } else console.log(`[Patcher] File not found in temp path, downloading`)

    const remoteFile = await axiosInstance.get(req.url, { responseType: 'arraybuffer' })

    for (const [key, value] of Object.entries(remoteFile.headers)) res.setHeader(key, value)

    fs.mkdirSync(nodePath.dirname(filePath), { recursive: true })
    let data = remoteFile.data
    if (pathname === '/main.js') { //? Patch main.js
      console.log(`[Patcher] Patching main.js`)
      res.setHeader('Cache-Control', 'no-store') //? Prevent caching

      data = data.toString()

      const accStoreName = data.match(/class ([0-9A-Za-z_$]+){constructor\(e\){this\.goToSettings=e/)?.[1]
      const modName = data.match(/([0-9A-Za-z_$]+).(getLatestUserData|getLastUserData)/)?.[1]

      if (!accStoreName) showPatchError(`[Patcher] [ERR] Account store name not found in main.js`)
      else if (!modName) showPatchError(`[Patcher] [ERR] Module name not found in main.js`)
      else {
        let patched = data
          .replace(`class ${accStoreName}{`, `["getLatestUserData","getLastUserData"].forEach(p=>Object.defineProperty(${modName},p,{value:()=>user}));class ${accStoreName}{`)
        if (patched === data) showPatchError(`[Patcher] [ERR] Patch failed`)
        else {
          patched = `const user=${JSON.stringify({
            email, //? Injected by the patcher
            subscription: {
              status: 'active',
              quantity: 1,
              expiry: new Date('9999-12-31').toISOString(),
              sku: 'pro-annual',
              plan: 'pro-annual',
              tierCode: 'pro',
              interval: 'annual',
              canManageSubscription: true,
              updateBillingDetailsUrl: 'https://github.com/IPTVmanreal/httptoolkit-pro-patcher',
            }
          })};user.subscription.expiry=new Date(user.subscription.expiry);` + patched
          data = patched
          console.log(`[Patcher] main.js patched`)
        }
      }
    }
    await fsPromises.writeFile(filePath, data)
    console.log(`[Patcher] File downloaded and saved: ${filePath}`)
    res.sendFile(filePath)
  } catch (e) {
    console.error(`[Patcher] [ERR] Failed to fetch remote file: ${filePath}`, e)
    res.status(500).send('Internal server error')
  }
})

app.listen(port, () => console.log(`[Patcher] Server listening on port ${port}`))

electron.app.on('ready', () => {
  //? Patching CORS headers to allow requests from localhost
  electron.session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    //* Blocking unwanted requests to prevent tracking␊
    const blockedHosts = new Set(['events.httptoolkit.tech'])
    if (blockedHosts.has(new URL(details.url).hostname) || details.url.includes('sentry')) return callback({ cancel: true })
    details.requestHeaders.Origin = 'https://app.httptoolkit.tech'
    callback({ requestHeaders: details.requestHeaders })
  })
  electron.session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    details.responseHeaders['Access-Control-Allow-Origin'] = [`http://localhost:${port}`]
    delete details.responseHeaders['access-control-allow-origin']
    callback({ responseHeaders: details.responseHeaders })
  })
})

//? Disable caching for all requests
electron.app.commandLine.appendSwitch('disable-http-cache')

const PATCHES_DIR = path.join(__dirname, 'patches')

function loadPatches() {
  if (!fs.existsSync(PATCHES_DIR)) {
    logger.warn('Patches directory does not exist. No patches will be applied.')
    return []
  }
  return fs.readdirSync(PATCHES_DIR)
    .filter(f => f.endsWith('.js'))
    .map(f => {
      try {
        return require(path.join(PATCHES_DIR, f))
      } catch (err) {
        logger.error(`Failed to load patch ${f}`, err)
        return null
      }
    })
    .filter(Boolean)
}

function detectVersion(source) {
  // Try to detect version from code (customize as needed)
  const versionMatch = source.match(/version\s*[:=]\s*['"]([\d.]+)['"]/);
  return versionMatch ? versionMatch[1] : 'unknown';
}

function applyPatches(source, context) {
  let patched = source
  for (const patch of loadPatches()) {
    try {
      patched = patch(patched, context)
      context.logger.info(`Applied patch: ${patch.name || 'anonymous'}`)
    } catch (err) {
      context.logger.error(`Patch ${patch.name || 'unknown'} failed`, err)
      // Fallback: continue with previous patched code
    }
  }
  return patched
}

// Example usage: node patch.js path/to/main.js
if (require.main === module) {
  const targetFile = process.argv[2]
  if (!targetFile) {
    console.error('Usage: node patch.js <target-file>')
    process.exit(1)
  }
  let source = fs.readFileSync(targetFile, 'utf8')
  const context = { logger, version: detectVersion(source) }
  const patchedSource = applyPatches(source, context)
  fs.writeFileSync(targetFile, patchedSource, 'utf8')
  logger.info('Patching complete.')
}
