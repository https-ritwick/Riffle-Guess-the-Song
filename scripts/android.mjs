// Helper for the Android (Trusted Web Activity) app in android/. See ANDROID.md.
//
//   node scripts/android.mjs doctor              check JDK / Android SDK / signing setup
//   node scripts/android.mjs keystore            create the upload key (interactive, once)
//   node scripts/android.mjs fingerprint [debug] print the upload (or debug) key's SHA-256
//   node scripts/android.mjs assetlinks <SHA-256> [<SHA-256> ...]
//                                                write public/.well-known/assetlinks.json
//   node scripts/android.mjs gradle <task...>    run the Gradle wrapper, e.g. bundleRelease
//
// Nothing here prints or stores passwords: keytool asks for them itself, and Gradle
// reads them from android/keystore.properties or RIFFLE_UPLOAD_* environment variables.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const ANDROID = join(ROOT, 'android')
const ASSETLINKS = join(ROOT, 'public', '.well-known', 'assetlinks.json')
const KEYSTORE_PROPS = join(ANDROID, 'keystore.properties')
const DEFAULT_KEYSTORE = 'keystore/riffle-upload.jks' // relative to android/, git-ignored
const isWin = process.platform === 'win32'

function fail(msg) {
  console.error(`\n✖ ${msg}\n`)
  process.exit(1)
}

function run(cmd, args, opts = {}) {
  // Windows can't spawn .bat files directly; go through cmd.exe instead of `shell: true`.
  const [exe, argv] = isWin && cmd.endsWith('.bat') ? ['cmd.exe', ['/d', '/c', cmd, ...args]] : [cmd, args]
  const r = spawnSync(exe, argv, { stdio: 'inherit', ...opts })
  if (r.error) fail(`${cmd}: ${r.error.message}`)
  return r.status ?? 1
}

/** android/app/build.gradle.kts is the single source of truth for the package id. */
function applicationId() {
  const gradle = readFileSync(join(ANDROID, 'app', 'build.gradle.kts'), 'utf8')
  const m = gradle.match(/const val applicationId = "([^"]+)"/)
  if (!m) fail('Could not find applicationId in android/app/build.gradle.kts')
  return m[1]
}

function readProps(file) {
  if (!existsSync(file)) return {}
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  )
}

function sdkDir() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    isWin && process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
    process.platform === 'darwin' && join(homedir(), 'Library', 'Android', 'sdk'),
    join(homedir(), 'Android', 'Sdk'),
  ].filter(Boolean)
  return candidates.find((d) => existsSync(d))
}

/** Gradle finds the SDK through android/local.properties (git-ignored); create it if missing. */
function ensureLocalProperties() {
  const file = join(ANDROID, 'local.properties')
  if (existsSync(file)) return
  const sdk = sdkDir()
  if (!sdk) fail('Android SDK not found. Install Android Studio (or the command-line tools) and set ANDROID_HOME.')
  writeFileSync(file, `sdk.dir=${sdk.replaceAll('\\', '\\\\').replaceAll(':', '\\:')}\n`)
  console.log(`wrote android/local.properties (sdk.dir=${sdk})`)
}

function keytool() {
  const javaHome = process.env.JAVA_HOME
  const bin = javaHome && join(javaHome, 'bin', isWin ? 'keytool.exe' : 'keytool')
  return bin && existsSync(bin) ? bin : 'keytool'
}

function uploadKeystore() {
  const props = readProps(KEYSTORE_PROPS)
  const store = process.env.RIFFLE_UPLOAD_STORE_FILE || props.storeFile
  return {
    path: store ? resolve(ANDROID, store) : null,
    alias: process.env.RIFFLE_UPLOAD_KEY_ALIAS || props.keyAlias || 'upload',
  }
}

