#!/usr/bin/env node
import { cancel, confirm, intro, isCancel, note, outro, password, select, spinner, text } from '@clack/prompts'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const TEMPLATE_REPO = 'https://github.com/yulin96/base_vite_vue3.git'
const DEFAULT_GITEA_URL = 'https://gitea.eventnet.cn'
const DEFAULT_GITEA_OWNER = 'yulin'

const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    type: { type: 'string' },
    width: { type: 'string' },
    height: { type: 'string' },
    gitea: { type: 'string' },
    owner: { type: 'string' },
    token: { type: 'string' },
    public: { type: 'boolean', default: false },
    push: { type: 'boolean' },
    local: { type: 'boolean', default: false },
    yes: { type: 'boolean', default: false },
  },
})

intro('创建 base-vue 项目')

const projectName = values.name ? validateProjectName(values.name) : await askProjectName()
const giteaBaseUrl = normalizeBaseUrl(values.gitea || process.env.GITEA_URL || DEFAULT_GITEA_URL)
const giteaOwner = values.owner || process.env.GITEA_OWNER || DEFAULT_GITEA_OWNER
const isPrivate = !values.public
const targetDir = resolve(process.cwd(), projectName)
const remoteUrl = `${giteaBaseUrl}/${giteaOwner}/${projectName}.git`

if (existsSync(targetDir)) {
  cancel(`目录已存在：${targetDir}`)
  process.exit(1)
}

const shouldPush =
  values.local ? false
  : typeof values.push === 'boolean' ? values.push
  : await askShouldPush()
const giteaToken =
  shouldPush ? normalizeToken(values.token || process.env.GITEA_TOKEN_HOME || (await askGiteaToken())) : ''
const giteaUser = shouldPush ? await validateGiteaToken({ baseUrl: giteaBaseUrl, token: giteaToken }) : null
if (shouldPush) {
  await ensureGiteaRepoNotExists({ baseUrl: giteaBaseUrl, owner: giteaOwner, repo: projectName, token: giteaToken })
}

const projectType = values.type ? validateProjectType(values.type) : await askProjectType()
const pageSize = projectType === 'pc' ? await resolvePcSize() : null

const summary = [
  `项目名：${projectName}`,
  `项目类型：${projectType === 'pc' ? 'PC 固定比例大屏' : '移动端 H5'}`,
  pageSize ? `设计稿：${pageSize.width} x ${pageSize.height}` : '',
  shouldPush ? `Gitea：${remoteUrl}` : 'Gitea：不上传，只生成本地项目',
].filter(Boolean)

note(summary.join('\n'), '即将创建')

if (!values.yes) {
  const shouldContinue = await confirm({
    message: '确认继续？',
    initialValue: true,
  })

  if (isCancel(shouldContinue) || !shouldContinue) {
    cancel('已取消')
    process.exit(0)
  }
}

cloneTemplate(targetDir)
customizeProject({ targetDir, projectName, projectType, pageSize })
if (shouldPush) {
  await createGiteaRepo({
    baseUrl: giteaBaseUrl,
    owner: giteaOwner,
    repo: projectName,
    token: giteaToken,
    isPrivate,
    user: giteaUser,
  })
  initGitAndPush({ targetDir, remoteUrl })
}

outro(shouldPush ? `项目已创建并推送：${remoteUrl}` : `项目已创建：${targetDir}`)

async function askProjectName() {
  const defaultName = `demo-${getYearMonthSuffix()}`
  const value = await text({
    message: '请输入项目名',
    placeholder: defaultName,
    initialValue: defaultName,
    validate(input) {
      try {
        validateProjectName(input)
      } catch (error) {
        return error.message
      }
    },
  })

  if (isCancel(value)) exitCancelled()
  return value
}

