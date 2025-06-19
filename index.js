// @ts-check
import { spawn } from 'child_process'
import asar from '@electron/asar'
import prompts from 'prompts'
import yargs from 'yargs'
import chalk from 'chalk'
import path from 'path'
import fs from 'fs'
import os from 'os'
import ora from 'ora'
import boxen from 'boxen'
import { createHash } from 'crypto'


// Configuration management
const CONFIG_FILE = path.join(os.homedir(), '.httptoolkit-patcher.json')
const DEFAULT_CONFIG = {
  logLevel: 'info',
  cacheTimeout: 24 * 60 * 60 * 1000, // 24 hours
  maxRetries: 3,
  retryDelay: 1000,
  proxyEnabled: false,
  proxy: '',
  lastEmail: '',
  backupPath: path.join(os.homedir(), '.httptoolkit-patcher-backups'),
  autoUpdate: true
}

class ConfigManager {
  constructor() {
    this.config = this.loadConfig()
  }

  loadConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
        return { ...DEFAULT_CONFIG, ...config }
      }
    } catch (error) {
      console.warn(chalk.yellow('Failed to load config, using defaults'), error)
    }
    return DEFAULT_CONFIG
  }

  saveConfig() {
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2))
    } catch (error) {
      console.error(chalk.red('Failed to save config'), error)
    }
  }

  get(key) {
    return this.config[key]
  }

  set(key, value) {
    this.config[key] = value
    this.saveConfig()
  }
}

const config = new ConfigManager()

// Backup management
class BackupManager {
  constructor() {
    this.backupDir = config.get('backupPath')
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true })
    }
  }

  createBackup(filePath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const hash = createHash('md5').update(fs.readFileSync(filePath)).digest('hex')
    const backupPath = path.join(this.backupDir, `backup-${timestamp}-${hash}.asar`)
    fs.copyFileSync(filePath, backupPath)
    return backupPath
  }

  listBackups() {
    return fs.readdirSync(this.backupDir)
      .filter(file => file.endsWith('.asar'))
      .map(file => ({
        file,
        path: path.join(this.backupDir, file),
        timestamp: (() => {
          const match = file.match(/^backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/)
          if (match) {
            const iso = match[1].replace('T', 'T').replace(/-(\d{2})-(\d{2})$/, ':$1:$2Z').replace(/-/g, (m, offset) => offset === 4 || offset === 7 ? '-' : ':')
            const d = new Date(iso)
            return isNaN(d.getTime()) ? new Date(0) : d
          }
          return new Date(0)
        })()
      }))
      .sort((a, b) => (a.timestamp && b.timestamp ? b.timestamp.getTime() - a.timestamp.getTime() : 0))
  }

  restoreBackup(backupPath, targetPath) {
    fs.copyFileSync(backupPath, targetPath)
  }
}

const argv = await yargs(process.argv.slice(2))
  .usage(`Usage: ${path.basename(process.argv0, '.exe')} . <command> [options]`)
  .command('patch', 'Patch HTTP Toolkit')
  .option('proxy', {
    alias: 'p',
    describe: 'Specify a global proxy (only http/https supported)',
    type: 'string'
  })
  .option('path', {
    alias: 'P',
    describe: 'Specify the path to the HTTP Toolkit folder (auto-detected by default)',
    type: 'string'
  })
  .command('restore', 'Restore HTTP Toolkit')
  .command('start', 'Start HTTP Toolkit with debug logs enabled')
  .command('config', 'Configure patcher settings')
  .command('backups', 'Manage backups')
  .demandCommand(1, 'You need at least one command before moving on')
  .alias('h', 'help')
  .describe('help', 'Show this help message')
  .parse()

const globalProxy = argv.proxy || config.get('proxy')

const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'

const getAppPath = () => {
  if (argv.path) return argv.path.endsWith(isMac ? '/Resources' : '/resources') ? argv.path : path.join(argv.path, isMac ? '/Resources' : '/resources')
  if (isWin) return path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'httptoolkit', 'resources')
  if (isMac) return '/Applications/HTTP Toolkit.app/Contents/Resources'
  if (fs.existsSync('/opt/HTTP Toolkit/resources')) return '/opt/HTTP Toolkit/resources'
  return '/opt/httptoolkit/resources'
}

const appPath = getAppPath()
const backupManager = new BackupManager()

