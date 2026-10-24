"use strict";

const DEFAULT_SETTINGS = {
  // [{ id, label, email, identityId }] – identityId "" means "use default sender"
  recipients: [],
  // "" means: let Thunderbird pick the identity of the account the message belongs to
  defaultIdentityId: "",
  // "forwardInline" | "forwardAsAttachment"
  forwardType: "forwardInline",
  // When true, the compose window is left open for review instead of sending immediately
  reviewBeforeSend: false,
  // Key of a Thunderbird tag added to forwarded messages; "" means no tagging
  tagKey: "",
};

const MENU_ROOT = "sts-root";
const MENU_RECIPIENT_PREFIX = "sts-recipient-";
const MENU_SETTINGS = "sts-settings";

async function getSettings() {
  const stored = await messenger.storage.local.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

async function rebuildMenus() {
  await messenger.menus.removeAll();
  const { recipients } = await getSettings();

  messenger.menus.create({
    id: MENU_ROOT,
    title: "Forward to…",
    contexts: ["message_list"],
    icons: { 16: "icons/icon.svg", 32: "icons/icon.svg" },
  });

  if (recipients.length === 0) {
    messenger.menus.create({
      id: MENU_SETTINGS,
      parentId: MENU_ROOT,
      title: "No recipients configured – open settings…",
      contexts: ["message_list"],
    });
    return;
  }

  for (const recipient of recipients) {
    messenger.menus.create({
      id: MENU_RECIPIENT_PREFIX + recipient.id,
      parentId: MENU_ROOT,
      title: recipient.label
        ? `${recipient.label} <${recipient.email}>`
        : recipient.email,
      contexts: ["message_list"],
    });
  }

  messenger.menus.create({
    id: "sts-separator",
    parentId: MENU_ROOT,
    type: "separator",
    contexts: ["message_list"],
  });
  messenger.menus.create({
    id: MENU_SETTINGS,
    parentId: MENU_ROOT,
    title: "Settings…",
    contexts: ["message_list"],
  });
}

async function collectMessages(messageList) {
  const messages = [...messageList.messages];
  let page = messageList;
  while (page.id) {
    page = await messenger.messages.continueList(page.id);
    messages.push(...page.messages);
  }
  return messages;
}

function formatAddress(recipient) {
  return recipient.label
    ? `"${recipient.label.replace(/"/g, "")}" <${recipient.email}>`
    : recipient.email;
}

async function forwardMessage(message, recipient, settings) {
  const details = { to: [formatAddress(recipient)] };
  const identityId = recipient.identityId || settings.defaultIdentityId;
  if (identityId) {
    details.identityId = identityId;
  }

  const composeTab = await messenger.compose.beginForward(
    message.id,
    settings.forwardType,
    details
  );

  if (settings.reviewBeforeSend) {
    return false;
  }

  await messenger.compose.sendMessage(composeTab.id, { mode: "sendNow" });
  return true;
}

async function addTag(messageId, tagKey) {
  // Re-read the header so tags changed since the click are kept
  const { tags = [] } = await messenger.messages.get(messageId);
  if (!tags.includes(tagKey)) {
    await messenger.messages.update(messageId, { tags: [...tags, tagKey] });
  }
}

function notify(title, message) {
  return messenger.notifications.create({
    type: "basic",
    iconUrl: "icons/icon.svg",
    title,
    message,
  });
}

async function handleForward(recipientId, info) {
  const settings = await getSettings();
  const recipient = settings.recipients.find((r) => r.id === recipientId);
  if (!recipient || !info.selectedMessages) {
    return;
  }

  const messages = await collectMessages(info.selectedMessages);
  let sent = 0;
  const failures = [];
  const tagFailures = [];

  for (const message of messages) {
    let wasSent;
    try {
      wasSent = await forwardMessage(message, recipient, settings);
    } catch (error) {
      console.error("Send To Someone: forwarding failed", error);
      failures.push(`"${message.subject}": ${error.message || error}`);
      continue;
    }
    if (!wasSent) {
      continue;
    }
    sent++;

    if (settings.tagKey) {
      try {
        await addTag(message.id, settings.tagKey);
      } catch (error) {
        console.error("Send To Someone: tagging failed", error);
        tagFailures.push(`"${message.subject}": ${error.message || error}`);
      }
    }
  }

  if (tagFailures.length > 0) {
    await notify(
      "Tagging failed",
      `${tagFailures.length} forwarded message(s) could not be tagged.\n${tagFailures.join("\n")}`
    );
  }

  if (failures.length > 0) {
    await notify(
      "Forwarding failed",
      `${failures.length} of ${messages.length} message(s) could not be forwarded to ${recipient.email}.\n${failures.join("\n")}`
    );
  } else if (sent > 0) {
    await notify(
      "Message forwarded",
      `${sent} message(s) forwarded to ${recipient.email}.`
    );
  }
}

messenger.menus.onClicked.addListener((info) => {
  const id = String(info.menuItemId);
  if (id === MENU_SETTINGS) {
    messenger.runtime.openOptionsPage();
  } else if (id.startsWith(MENU_RECIPIENT_PREFIX)) {
    handleForward(id.slice(MENU_RECIPIENT_PREFIX.length), info);
  }
});

messenger.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.recipients) {
    rebuildMenus();
  }
});

rebuildMenus();
