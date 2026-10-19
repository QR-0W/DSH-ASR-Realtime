# Maintenance policy / 维护政策

[English](#english) · [简体中文](#中文)

## English

### Project identity

- Repository: [QR-0W/DSH-ASR-Realtime](https://github.com/QR-0W/DSH-ASR-Realtime)
- Package: `dsh-asr-realtime`
- Rename-line version: `0.5.0`
- Distribution: versioned `.tgz` assets attached to GitHub Releases; no npm installation, publication, or automatic npm update channel.

The project continues work based on [gone1724/dsh-listener](https://github.com/gone1724/dsh-listener), under MIT. As of 2026-10-19, its latest public update was 2026-10-02. This is a dated observation of the public repository only; it does not establish the author's future maintenance plans.

### Compatibility claims

The declared DSH compatibility scope is limited to `0.2.1-rc.1` and `0.2.1-rc.2`. The current maintenance round focuses on `0.2.1-rc.2`. Other DSH versions are not verified and must not be listed as supported.

A DSH version may be added to the compatibility table only after the release candidate has passed that version's automated checks and the required Host/Client acceptance. A matching archive or successful build is not evidence of real microphone, GUI, or cloud-service acceptance. Record those results separately. Node.js must satisfy the package's `engines` field.

### Release gates

Before attaching a release archive, maintainers must verify the following against the source and the candidate `.tgz`:

1. Stopping capture, clicking outside the microphone controls and caption, losing window focus, or hiding the document stops capture and preserves recognized text. Interruption does not trigger automatic submission.
2. Normal stop requests the cloud final result. On timeout or disconnect, the latest partial may be retained and must be identified as not yet final. A final and partial result must not be appended twice.
3. A session switch or component disposal keeps recovery text associated with the original session. Only an explicit discard removes it. Private transcript text is not automatically persisted to `localStorage`.
4. A stop during a pending microphone permission request cancels the request's recording lifetime. Event races are deduplicated, and tracks, listeners, and timers are released.
5. Caption and microphone motion reflects actual state, follows the theme, and honors `prefers-reduced-motion`. Motion must not imply an audio level that was not measured.
6. The npm update/download/install UI, dependency path, and publishing workflow are absent. Updates use a maintainer-selected GitHub Release archive and do not execute remote code automatically.
7. Legacy listener settings and credentials are migrated or retained without publishing their values. The package name and Client factory identity match the renamed plugin.

These are release gates, not claims that an unverified change is available. Do not describe a gate as passed until its evidence is recorded for the candidate release.

### Build and test commands

The current package scripts are:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm link:runtime
pnpm check
pnpm verify:package
```

`pnpm check` runs the package's configured type check, test suite, and build. `pnpm verify:package` checks the packed artifact. Use the repository's declared `pnpm` version. Lead must rerun these checks against the final source and release candidate. Add manual GUI, microphone, session-switch, and cloud-service results only when those checks were actually performed.

### Release, install, and rollback

1. Run the release gates and tests for the exact DSH versions claimed in the README.
2. Build and inspect the `.tgz` that will be attached to the versioned GitHub Release. Keep the asset tied to that exact package version and tag.
3. Install the chosen archive through DSH Plugin Manager. Follow the application status and any restart instruction returned by the manager; documentation does not prescribe stopping DSH.
4. Roll back by selecting the previous release tag and installing that tag's matching `.tgz` through the same manager. Do not substitute an unpinned package or an npm `latest` version.

A Release tag is the version boundary for installation and rollback. Do not replace an already published tag's archive without recording a new version.

### Privacy and safety

Speech audio is sent by the DSH Host to the user's configured Alibaba Cloud Bailian service. Credentials and private service addresses belong in the user's own DSH configuration, not in public source, examples, README files, issues, or release assets. A locally available microphone permission does not imply approval to transmit sensitive speech to a cloud service. Check the provider's terms, access controls, and billing conditions before use.

Do not commit API keys, private IP addresses, private gateway URLs, or user-specific route defaults. Do not claim that a particular cloud accuracy, latency, price, or availability has been verified without recorded tests.

### Upstream and license

Retain the MIT copyright and license notices from [gone1724/dsh-listener](https://github.com/gone1724/dsh-listener). Other reused code and project notices are listed in [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md). The upstream repository's 2026-10-02 update date is not a statement that its author has permanently stopped maintenance.

## 中文

### 项目标识

- 仓库：[QR-0W/DSH-ASR-Realtime](https://github.com/QR-0W/DSH-ASR-Realtime)
- 包名：`dsh-asr-realtime`
- 更名版本：`0.5.0`
- 分发方式：GitHub Release 附带按版本固定的 `.tgz`；不通过 npm 安装、发布或自动更新。

本项目基于 [gone1724/dsh-listener](https://github.com/gone1724/dsh-listener) 继续维护，上游采用 MIT 许可证。截至 2026-10-19，上游仓库最近一次公开更新日期为 2026-10-02。这只是对当时公开仓库状态的记录，不代表对作者未来维护计划的判断。

### 兼容声明

声明的 DSH 兼容范围仅限 `0.2.1-rc.1` 和 `0.2.1-rc.2`，本轮维护以 `0.2.1-rc.2` 为主要验收目标。其他 DSH 版本未验证，不得列为受支持版本。

只有在某个候选版本通过对应 DSH 版本的自动化检查和所需 Host/Client 验收后，维护者才能把该版本加入兼容表。归档内容相同或构建成功，不能证明真实麦克风、GUI 或云服务验收通过。请分别记录这些结果。Node.js 版本必须满足包的 `engines` 字段。

### 发布验收门槛

附加发布归档前，维护者必须针对源码和候选 `.tgz` 检查以下项目：

1. 停止录音、点击麦克风控件和字幕外部、窗口失焦或文档隐藏时，采集停止并保留已识别文字。中断不得触发自动发送。
2. 正常停止时请求云端最终结果。超时或断连时可以保留最近的 partial，并明确标记它尚未最终确认。final 和 partial 不得重复追加。
3. 切换会话或组件卸载时，恢复文字仍关联原会话。只有显式丢弃才删除文字。私有转写不得自动保存到 `localStorage`。
4. 麦克风授权尚未完成时收到停止操作，必须取消本次录音生命周期。事件竞态需要去重，并释放音轨、监听器和计时器。
5. 字幕与麦克风动效反映真实状态、遵循主题，并支持 `prefers-reduced-motion`。没有测量到音量时，动效不得暗示音量变化。
6. 移除 npm 更新、下载、安装界面和依赖路径，也移除 npm 发布工作流。更新由维护者选择 GitHub Release 归档，不自动执行远端代码。
7. 兼容旧 listener 的设置和凭据迁移或保留行为，不得发布凭据值。新包名与 Client factory 标识必须一致。

以上内容是发布门槛，不代表未验证的改动已经可用。候选版本没有对应证据时，不得把门槛写成已通过功能。

### 构建与测试命令

当前包脚本如下：

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm link:runtime
pnpm check
pnpm verify:package
```

`pnpm check` 执行包内配置的类型检查、测试和构建。`pnpm verify:package` 检查打包产物。使用仓库声明的 `pnpm` 版本。Lead 必须对最终源码和发布候选重新运行这些检查。只有实际完成时，才能补充 GUI、麦克风、会话切换和云服务的人工验收结果。

### 发布、安装与回滚

1. 对 README 声明的确切 DSH 版本运行发布门槛和测试。
2. 构建并检查将附加到版本化 GitHub Release 的 `.tgz`。归档必须对应确切包版本和 tag。
3. 通过 DSH Plugin Manager 安装所选归档。遵循管理器返回的应用状态和重启提示；本文不要求停止 DSH。
4. 回滚时，选择先前 release tag，并通过同一管理器安装该 tag 对应的 `.tgz`。不要改用未固定版本或 npm `latest`。

Release tag 是安装和回滚的版本边界。已发布 tag 的归档不得静默替换；如需变更，应记录为新版本。

### 隐私与安全

语音音频由 DSH Host 发送到用户配置的阿里云百炼服务。凭据和私有服务地址应留在用户自己的 DSH 配置中，不得放入公开源码、示例、README、issue 或发布归档。麦克风权限已授予，不代表用户已同意把敏感语音发送到云服务。使用前应检查服务条款、访问控制和计费条件。

不得提交 API Key、私有 IP、私有网关 URL 或用户专用路由默认值。没有实际测试记录时，不得声称已验证特定云服务的准确率、延迟、价格或可用性。

### 上游与许可证

保留 [gone1724/dsh-listener](https://github.com/gone1724/dsh-listener) 的 MIT 版权和许可证声明。其他复用代码及项目声明见 [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md)。上游仓库在 2026-10-02 的公开更新日期，不代表其作者已永久停止维护。