function getYearMonthSuffix(date = new Date()) {
  const year = String(date.getFullYear()).slice(-2)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}${month}`
}

async function askProjectType() {
  const value = await select({
    message: '请选择项目类型',
    options: [
      { value: 'mobile', label: '移动端 H5' },
      { value: 'pc', label: 'PC 固定比例大屏' },
    ],
  })

  if (isCancel(value)) exitCancelled()
  return value
}

async function askShouldPush() {
  const value = await confirm({
    message: '是否创建并上传到 Gitea？',
    initialValue: true,
  })

  if (isCancel(value)) exitCancelled()
  return value
}

async function resolvePcSize() {
  const width =
    values.width ? parsePositiveInteger(values.width, 'width') : await askPositiveInteger('请输入设计稿宽度', '1920')
  const height =
    values.height ? parsePositiveInteger(values.height, 'height') : await askPositiveInteger('请输入设计稿高度', '1080')
  return { width, height }
}

async function askPositiveInteger(message, initialValue) {
  const value = await text({
    message,
    initialValue,
    validate(input) {
      const numberValue = Number(input)
      if (!Number.isInteger(numberValue) || numberValue <= 0) return '请输入大于 0 的整数'
    },
  })

  if (isCancel(value)) exitCancelled()
  return Number(value)
}

async function askGiteaToken() {
  const value = await password({
    message: '请输入 Gitea Token',
    validate(input) {
      if (!input.trim()) return 'Gitea Token 不能为空'
    },
  })

  if (isCancel(value)) exitCancelled()
  return value
}

function validateProjectName(value) {
  const name = String(value || '').trim()
  if (!name) throw new Error('项目名不能为空')
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) throw new Error('项目名只能包含字母、数字、点、下划线和中划线')
  if (name === '.' || name === '..') throw new Error('项目名不合法')
  return name
}

function validateProjectType(value) {
  if (value !== 'mobile' && value !== 'pc') {
    throw new Error('项目类型只能是 mobile 或 pc')
  }

  return value
}

function parsePositiveInteger(value, name) {
  const numberValue = Number(value)
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error(`${name} 必须是大于 0 的整数`)
  }

  return numberValue
}

function normalizeToken(value) {
  const token = String(value || '').trim()
  if (!token) throw new Error('Gitea Token 不能为空，请设置 GITEA_TOKEN_HOME 或传入 --token')
  return token
}

async function validateGiteaToken({ baseUrl, token }) {
  const s = spinner()
  s.start('校验 Gitea Token')

  const response = await fetch(`${baseUrl}/api/v1/user`, {
    headers: createGiteaHeaders(token),
  })

  if (!response.ok) {
    const message = await response.text()
    s.stop('Gitea Token 校验失败')
    throw new Error(
      [
        `Gitea Token 不可用：${response.status} ${message}`,
        '请确认 GITEA_TOKEN_HOME 是 Gitea 里生成的 Access Token，且当前 Gitea 实例允许 API token 访问。',
      ].join('\n'),
    )
  }

  const user = await response.json()
  s.stop(`Gitea Token 可用：${user?.login || user?.username || '已登录'}`)
  return user
}

async function ensureGiteaRepoNotExists({ baseUrl, owner, repo, token }) {
  const s = spinner()
  s.start('检查 Gitea 仓库名称')

  const response = await fetch(`${baseUrl}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
    headers: createGiteaHeaders(token),
  })

  if (response.status === 404) {
    s.stop('Gitea 仓库名可用')
    return
  }

  if (response.ok) {
    s.stop('Gitea 仓库已存在')
    cancel(`仓库已存在：${baseUrl}/${owner}/${repo}`)
    process.exit(1)
  }

  const message = await response.text()
  s.stop('Gitea 仓库检查失败')
  throw new Error(`Gitea 检查失败：${response.status} ${message}`)
}

function cloneTemplate(targetDir) {
  const s = spinner()
  s.start('拉取 GitHub 模板')

  run('git', ['clone', '--depth', '1', TEMPLATE_REPO, targetDir])
  rmSync(resolve(targetDir, '.git'), { recursive: true, force: true })

  s.stop('模板拉取完成')
}

