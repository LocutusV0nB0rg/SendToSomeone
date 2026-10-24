# Send To Someone

A Thunderbird add-on that forwards emails to preconfigured recipients with a single click.
Right-click one or more messages, choose **Forward to… → _recipient_**, and the messages are
forwarded and sent immediately — optionally from a specific sender identity and tagged afterwards.

- **Add-on ID:** `send-to-someone@ewv-software.de`
- **Current version:** 1.3.0
- **Requires:** Thunderbird 115 or newer (Manifest V2 MailExtension)

---

## Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [How it works](#how-it-works)
- [Permissions](#permissions)
- [Project structure](#project-structure)
- [Development](#development)
- [Building](#building)
- [Releasing a new version](#releasing-a-new-version)
- [Troubleshooting](#troubleshooting)
- [Changelog](#changelog)

---

## Features

- **Context menu forwarding** – a *Forward to…* submenu in the message list with one entry per configured recipient.
- **Instant send** – forwards and sends without further interaction.
- **Multiple selection** – forwards every selected message (each as its own email).
- **Configurable sender** – a global default sender identity plus an optional per-recipient override.
- **Forward mode** – inline or as attachment.
- **Optional tagging** – adds one of your Thunderbird tags to each successfully forwarded message, keeping existing tags.
- **Review mode** – optionally opens the compose window instead of sending, so you can check the message first.
- **Explicit save** – settings are edited as a draft and applied live when you click **Save** (or press <kbd>Ctrl</kbd>+<kbd>S</kbd>).
- **Notifications** – a desktop notification reports success or failure.

## Installation

### From the packaged file

1. Build the package (see [Building](#building)) or take the latest file from `dist/`, e.g. `dist/send-to-someone-1.3.0.xpi`.
2. In Thunderbird open **☰ → Add-ons and Themes**.
3. Click the gear icon → **Install Add-on From File…** and select the `.xpi`.
4. Confirm the permission prompt.

Installing a newer `.xpi` over an existing installation updates it and keeps your settings.

### Temporary installation (development)

1. Open **☰ → Add-ons and Themes → gear icon → Debug Add-ons** (or `about:debugging`).
2. Click **Load Temporary Add-on…** and select `manifest.json` in this repository.
3. Use **Reload** on the debugging page after changing files.

Temporary add-ons are removed when Thunderbird restarts; settings stored by them persist as long as the add-on ID stays the same.

## Usage

1. Configure at least one recipient (see [Configuration](#configuration)).
2. In the message list, select one or more emails and right-click.
3. Choose **Forward to…** and click a recipient.

The messages are forwarded with the configured sender and forward mode. A notification confirms the result.
If no recipients are configured, the submenu offers a shortcut to the settings instead.

## Configuration

Open the settings via **Add-ons and Themes → Send To Someone → Options**, or via the context menu entry
**Forward to… → Settings…**.

Changes are **not** applied while editing. The bar at the bottom shows *You have unsaved changes*;
click **Save** (or press <kbd>Ctrl</kbd>+<kbd>S</kbd>) to store and apply them immediately — the context menu is
rebuilt at once and all other options take effect on the next forward. **Discard changes** reverts to the last
saved state. Thunderbird warns you when leaving the page with unsaved changes.

### General

| Setting | Description | Default |
| --- | --- | --- |
| **Default sender** | Identity used as the *From* address. *Account of the selected message* lets Thunderbird pick the identity that belongs to the message's account. | Account of the selected message |
| **Forward as** | *Inline* quotes the original message in the body; *Attachment* attaches it as an `.eml` file. | Inline |
| **Tag after forwarding** | A Thunderbird tag added to the original message after it was sent successfully. Existing tags are kept. *No tag* leaves tags untouched. | No tag |
| **Review mode** | *Open the compose window for review instead of sending immediately.* No mail is sent automatically and no tag is applied. | Off |

### Recipients

Each recipient has:

| Field | Description |
| --- | --- |
| **Name** (optional) | Display name, shown in the menu and used in the *To* header (`"Name" <address>`). |
| **Email address** | Required; validated when adding and when saving. |
| **Sender** | *Default sender* uses the general setting; any identity selected here overrides it for this recipient. |

Use **↑ / ↓** to change the order in the context menu and **Remove** to delete a recipient.
Invalid addresses are outlined in red and block saving until they are fixed.

**Adding:** fill in the empty row at the bottom and click **Add** (or press <kbd>Enter</kbd>). Clicking **Add** is
optional — when you click **Save** (or press <kbd>Ctrl</kbd>+<kbd>S</kbd>), a filled-in row is added automatically.
Typing in that row counts as an unsaved change. If the row has a name but no email address, or an invalid one,
nothing is saved and the email field is outlined in red; fill it in or clear the row. **Discard changes** also
clears the row.

If a configured identity or tag is later deleted in Thunderbird, the settings page shows it as
*Unknown identity* / *Unknown tag* rather than silently changing your configuration.

### Stored data

Settings are stored in the add-on's local storage (`storage.local`) with this shape:

```json
{
  "recipients": [
    { "id": "uuid", "label": "Accounting", "email": "accounting@example.com", "identityId": "" }
  ],
  "defaultIdentityId": "",
  "forwardType": "forwardInline",
  "reviewBeforeSend": false,
  "tagKey": ""
}
```

Empty `identityId` / `defaultIdentityId` / `tagKey` mean "use default" / "no tag".

## How it works

For each selected message, the background script ([background.js](background.js)):

1. Opens a forward with `compose.beginForward(messageId, forwardType, { to, identityId })`.
2. Unless review mode is on, sends it with `compose.sendMessage(tabId, { mode: "sendNow" })`.
3. If a tag is configured and sending succeeded, re-reads the message header and calls
   `messages.update(messageId, { tags: [...existingTags, tagKey] })` — only if the tag is not already present.

Notes:

- Thunderbird briefly shows the compose window while it is sending; this is how the WebExtension API forwards messages.
- If sending fails, the compose window stays open so you can fix the problem or send manually.
- A failure for one message does not stop the remaining messages; failures are listed in the notification.
- Tagging errors are reported separately and do not count as forwarding failures.
- The context menu is rebuilt whenever the stored recipient list changes (`storage.onChanged`).

## Permissions

| Permission | Why it is needed |
| --- | --- |
| `menus` | Adds the *Forward to…* context menu. |
| `messagesRead` | Reads the selected messages and their current tags; lists available tags. |
| `messagesUpdate` | Adds the configured tag to forwarded messages. |
| `accountsRead` | Lists your identities for the sender selection. |
| `compose` | Creates the forward. |
| `compose.send` | Sends the forward without user interaction. |
| `storage` | Saves the configuration. |
| `notifications` | Shows success / failure notifications. |

## Project structure

```
.
├── manifest.json        Add-on manifest (ID, version, permissions)
├── background.js        Context menu, forwarding, sending and tagging logic
├── options/
│   ├── options.html     Settings page markup
│   ├── options.js       Settings page logic (draft state, validation, save/discard)
│   └── options.css      Settings page styles (follows light/dark theme)
├── icons/
│   └── icon.svg         Add-on and menu icon
├── build.ps1            Packages the add-on into dist/
├── .gitignore           Excludes dist/ from version control
└── dist/                Built .xpi packages (generated, not versioned)
```

## Development

- No dependencies and no build step for the code itself — the files are loaded by Thunderbird as they are.
- Load the add-on temporarily (see [Temporary installation](#temporary-installation-development)) and press **Reload** after changes.
- Debug the background script via **Debug Add-ons → Inspect** next to the add-on; errors are logged with the prefix `Send To Someone:`.
- The settings page can be inspected with the same developer tools while it is open.
- Quick syntax check (requires Node.js):

  ```bash
  node --check background.js
  node --check options/options.js
  ```

- `DEFAULT_SETTINGS` is defined in both `background.js` and `options/options.js`; keep them in sync when adding options.

API reference: [Thunderbird WebExtension APIs](https://webextension-api.thunderbird.net/).

## Building

```bash
powershell -ExecutionPolicy Bypass -File build.ps1
```

This creates `dist/send-to-someone-<version>.xpi`, with the version read from `manifest.json`.
An existing package with the same version is overwritten. The `dist/` directory is generated and
excluded from version control via [.gitignore](.gitignore).

### Packaging details

An `.xpi` is a plain **zip** archive with `manifest.json` at its root. The script packages
`manifest.json`, `background.js`, `icons/` and `options/` — documentation and build files are not included.

The script calls Windows' own `%SystemRoot%\System32\tar.exe` (bsdtar) with `--format zip`:

- **Why `tar.exe` and not `Compress-Archive`?** Thunderbird requires zip entry paths with forward slashes
  (`options/options.js`); `Compress-Archive` in Windows PowerShell 5.1 writes backslashes.
- **Why the full path?** Another `tar.exe` earlier on the `PATH` (e.g. from WinAVR or Git) is GNU tar,
  which cannot create zip files.
- **Why `--format zip` instead of `-a`?** `-a` selects the format from the file extension and does not know
  `.xpi`, so it silently falls back to a **tar** archive. Thunderbird rejects such a file as corrupt.
  Packages built with `-a` (the first builds of 1.0.0 – 1.2.0) were affected.

### Verifying a package

A valid package starts with the zip signature `PK` (`50 4B 03 04`) and lists the expected entries:

```powershell
$xpi = "dist/send-to-someone-1.3.0.xpi"
$b = [System.IO.File]::ReadAllBytes($xpi); ($b[0..3] | ForEach-Object { '{0:X2}' -f $_ }) -join ' '
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $xpi)).Entries.FullName
```

Expected output: `50 4B 03 04`, followed by `manifest.json`, `background.js`, `icons/icon.svg` and the
`options/` files. Note that `tar -tf` is **not** a reliable check — it lists both tar and zip archives.

## Releasing a new version

1. Increase `version` in [manifest.json](manifest.json) — Thunderbird only accepts an update with a higher version.
2. Update the [Changelog](#changelog) and the version at the top of this file.
3. Run the build, [verify the package](#verifying-a-package), and install the new `.xpi` over the old one to test the update path.
4. If you add permissions, list them in [Permissions](#permissions); users are asked to approve new permissions on update.

## Troubleshooting

| Problem | Solution |
| --- | --- |
| *Forward to…* does not appear | The menu is only available in the message list. Check that the add-on is enabled. |
| Submenu only shows *No recipients configured* | Add recipients in the settings and click **Save**. |
| Changes in the settings have no effect | Click **Save** — changes are only applied after saving. |
| Mail is not sent, compose window stays open | Sending failed (e.g. SMTP or authentication error) or review mode is enabled. Check the notification and the compose window. |
| Wrong sender address | Check the recipient's *Sender* override and the *Default sender* setting. |
| Tag is not applied | Tags are only added after a successful send, never in review mode. Check that the tag still exists in Thunderbird. |
| Build fails with `invalid option -- a` | An incompatible `tar.exe` is used; `build.ps1` calls the system one explicitly — make sure you run the current script. |
| Thunderbird reports the `.xpi` as corrupt or not installable | The package is probably a tar archive from an old build. Rebuild with the current `build.ps1` and [verify the package](#verifying-a-package). |

## Changelog

### 1.3.0

- **Save** also adds a recipient that was filled in but not yet added with **Add**; an incomplete row blocks saving with an error.
- Fix: the "Saved – changes are active." and "Changes discarded." messages were cleared immediately and never visible.

### 1.2.0

- Optional tag that is added to forwarded messages (existing tags are kept).
- New permission: `messagesUpdate`.
- Build: packages are now real zip archives (`tar.exe --format zip`); earlier builds produced tar archives
  that Thunderbird could not install. `dist/` is excluded via `.gitignore`.

### 1.1.0

- Settings are edited as a draft and applied with **Save** / <kbd>Ctrl</kbd>+<kbd>S</kbd>; **Discard changes** button.
- Validation of all email addresses on save; warning when leaving with unsaved changes.

### 1.0.0

- Initial release: configurable recipients, *Forward to…* context menu, instant send, default and per-recipient sender, inline/attachment forwarding, review mode, notifications.
