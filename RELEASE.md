# 发布流程 (Release Process)

> 目的:让"打包 / 上架"可复现,不再靠手工打 .vsix。
> 注意:以往 .vsix、node_modules、out/ 都被 .gitignore 排除,**不进 GitHub**——换电脑后仓库里是重建不出来的,必须走下面的自动化步骤生成。

## 一次发布的标准步骤

1. 代码已在 `master` 上并已推送:`git push origin master`
2. 升版本号:改 `package.json` 的 `version`,同步更新 `changelog.md`(双语 release notes 照旧例)。
3. 提交:`git commit -m "chore: bump to x.y.z"`,然后 `git push origin master`
4. 打标签:**这步以前经常漏**(现在最新 tag 只到 v1.2.0,1.2.1/1.1.1 都没打)— 一定带 `v` 前缀:
   ```
   git tag -a v1.3.0 -m "v1.3.0"
   git push origin master --tags
   ```
5. GitHub Actions(`.github/workflows/release.yml`)收到 v* 标签后自动:编译 → 打包 .vsix → 创建 GitHub Release 并挂上 .vsix。
6. 检查结果:https://github.com/Miku3w3/ClaudeCodeUsage/releases

## 本地打包验证(不打标签时用)

```bash
npm install
npm run compile   # tsc 编译 + 拷贝 i18n
npm run package   # 生成 claude-code-token-monitor-x.y.z.vsix
```

## 上架到 Visual Studio Marketplace(可选)

- 手动发布:`npm run publish`(会要求输入 Marketplace PAT)
- 自动发布(推荐):在 GitHub 仓库 **Settings → Secrets and variables → Actions** 添加 secret **`MARKETPLACE_PUBLISHER_TOKEN`**(值是 azure 发布 PAT,只勾 Marketplace 范围)。
  存在该 secret 后,打标签的 workflow 会自动 `vsce publish`(见 release.yml 最后一步);发布成功后商城里会出现新版本。

## 常用命令速查

| 命令 | 作用 |
|---|---|
| `npm run compile` | TypeScript 编译 + 拷贝 i18n 语言文件 |
| `npm run package` | 打包成 .vsix(内部会自动先编译) |
| `npm run publish` | 直接发布到 Marketplace(需 PAT) |