# create-base-vue

从 `yulin96/base_vite_vue3` 创建新项目，可选择自动创建 / 推送到公司 Gitea。

## 使用

```bash
npx create-base-vue
```

## 发布

这个包发布到 npm 后，就可以通过 `npx create-base-vue` 使用。

当前推荐使用 npm OIDC Trusted Publishing 发布，不在 GitHub 仓库里保存 npm token。

### 首次发布

`create-base-vue` 这个包名当前在 npm 上还没有查到已发布版本，可以使用。

npm 的 OIDC 发布需要先在 npm 包设置里绑定 GitHub workflow。新包如果还没有 npm 页面，通常需要先手动发布第一个版本：

```bash
cd C:\Users\ZYuLi\web\create-base-vue
npm login
npm publish --access public
```

本地终端没有 OIDC 环境，所以首次发布不要带 `--provenance`。首次发布成功后，再到 npm 包页面配置 Trusted Publisher。

### OIDC 发布配置

在 npmjs.com 的包设置里添加 Trusted Publisher：

- Provider：GitHub Actions
- GitHub user / org：`yulin96`
- Repository：`create-base-vue`
- Workflow filename：`publish.yml`
- Allowed actions：`npm publish`

GitHub 侧已经添加发布工作流：

```text
.github/workflows/publish.yml
```

这个 workflow 会：

1. 安装依赖。
2. 执行 `pnpm lint`。
3. 执行 `npm pack --dry-run`。
4. 使用 OIDC 发布到 npm。

后续发布新版本：

```bash
pnpm version patch
git push
git push --tags
```

推送 `v*` tag 后，GitHub Actions 会自动发布。也可以在 GitHub Actions 页面手动运行 `Publish`。

## 本地测试

不要用 `pnpm dlx .\create-base-vue` 测本地目录包；`dlx` 会在临时目录里解析依赖，容易找不到相对路径。

推荐直接运行：

```bash
cd C:\Users\ZYuLi\web\create-base-vue
$env:GITEA_TOKEN_HOME="你的Token"
pnpm dev
```

或者从 `web` 目录直接执行入口文件：

```bash
cd C:\Users\ZYuLi\web
$env:GITEA_TOKEN_HOME="你的Token"
node .\create-base-vue\bin\create-base-vue.js
```

如果要模拟全局命令：

```bash
cd C:\Users\ZYuLi\web\create-base-vue
npm link

cd C:\Users\ZYuLi\web
$env:GITEA_TOKEN_HOME="你的Token"
create-base-vue
```

常用环境变量：

```bash
GITEA_TOKEN_HOME=你的Token
GITEA_URL=https://gitea.eventnet.cn
GITEA_OWNER=yulin
```

也可以直接传参数：

```bash
npx create-base-vue -- --name dzdp2606-dp --type pc --width 1920 --height 1080 --yes
```

移动端：

```bash
npx create-base-vue -- --name dz2606 --type mobile --yes
```

## 流程

1. 询问项目名。
2. 检查当前目录下是否已有同名文件夹。
3. 询问是否创建并上传到 Gitea。
4. 如果选择上传，校验 Token 并检查 `https://gitea.eventnet.cn/yulin/<项目名>.git` 是否已存在。
5. 选择项目类型：移动端 H5 / PC 固定比例大屏。
6. PC 项目继续询问设计稿宽高。
7. 从 GitHub 拉取 `yulin96/base_vite_vue3`。
8. 删除模板里的 `renovate.json` 和 `.github/workflows` 工作流。
9. 修改项目名、环境变量和 PC / 移动端配置。PC 项目会注释 `src/main.ts` 里的移动端 rem 初始化。
10. 如果选择上传，创建 Gitea 仓库。
11. 如果选择上传，初始化 Git，设置 remote，提交并推送。

## 参数

- `--name`：项目名，例如 `dzdp2606-dp`
- `--type`：`mobile` 或 `pc`
- `--width`：PC 设计稿宽度
- `--height`：PC 设计稿高度
- `--gitea`：Gitea 地址，默认 `https://gitea.eventnet.cn`
- `--owner`：Gitea 用户或组织，默认 `yulin`
- `--token`：Gitea Token，也可以用 `GITEA_TOKEN_HOME`
- `--public`：创建公开仓库，默认私有
- `--push`：上传到 Gitea；不传时交互询问
- `--local`：只生成本地项目，不校验 Gitea，也不上传
- `--yes`：跳过确认

## 注意

- 不上传时不会校验 Gitea Token，也不会检查仓库名。
- Token 不会写入项目文件。
- 上传时 remote 会设置为干净地址，例如 `https://gitea.eventnet.cn/yulin/dzdp2606-dp.git`。
- 推送使用本机已有 Git 凭据；Token 只用于 Gitea API 检查和创建仓库。
- 本机需要已有 `git` 命令。