function customizeProject({ targetDir, projectName, projectType, pageSize }) {
  const s = spinner()
  s.start('修改项目配置')

  cleanupTemplateFiles(targetDir)
  updatePackageName(targetDir, projectName)
  updateEnv(targetDir, projectName)

  if (projectType === 'pc') {
    applyPcMode(targetDir, pageSize)
  }

  s.stop('项目配置修改完成')
}

function cleanupTemplateFiles(targetDir) {
  rmSync(resolve(targetDir, 'renovate.json'), { force: true })
  rmSync(resolve(targetDir, '.github', 'workflows'), { recursive: true, force: true })
}

function updatePackageName(targetDir, projectName) {
  const filePath = resolve(targetDir, 'package.json')
  if (!existsSync(filePath)) return

  const pkg = JSON.parse(readFileSync(filePath, 'utf8'))
  pkg.name = projectName
  writeFileSync(filePath, `${JSON.stringify(pkg, null, 2)}\n`)
}

function updateEnv(targetDir, projectName) {
  const filePath = resolve(targetDir, '.env')
  if (!existsSync(filePath)) return

  const source = readFileSync(filePath, 'utf8')
  const result = source
    .replace(/^VITE_APP_TITLE=.*$/m, `VITE_APP_TITLE=${projectName}`)
    .replace(/^VITE_APP_LOCALSTORAGE_NAME=.*$/m, `VITE_APP_LOCALSTORAGE_NAME=${projectName}`)

  writeFileSync(filePath, result)
}

function applyPcMode(targetDir, pageSize) {
  commentPxtorem(targetDir)
  updateMainCss(targetDir)
  updateTailwindCss(targetDir)
  updateThemeCss(targetDir, pageSize.width, pageSize.height)
  replaceAgents(targetDir)
}

function commentPxtorem(targetDir) {
  const filePath = resolve(targetDir, 'vite.config.ts')
  if (!existsSync(filePath)) return

  const source = readFileSync(filePath, 'utf8')
  writeFileIfChanged(filePath, source, commentCall(source, 'pxtorem'))
}

function updateMainCss(targetDir) {
  const filePath = resolve(targetDir, 'src/assets/styles/main.css')
  if (!existsSync(filePath)) return

  const source = readFileSync(filePath, 'utf8')
  writeFileIfChanged(filePath, source, commentCssImport(source, './rem.m.css'))
}

function updateTailwindCss(targetDir) {
  const filePath = resolve(targetDir, 'src/assets/styles/tailwind.css')
  if (!existsSync(filePath)) return

  const source = readFileSync(filePath, 'utf8')
  let result = commentCssImport(source, './size.css')
  result = result.replaceAll('calc(--value(integer) * 1px)', 'calc(--value(integer) * 0.25rem)')
  writeFileIfChanged(filePath, source, result)
}

function updateThemeCss(targetDir, width, height) {
  const filePath = resolve(targetDir, 'src/assets/styles/theme.css')
  if (!existsSync(filePath)) return

  const source = readFileSync(filePath, 'utf8')
  let result = source.replace(/^(\s*)--spacing:\s*1px;$/m, '$1/* --spacing: 1px; */')
  const htmlBlock = [
    'html {',
    `  --page-width: ${width};`,
    `  --page-height: ${height};`,
    '',
    '  --page-width-size: calc(100vw / var(--page-width) * 4);',
    '  --page-height-size: calc(100vh / var(--page-height) * 4);',
    '',
    '  font-size: min(var(--page-width-size), var(--page-height-size));',
    '}',
  ].join('\n')
  const commentedHtmlPattern =
    /\/\*\s*html\s*\{[\s\S]*?font-size:\s*min\(var\(--page-width-size\),\s*var\(--page-height-size\)\);\s*\}\s*\*\//
  const activeHtmlPattern =
    /html\s*\{[\s\S]*?font-size:\s*min\(var\(--page-width-size\),\s*var\(--page-height-size\)\);\s*\}/

  if (commentedHtmlPattern.test(result)) {
    result = result.replace(commentedHtmlPattern, htmlBlock)
  } else if (activeHtmlPattern.test(result)) {
    result = result.replace(activeHtmlPattern, htmlBlock)
  } else {
    result = `${htmlBlock}\n\n${result}`
  }

  writeFileIfChanged(filePath, source, result)
}