const isSudo = !isWin && (process.getuid || (() => process.env.SUDO_UID ? 0 : null))() === 0

if (+(process.versions.node.split('.')[0]) < 15) {
  console.error(chalk.redBright`[!] Node.js version 15 or higher is recommended, you are currently using version {bold ${process.versions.node}}`)
}

// Improved path validation
const validatePath = () => {
  const spinner = ora('Validating HTTP Toolkit installation').start()
  
  if (!fs.existsSync(path.join(appPath, 'app.asar'))) {
    spinner.fail(chalk.redBright`HTTP Toolkit not found${!argv.path ? ', try specifying the path with --path' : ''}`)
    process.exit(1)
  }
  
  spinner.succeed(chalk.blueBright`HTTP Toolkit found at {bold ${path.dirname(appPath)}}`)
}

validatePath()

const rm = (/** @type {string} */ dirPath) => {
  const spinner = ora(`Removing ${dirPath}`).start()
  try {
    if (!fs.existsSync(dirPath)) return
    if (!fs.lstatSync(dirPath).isDirectory()) return fs.rmSync(dirPath, { force: true })
    for (const entry of fs.readdirSync(dirPath)) {
      const entryPath = path.join(dirPath, entry)
      if (fs.lstatSync(entryPath).isDirectory()) rm(entryPath)
      else fs.rmSync(entryPath, { force: true })
    }
    spinner.succeed(`Removed ${dirPath}`)
  } catch (error) {
    spinner.fail(`Failed to remove ${dirPath}`)
    throw error
  }
}

const canWrite = (/** @type {string} */ dirPath) => {
  try {
    fs.accessSync(dirPath, fs.constants.W_OK)
    return true
  } catch {
    return false
  }
}

/** @type {Array<import('child_process').ChildProcess>} */
const activeProcesses = []
let isCancelled = false

