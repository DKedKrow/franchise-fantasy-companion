# Franchise Fantasy Companion

An independent Windows companion for Madden NFL 27 offline Franchise saves. It turns completed Franchise games into fantasy scoring, season analytics, records, power rankings, playable fantasy leagues, and a fictional living Fantasy World.

## Public beta

This is pre-release software. Export a companion backup from **Settings** before upgrading or testing a new build. The app never edits the Madden save: it reads a temporary copy and stores its own leagues, worlds, and preferences locally on the PC.

## Install

Choose one Windows x64 download:

- **Setup** installs the app and can create a desktop shortcut.
- **Portable** runs directly without installation.

Windows SmartScreen may warn about an unknown publisher because the beta is not code-signed. Confirm that the SHA-256 checksum matches the checksum file shipped with the release before running it.

## First run

1. Start Franchise Fantasy Companion.
2. Let it detect a `CAREER-` file in `Documents\\Madden NFL 27\\saves` or use **Browse**.
3. Choose Full PPR, Half PPR, Standard, or your saved custom scoring.
4. Finish a Franchise game and return to the Franchise hub so Madden saves it.

The app supports offline Franchise saves. Online leagues and cloud Franchise files are not supported.

## Privacy and safety

- No analytics, advertising, accounts, or telemetry.
- Madden saves are copied to a temporary directory for read-only extraction and then the copy is deleted.
- Companion preferences, fantasy leagues, and Fantasy Worlds remain in Electron's local application data.
- Player portraits may be loaded from EA's public image host when available.
- Support reports omit the full save path and do not contain the Madden save itself.

## Troubleshooting

- If no save appears, use **Browse** and select the relevant `CAREER-` file.
- If stats appear stale, return to Madden's Franchise hub, wait for the save to complete, and choose **Refresh stats**.
- If a fantasy league or world behaves unexpectedly, export a backup and create a support report from **Settings** before resetting anything.

## Independence notice

Franchise Fantasy Companion is an independent fan-made project. It is not affiliated with, sponsored by, or endorsed by Electronic Arts, EA Sports, Madden, the National Football League, or any NFL club. All referenced trademarks belong to their respective owners.

## Support and releases

- Releases: https://github.com/DKedKrow/franchise-fantasy-companion/releases
- Bug reports: https://github.com/DKedKrow/franchise-fantasy-companion/issues
- Security reports: see `SECURITY.md`