function replaceAgents(targetDir) {
  const agentsPath = resolve(targetDir, 'AGENTS.md')
  const pcAgentsPath = resolve(targetDir, 'AGENTS-PC.md')

  if (!existsSync(pcAgentsPath)) return

  rmSync(agentsPath, { force: true })
  writeFileSync(agentsPath, readFileSync(pcAgentsPath))
  rmSync(pcAgentsPath, { force: true })
}

async function createGiteaRepo({ baseUrl, owner, repo, token, isPrivate, user }) {
  const s = spinner()
  s.start('创建 Gitea 仓库')

  const isCurrentUserRepo = user?.login === owner || user?.username === owner
  const createUrl =
    isCurrentUserRepo ? `${baseUrl}/api/v1/user/repos` : `${baseUrl}/api/v1/orgs/${encodeURIComponent(owner)}/repos`

  const response = await fetch(createUrl, {
    method: 'POST',
    headers: createGiteaHeaders(token),
    body: JSON.stringify({
      name: repo,
      private: isPrivate,
      auto_init: false,
    }),
  })

  if (!response.ok) {
    const message = await response.text()
    s.stop('Gitea 仓库创建失败')
    throw new Error(`Gitea 创建失败：${response.status} ${message}`)
  }

  s.stop('Gitea 仓库创建完成')
}

function initGitAndPush({ targetDir, remoteUrl }) {
  const s = spinner()
  s.start('初始化 Git 并推送')

  run('git', ['init'], { cwd: targetDir })
  run('git', ['branch', '-M', 'main'], { cwd: targetDir })
  run('git', ['add', '.'], { cwd: targetDir })
  run('git', ['commit', '-m', 'init'], { cwd: targetDir })
  run('git', ['remote', 'add', 'origin', remoteUrl], { cwd: targetDir })
  run('git', ['push', '-u', 'origin', 'main'], { cwd: targetDir })

  s.stop('Git 推送完成')
}

function createGiteaHeaders(token) {
  return {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Authorization': `token ${token}`,
  }
}

function commentCssImport(source, importPath) {
  const escapedPath = escapeRegExp(importPath)
  const pattern = new RegExp(`^(@import ['"]${escapedPath}['"];)$`, 'm')
  return source.replace(pattern, '/* $1 */')
}

function commentCall(source, callee) {
  const callStart = source.indexOf(`${callee}(`)
  if (callStart === -1) return source

  const nearbyPrefix = source.slice(Math.max(0, callStart - 4), callStart)
  if (nearbyPrefix.includes('/*')) return source

  const openBrace = source.indexOf('{', callStart)
  if (openBrace === -1) return source

  let index = openBrace + 1
  let depth = 1
  let quote = ''

  while (index < source.length) {
    const char = source[index]
    const prev = source[index - 1]

    if (quote) {
      if (char === quote && prev !== '\\') quote = ''
      index += 1
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char
      index += 1
      continue
    }

    if (char === '{') depth += 1
    if (char === '}') depth -= 1

    if (depth === 0) break
    index += 1
  }

  if (depth !== 0) return source

  let end = index + 1
  while (/\s/.test(source[end] || '')) end += 1
  if (source[end] === ')') end += 1
  if (source[end] === ',') end += 1

  const original = source.slice(callStart, end)
  return `${source.slice(0, callStart)}/* ${original} */${source.slice(end)}`
}

function writeFileIfChanged(filePath, before, after) {
  if (before === after) return
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, after)
}

function normalizeBaseUrl(value) {
  return String(value).replace(/\/+$/, '')
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    stdio: 'pipe',
    shell: false,
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n')
    throw new Error(`${command} ${args.join(' ')} 执行失败\n${output}`)
  }

  return result.stdout
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function exitCancelled() {
  cancel('已取消')
  process.exit(0)
}