const commands = {
  doctor() {
    const java = spawnSync('java', ['-version'], { encoding: 'utf8' })
    const javaLine = (java.stderr || java.stdout || '').split('\n')[0]
    console.log(`JDK:          ${java.status === 0 ? javaLine : 'not found. Install JDK 17 or 21.'}`)
    console.log(`Android SDK:  ${sdkDir() ?? 'not found. Install Android Studio or set ANDROID_HOME.'}`)
    const { path } = uploadKeystore()
    console.log(`Upload key:   ${path ? (existsSync(path) ? path : `${path} (missing!)`) : 'not configured. Run: npm run android:keystore'}`)
    console.log(`Package id:   ${applicationId()}`)
    const links = existsSync(ASSETLINKS) ? readFileSync(ASSETLINKS, 'utf8') : ''
    console.log(`assetlinks:   ${links.includes('REPLACE_WITH') ? 'still has placeholder fingerprints' : links.includes(applicationId()) ? 'ok' : 'package name does not match!'}`)
  },

  keystore() {
    const props = readProps(KEYSTORE_PROPS)
    if (props.storeFile && existsSync(resolve(ANDROID, props.storeFile)))
      fail(`An upload key already exists at android/${props.storeFile}. Never replace it casually: Play only accepts uploads signed with it.`)
    mkdirSync(join(ANDROID, 'keystore'), { recursive: true })
    const store = join(ANDROID, DEFAULT_KEYSTORE)
    console.log('Creating the upload key. keytool will ask for a password and your name/organisation.\n')
    const code = run(keytool(), ['-genkeypair', '-v', '-keystore', store, '-alias', 'upload', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000'])
    if (code !== 0) fail('keytool failed')
    if (!existsSync(KEYSTORE_PROPS)) {
      writeFileSync(
        KEYSTORE_PROPS,
        [
          '# Upload-key signing for release builds. GIT-IGNORED: never commit this file.',
          '# Alternatively leave the passwords out and set RIFFLE_UPLOAD_STORE_PASSWORD /',
          '# RIFFLE_UPLOAD_KEY_PASSWORD in your shell or CI secrets.',
          `storeFile=${DEFAULT_KEYSTORE}`,
          'keyAlias=upload',
          'storePassword=',
          'keyPassword=',
          '',
        ].join('\n'),
      )
    }
    console.log(`\n✔ Upload key: android/${DEFAULT_KEYSTORE}`)
    console.log('  Next: put the password in android/keystore.properties (or RIFFLE_UPLOAD_* env vars),')
    console.log('  and BACK UP the .jks file and password somewhere safe (a password manager).')
  },

  fingerprint(which) {
    let args
    if (which === 'debug') {
      const debug = join(homedir(), '.android', 'debug.keystore')
      if (!existsSync(debug)) fail('No debug keystore yet. Build once with: npm run android:debug')
      args = ['-list', '-v', '-keystore', debug, '-alias', 'androiddebugkey', '-storepass', 'android']
    } else {
      const { path, alias } = uploadKeystore()
      if (!path || !existsSync(path)) fail('No upload key configured. Run: npm run android:keystore')
      args = ['-list', '-v', '-keystore', path, '-alias', alias]
    }
    const r = spawnSync(keytool(), args, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] })
    const sha = r.stdout?.match(/SHA256:\s*([0-9A-F:]{95})/i)?.[1]
    if (!sha) fail('Could not read the SHA-256 fingerprint (wrong password?)')
    console.log(`\n${which === 'debug' ? 'Debug' : 'Upload'} key SHA-256:\n${sha.toUpperCase()}\n`)
  },

  assetlinks(...fingerprints) {
    const re = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/
    const fps = fingerprints.map((f) => f.trim().toUpperCase())
    if (!fps.length) fail('Usage: npm run android:assetlinks -- <SHA-256> [<SHA-256> ...]')
    const bad = fps.filter((f) => !re.test(f))
    if (bad.length) fail(`Not a SHA-256 fingerprint (expected AA:BB:...:FF, 32 bytes): ${bad.join(', ')}`)
    const doc = [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: applicationId(), sha256_cert_fingerprints: [...new Set(fps)] },
      },
    ]
    mkdirSync(join(ROOT, 'public', '.well-known'), { recursive: true })
    writeFileSync(ASSETLINKS, JSON.stringify(doc, null, 2) + '\n')
    console.log(`✔ wrote public/.well-known/assetlinks.json with ${fps.length} fingerprint(s). Deploy with: npm run deploy`)
  },

  gradle(...tasks) {
    if (!tasks.length) fail('Usage: node scripts/android.mjs gradle <task...>')
    ensureLocalProperties()
    const wrapper = join(ANDROID, isWin ? 'gradlew.bat' : 'gradlew')
    const code = run(wrapper, tasks, { cwd: ANDROID })
    if (code !== 0) process.exit(code)
    if (tasks.includes('bundleRelease')) console.log('\n✔ android/app/build/outputs/bundle/release/app-release.aab')
  },
}

const [cmd, ...rest] = process.argv.slice(2)
if (!commands[cmd]) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport')[0])
  process.exit(cmd ? 1 : 0)
}
commands[cmd](...rest)
