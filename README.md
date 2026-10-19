<h1 align="center">DSH ASR Realtime</h1>
<p align="center">Real-time cloud speech recognition for DeepSeek Harness, with live captions and draft-oriented input.</p>
<p align="center">
  <a href="https://github.com/QR-0W/DSH-ASR-Realtime"><img alt="GitHub repository" src="https://img.shields.io/badge/GitHub-QR--0W%2FDSH--ASR--Realtime-181717?logo=github&style=flat-square"></a>
  <a href="https://github.com/QR-0W/DSH-ASR-Realtime/releases"><img alt="Release assets" src="https://img.shields.io/badge/releases-fixed%20tag%20assets-2F81F7?style=flat-square"></a>
  <img alt="Package version 0.5.0" src="https://img.shields.io/badge/package-0.5.0-347D39?style=flat-square">
  <img alt="MIT license" src="https://img.shields.io/badge/license-MIT-6F42C1?style=flat-square">
</p>
<p align="center"><a href="README.zh-CN.md">简体中文</a> · <a href="docs/MAINTENANCE.md">Maintenance policy</a> · <a href="CHANGELOG.md">Changelog</a></p>

This plugin adds cloud speech recognition to DeepSeek Harness (DSH). Speak with a configured microphone or shortcut, view the live transcript, and add the recognized text to the active conversation draft. Draft-only behavior is the default; automatic submission is an explicit setting.

Package: `dsh-asr-realtime@0.5.0`. Releases are distributed as versioned `.tgz` assets from GitHub. This project does not use npm as its installation or update channel.

## Features

- Real-time speech recognition through the configured Alibaba Cloud Bailian service.
- Floating live captions with eased entrance animation, status waves and reduced-motion support.
- Clicking outside the controls/caption, switching away or losing focus stops recognition and keeps recognized words. These interruptions never automatically submit a draft.
- Late results are held for the original conversation, with recover/append/copy/discard controls if its composer is unavailable.
- Transcript insertion into the active conversation draft; automatic submission is off by default and requires a complete, deliberately stopped result.
- Microphone and shortcut controls with configurable recording behavior.
- No npm update checks, download mirrors, automatic installers or background release queries. Open GitHub Releases manually to update.

Preserved text is memory-only. Returning to the original conversation can recover a late result; reloading or closing the page clears it. Error/timeout recovery can contain an uncorrected partial transcript, which should be checked before sending.

Only behavior accepted for a release is part of that release's support claim. See [maintenance and verification policy](docs/MAINTENANCE.md) for compatibility and release checks.

## Compatibility

| DSH version | Support status |
| --- | --- |
| `0.2.1-rc.1` | In the tested compatibility scope |
| `0.2.1-rc.2` | In the tested compatibility scope; primary target for this maintenance round |
| Other versions | Not verified; no compatibility claim |

The package requires Node.js `^22.19.0 || >=24.0.0`. Compatibility entries are limited to versions exercised by the project checks; successful packaging alone does not establish GUI or microphone acceptance.

## Install or roll back

1. Open the [GitHub Releases](https://github.com/QR-0W/DSH-ASR-Realtime/releases) page and select the exact release tag to install.
2. Download that release's `.tgz` asset and install the local archive through DSH Plugin Manager. Confirm the package version and follow the result shown by the manager.
3. To roll back, select the prior release tag and install its matching `.tgz` through the same manager. Do not substitute a floating `latest` package.

Do not install this renamed package beside an active legacy `dsh-listener` instance. Follow the selected release's migration notes and verify the resulting settings before recording.

## Configure and use

1. Configure access to Alibaba Cloud Bailian in the DSH environment and grant microphone permission to the DSH page.
2. Open the plugin settings and select the recognition model, region, shortcut, and recording mode. Keep credentials and private service addresses out of public issues, screenshots, and repository files.
3. Start recording with the configured microphone control or shortcut. Review the live caption and draft before sending.
4. Enable automatic submission only when that behavior is intended. The default is off.

Remote DSH pages require HTTPS for microphone access; localhost is treated as a secure context by browsers. Audio is sent by the DSH Host to the configured recognition service. Review the provider's data-handling terms and the deployment's access controls before using sensitive speech.

## Development

Use the repository's pinned package manager (`pnpm` 10.18.0) and the Node.js version declared by `package.json`.

```sh
# First install a supported DSH version, or set DSH_RUNTIME_DIR to its package directory.
pnpm install --frozen-lockfile --ignore-scripts
pnpm link:runtime
pnpm check
pnpm verify:package
```

`pnpm check` runs the configured type, test, and build checks. `pnpm verify:package` checks the packed artifact. Use these checks before proposing a release; do not infer live microphone or cloud-service acceptance from an offline test.

## Attribution and license

This project continues work based on [gone1724/dsh-listener](https://github.com/gone1724/dsh-listener), distributed under the MIT License. As of 2026-10-19, the upstream repository's latest public update was 2026-10-02. This records the public update history at that date and makes no claim about the author's future maintenance plans.

See [third-party notices](THIRD_PARTY_NOTICES.md), [MIT license](LICENSE), and the [maintenance policy](docs/MAINTENANCE.md). The upstream copyright and license notices remain applicable to the portions covered by them.

## Links

- [Source and issues](https://github.com/QR-0W/DSH-ASR-Realtime)
- [Releases](https://github.com/QR-0W/DSH-ASR-Realtime/releases)
- [中文说明](README.zh-CN.md)
- [Maintenance policy](docs/MAINTENANCE.md)
- [Changelog](CHANGELOG.md)