const cleanUp = async () => {
  isCancelled = true
  console.log(chalk.redBright`[-] Operation cancelled, cleaning up...`)
  if (activeProcesses.length) {
    const spinner = ora('Killing active processes').start()
    for (const proc of activeProcesses) {
      proc.kill('SIGINT')
      spinner.text = `Killed process ${proc.pid}`
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
    spinner.succeed('All processes killed')
  }
  
  const paths = [
    path.join(os.tmpdir(), 'httptoolkit-patch'),
    path.join(os.tmpdir(), 'httptoolkit-patcher-temp')
  ]
  
  for (const p of paths) {
    if (fs.existsSync(p)) {
      const spinner = ora(`Removing ${p}`).start()
      try {
        rm(p)
        spinner.succeed(`Removed ${p}`)
      } catch (error) {
        spinner.fail(`Failed to remove ${p}`)
        console.error(error)
      }
    }
  }
  process.exit(1)
}

const patchApp = async () => {
  const filePath = path.join(appPath, 'app.asar')
  const tempPath = path.join(os.tmpdir(), 'httptoolkit-patcher-temp')

  if (fs.readFileSync(filePath).includes('Injected by HTTP Toolkit Patcher')) {
    console.log(chalk.yellowBright`[!] HTTP Toolkit already patched`)
    return
  }

  console.log(boxen(chalk.blueBright`HTTP Toolkit Patcher`, { 
    padding: 1,
    margin: 1,
    borderStyle: 'double',
    borderColor: 'blue'
  }))

  const spinner = ora('Starting patch process').start()

  if (!canWrite(filePath)) {
    spinner.fail(chalk.redBright`Insufficient permissions to write to {bold ${filePath}}, try running ${!isWin ? 'with sudo' : 'node as administrator'}`)
    process.exit(1)
  }

  if (globalProxy) {
    if (!globalProxy.match(/^https?:/)) {
      spinner.fail(chalk.redBright`Global proxy must start with http:// or https://`)
      process.exit(1)
    }
    spinner.info(chalk.yellowBright`Adding custom global proxy: {bold ${globalProxy}}`)
  }

  spinner.text = 'Extracting app'
  ;['SIGINT', 'SIGTERM'].forEach(signal => process.on(signal, cleanUp))

  try {
    rm(tempPath)
    await asar.extractAll(filePath, tempPath)
    spinner.succeed('App extracted successfully')
  } catch (e) {
    if (!isSudo && e.errno === -13) {
      spinner.fail(chalk.redBright`Permission denied, try running ${!isWin ? 'with sudo' : 'node as administrator'}`)
      process.exit(1)
    }
    spinner.fail('Failed to extract app')
    console.error(e)
    process.exit(1)
  }

  const indexPath = path.join(tempPath, 'build', 'index.js')
  if (!fs.existsSync(indexPath)) {
    spinner.fail('Index file not found')
    await cleanUp()
  }
  
  const data = fs.readFileSync(indexPath, 'utf-8')
  ;['SIGINT', 'SIGTERM'].forEach(signal => process.off(signal, cleanUp))
  
  // Use last email from config as default
  const { email } = await prompts({
    type: 'text',
    name: 'email',
    message: 'Enter an email for the pro plan',
    initial: config.get('lastEmail'),
    validate: value => value.includes('@') || 'Invalid email'
  })
  
  if (!email || typeof email !== 'string') {
    spinner.fail('Email not provided')
    await cleanUp()
  }
  
  // Save email to config
  config.set('lastEmail', email)
  
  ;['SIGINT', 'SIGTERM'].forEach(signal => process.on(signal, cleanUp))
  
  spinner.text = 'Reading patch file'
  const patch = fs.readFileSync('patch.js', 'utf-8')
  
  spinner.text = 'Applying patch'
  const patchedData = data
    .replace('const APP_URL =', `// ------- Injected by HTTP Toolkit Patcher -------\nconst email = \`${email.replace(/`/g, '\\`')}\`\nconst globalProxy = process.env.PROXY ?? \`${globalProxy ? globalProxy.replace(/`/g, '\\`') : ''}\`\n${patch}\n// ------- End patched content -------\nconst APP_URL =`)

  if (data === patchedData || !patchedData) {
    spinner.fail('Patch failed')
    await cleanUp()
  }

  fs.writeFileSync(indexPath, patchedData, 'utf-8')
  spinner.succeed('Patched index.js')
  
  spinner.text = 'Installing dependencies'
  try {
    const proc = spawn('npm install express axios', { cwd: tempPath, stdio: 'inherit', shell: true })
    activeProcesses.push(proc)
    await new Promise(resolve => proc.on('close', resolve))
    activeProcesses.splice(activeProcesses.indexOf(proc), 1)
    if (isCancelled) return
    spinner.succeed('Dependencies installed')
  } catch (e) {
    spinner.fail('Failed to install dependencies')
    console.error(e)
    await cleanUp()
  }
  
  const filePathLock = path.join(tempPath, 'package-lock.json')
  if (fs.existsSync(filePathLock)) {
    fs.unlinkSync(filePathLock)
  }
  
  // Create backup using backup manager
  spinner.text = 'Creating backup'
  const backupPath = backupManager.createBackup(filePath)
  spinner.succeed(`Backup created at ${backupPath}`)
  
  spinner.text = 'Building app'
  await asar.createPackage(tempPath, filePath)
  rm(tempPath)
  spinner.succeed('HTTP Toolkit patched successfully')
}

const handleConfig = async () => {
  const { action } = await prompts({
    type: 'select',
    name: 'action',
    message: 'What would you like to do?',
    choices: [
      { title: 'View current config', value: 'view' },
      { title: 'Edit config', value: 'edit' },
      { title: 'Reset to defaults', value: 'reset' }
    ]
  })

  if (action === 'view') {
    console.log(boxen(JSON.stringify(config.config, null, 2), { 
      padding: 1,
      title: 'Current Configuration',
      borderStyle: 'round'
    }))
  } else if (action === 'edit') {
    const { key } = await prompts({
      type: 'select',
      name: 'key',
      message: 'Which setting would you like to edit?',
      choices: Object.keys(config.config).map(key => ({ title: key, value: key }))
    })

    const { value } = await prompts({
      type: typeof config.config[key] === 'boolean' ? 'confirm' : 'text',
      name: 'value',
      message: `Enter new value for ${key}:`,
      initial: config.config[key]
    })

    config.set(key, value)
    console.log(chalk.green(`Updated ${key} to ${value}`))
  } else if (action === 'reset') {
    const { confirm } = await prompts({
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure you want to reset all settings to defaults?'
    })

    if (confirm) {
      config.config = { ...DEFAULT_CONFIG }
      config.saveConfig()
      console.log(chalk.green('Configuration reset to defaults'))
    }
  }
}

