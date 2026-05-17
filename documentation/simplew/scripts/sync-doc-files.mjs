import { existsSync, mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import syncedFiles from '../sync-doc-files.config.mjs'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const documentationRoot = resolve(scriptDirectory, '..')
const watchMode = process.argv.includes('--watch')
const commandSeparator = process.argv.indexOf('--')
const command = commandSeparator === -1 ? [] : process.argv.slice(commandSeparator + 1)

const pairs = Object.entries(syncedFiles).map(([source, destination]) => ({
  source: resolve(documentationRoot, source),
  destination: resolve(documentationRoot, destination),
}))

for (const pair of pairs) {
  copySourceToDestination(pair)
}

if (watchMode) {
  for (const pair of pairs) {
    watchPair(pair)
  }

  if (command.length > 0) {
    const child = spawn(command[0], command.slice(1), {
      cwd: documentationRoot,
      shell: process.platform === 'win32',
      stdio: 'inherit',
    })

    child.on('exit', code => {
      process.exitCode = code ?? 0
      process.exit()
    })
  }
}

function copySourceToDestination(pair) {
  mkdirSync(dirname(pair.destination), { recursive: true })
  writeFileSync(pair.destination, readRequiredText(pair.source, 'source'))
}

function watchPair(pair) {
  let syncing = false
  let sourceSnapshot = readRequiredText(pair.source, 'source')
  let destinationSnapshot = readOptionalText(pair.destination)

  const sync = (from, to, updateSnapshots) => {
    if (syncing) {
      return
    }

    const content = readRequiredText(from, 'source')
    if (content === readOptionalText(to)) {
      updateSnapshots(content)
      return
    }

    syncing = true
    mkdirSync(dirname(to), { recursive: true })
    writeFileSync(to, content)
    updateSnapshots(content)

    setTimeout(() => {
      syncing = false
    }, 50)
  }

  watch(pair.source, { persistent: true }, () => {
    const content = readRequiredText(pair.source, 'source')
    if (content !== sourceSnapshot) {
      sourceSnapshot = content
      sync(pair.source, pair.destination, value => {
        destinationSnapshot = value
      })
    }
  })

  watch(pair.destination, { persistent: true }, () => {
    const content = readRequiredText(pair.destination, 'destination')
    if (content !== destinationSnapshot) {
      destinationSnapshot = content
      sync(pair.destination, pair.source, value => {
        sourceSnapshot = value
      })
    }
  })
}

function readRequiredText(file, role) {
  if (!existsSync(file)) {
    throw new Error(`Synced ${role} file does not exist: ${file}`)
  }

  return readFileSync(file, 'utf8')
}

function readOptionalText(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}
