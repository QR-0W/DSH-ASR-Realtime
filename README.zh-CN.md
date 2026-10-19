<h1 align="center">DSH ASR Realtime</h1>
<p align="center">为 DeepSeek Harness 提供实时云端语音识别、字幕与草稿输入。</p>
<p align="center">
  <a href="https://github.com/QR-0W/DSH-ASR-Realtime"><img alt="GitHub 仓库" src="https://img.shields.io/badge/GitHub-QR--0W%2FDSH--ASR--Realtime-181717?logo=github&style=flat-square"></a>
  <a href="https://github.com/QR-0W/DSH-ASR-Realtime/releases"><img alt="发布归档" src="https://img.shields.io/badge/releases-固定版本归档-2F81F7?style=flat-square"></a>
  <img alt="包版本 0.5.0" src="https://img.shields.io/badge/package-0.5.0-347D39?style=flat-square">
  <img alt="MIT 许可证" src="https://img.shields.io/badge/license-MIT-6F42C1?style=flat-square">
</p>
<p align="center"><a href="README.md">English</a> · <a href="docs/MAINTENANCE.md">维护政策</a> · <a href="CHANGELOG.md">更新记录</a></p>

本插件为 DeepSeek Harness（DSH）提供云端语音识别。使用已配置的麦克风或快捷键说话，查看实时字幕，并将识别文字追加到当前会话草稿。默认只写入草稿；自动发送需要显式开启。

包名：`dsh-asr-realtime@0.5.0`。发布物是 GitHub 上按版本固定的 `.tgz` 归档。本项目不通过 npm 安装或更新。

## 功能

- 通过已配置的阿里云百炼服务进行实时语音识别。
- 浮动字幕采用非线性入场与状态波形动效，支持系统减少动态效果设置。
- 点击控件和字幕外部、切换页面或失焦时停止识别并保留文字；这些中断不会触发自动发送。
- 迟到结果保留给原会话，输入框不可用时可恢复、追加、复制或明确丢弃。
- 将识别文字写入当前会话草稿；默认关闭自动发送，只有主动停止且完整的结果才允许自动发送。
- 提供麦克风和快捷键控制，可配置录音方式。
- 移除 npm 更新检查、下载镜像、安装器和后台版本查询；更新时手动打开 GitHub Releases。

保留文字只存在页面内存中。返回原会话可以恢复迟到结果；刷新或关闭页面会清空缓存。错误或超时保留的中间结果可能尚未经过最终修正，发送前请核对。

只有通过该版本验收的行为才纳入对应版本的支持声明。兼容范围与发布检查见[维护和验证政策](docs/MAINTENANCE.md)。

## 兼容范围

| DSH 版本 | 支持状态 |
| --- | --- |
| `0.2.1-rc.1` | 属于已测试的兼容范围 |
| `0.2.1-rc.2` | 属于已测试的兼容范围；本轮维护以此版本为主要验收目标 |
| 其他版本 | 未验证，不作兼容声明 |

包要求 Node.js `^22.19.0 || >=24.0.0`。兼容范围只包含项目实际执行过验证的版本；打包成功本身不能证明 GUI 或麦克风验收通过。

## 安装或回滚

1. 打开 [GitHub Releases](https://github.com/QR-0W/DSH-ASR-Realtime/releases)，选择要安装的确切发布 tag。
2. 下载该 release 附带的 `.tgz`，通过 DSH Plugin Manager 安装本地归档。核对包版本，并按管理器显示的结果继续。
3. 回滚时，选择先前的 release tag，再通过同一管理器安装对应 `.tgz`。不要改用浮动的 `latest` 包。

不要让重命名前的 `dsh-listener` 与新包同时处于启用状态。按目标 release 的迁移说明操作，并在录音前核对设置。

## 配置与使用

1. 在 DSH 环境中配置阿里云百炼访问，并向 DSH 页面授予麦克风权限。
2. 打开插件设置，选择识别模型、地域、快捷键和录音方式。不要把凭据或私有服务地址放进公开 issue、截图或仓库文件。
3. 使用麦克风控件或快捷键开始录音。检查实时字幕和草稿，再决定是否发送。
4. 只有在确实需要时才开启自动发送。默认设置为关闭。

远程 DSH 页面需要使用 HTTPS 才能访问麦克风；浏览器将 localhost 视为安全上下文。音频由 DSH Host 发送到已配置的识别服务。处理敏感语音前，请确认服务的数据处理条款和部署访问控制。

## 开发

使用仓库指定的包管理器（`pnpm` 10.18.0）和 `package.json` 声明的 Node.js 版本。

```sh
# 先安装受支持的 DSH，或用 DSH_RUNTIME_DIR 指向其包目录。
pnpm install --frozen-lockfile --ignore-scripts
pnpm link:runtime
pnpm check
pnpm verify:package
```

`pnpm check` 执行已配置的类型、测试和构建检查。`pnpm verify:package` 检查打包产物。准备发布前运行这些检查；离线测试不能代替真实麦克风或云服务验收。

## 来源与许可证

本项目基于 [gone1724/dsh-listener](https://github.com/gone1724/dsh-listener) 继续维护，上游采用 MIT 许可证。截至 2026-10-19，上游仓库最近一次公开更新日期为 2026-10-02。该日期只描述当时可见的公开更新记录，不代表对作者未来维护计划的判断。

参见[第三方声明](THIRD_PARTY_NOTICES.md)、[MIT 许可证](LICENSE)和[维护政策](docs/MAINTENANCE.md)。适用部分继续保留上游版权与许可证声明。

## 链接

- [源码与问题反馈](https://github.com/QR-0W/DSH-ASR-Realtime)
- [发布归档](https://github.com/QR-0W/DSH-ASR-Realtime/releases)
- [English README](README.md)
- [维护政策](docs/MAINTENANCE.md)
- [更新记录](CHANGELOG.md)