const handleBackups = async () => {
  const backups = backupManager.listBackups()
  
  const { action } = await prompts({
    type: 'select',
    name: 'action',
    message: 'What would you like to do?',
    choices: [
      { title: 'List backups', value: 'list' },
      { title: 'Restore backup', value: 'restore' },
      { title: 'Delete backup', value: 'delete' }
    ]
  })

  if (action === 'list') {
    if (backups.length === 0) {
      console.log(chalk.yellow('No backups found'))
      return
    }

    console.log(boxen(
      backups.map(b => `${b.timestamp.toLocaleString()} - ${b.file}`).join('\n'),
      { padding: 1, title: 'Available Backups', borderStyle: 'round' }
    ))
  } else if (action === 'restore') {
    if (backups.length === 0) {
      console.log(chalk.yellow('No backups found'))
      return
    }

    const { backup } = await prompts({
      type: 'select',
      name: 'backup',
      message: 'Select backup to restore:',
      choices: backups.map(b => ({ 
        title: `${b.timestamp.toLocaleString()} - ${b.file}`,
        value: b
      }))
    })

    const spinner = ora('Restoring backup').start()
    try {
      backupManager.restoreBackup(backup.path, path.join(appPath, 'app.asar'))
      spinner.succeed('Backup restored successfully')
    } catch (error) {
      spinner.fail('Failed to restore backup')
      console.error(error)
    }
  } else if (action === 'delete') {
    if (backups.length === 0) {
      console.log(chalk.yellow('No backups found'))
      return
    }

    const { backup } = await prompts({
      type: 'select',
      name: 'backup',
      message: 'Select backup to delete:',
      choices: backups.map(b => ({ 
        title: `${b.timestamp.toLocaleString()} - ${b.file}`,
        value: b
      }))
    })

    const spinner = ora('Deleting backup').start()
    try {
      fs.unlinkSync(backup.path)
      spinner.succeed('Backup deleted successfully')
    } catch (error) {
      spinner.fail('Failed to delete backup')
      console.error(error)
    }
  }
}

switch (argv._[0]) {
  case 'patch':
    await patchApp()
    break
  case 'restore':
    const spinner = ora('Restoring HTTP Toolkit').start()
    try {
      if (!fs.existsSync(path.join(appPath, 'app.asar.bak'))) {
        spinner.fail('HTTP Toolkit not patched or backup file not found')
      } else {
        fs.copyFileSync(path.join(appPath, 'app.asar.bak'), path.join(appPath, 'app.asar'))
        spinner.succeed('HTTP Toolkit restored')
      }
      rm(path.join(os.tmpdir(), 'httptoolkit-patch'))
    } catch (e) {
      if (!isSudo && e.errno === -13) {
        spinner.fail(chalk.redBright`Permission denied, try running ${!isWin ? 'with sudo' : 'node as administrator'}`)
        process.exit(1)
      }
      spinner.fail('Failed to restore')
      console.error(e)
      process.exit(1)
    }
    break
  case 'start':
    const startSpinner = ora('Starting HTTP Toolkit').start()
    try {
      const command =
        isWin ? `"${path.resolve(appPath, '..', 'HTTP Toolkit.exe')}"`
        : isMac ? 'open -a "HTTP Toolkit"'
        : 'httptoolkit'
      const proc = spawn(command, { stdio: 'inherit', shell: true })
      proc.on('close', code => {
        if (code === 0) {
          startSpinner.succeed('HTTP Toolkit started successfully')
        } else {
          startSpinner.fail(`HTTP Toolkit exited with code ${code}`)
        }
        process.exit(code)
      })
    } catch (e) {
      startSpinner.fail('Failed to start HTTP Toolkit')
      console.error(e)
      if (isSudo) console.error(chalk.redBright`[-] Try running without sudo`)
      process.exit(1)
    }
    break
  case 'config':
    await handleConfig()
    break
  case 'backups':
    await handleBackups()
    break
  default:
    console.error(chalk.redBright`[-] Unknown command`)
    process.exit(1)
}

if (!isCancelled) {
  console.log(boxen(chalk.greenBright`Operation completed successfully`, {
    padding: 1,
    margin: 1,
    borderStyle: 'round',
    borderColor: 'green'
  }))
}
