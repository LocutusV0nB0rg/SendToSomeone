"use strict";

const DEFAULT_SETTINGS = {
  recipients: [],
  defaultIdentityId: "",
  forwardType: "forwardInline",
  reviewBeforeSend: false,
  tagKey: "",
};

const EMAIL_PATTERN = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

let identities = [];
let tags = [];
// Last stored configuration
let saved = structuredClone(DEFAULT_SETTINGS);
// Configuration currently being edited; written to storage on "Save"
let draft = structuredClone(DEFAULT_SETTINGS);

const $ = (id) => document.getElementById(id);

async function loadIdentities() {
  const accounts = await messenger.accounts.list(false);
  const result = [];
  for (const account of accounts) {
    for (const identity of account.identities || []) {
      const address = identity.name
        ? `${identity.name} <${identity.email}>`
        : identity.email;
      result.push({ id: identity.id, title: `${address} (${account.name})` });
    }
  }
  return result;
}

async function loadTags() {
  // messages.tags.list() replaces messages.listTags() in newer Thunderbird versions
  let list;
  try {
    list = await messenger.messages.tags.list();
  } catch {
    list = await messenger.messages.listTags();
  }
  return list.map((t) => ({ key: t.key, title: t.tag }));
}

function fillTagSelect(select, selectedKey) {
  select.replaceChildren();
  select.append(new Option("No tag", ""));
  for (const tag of tags) {
    select.append(new Option(tag.title, tag.key));
  }
  if (selectedKey && !tags.some((t) => t.key === selectedKey)) {
    select.append(new Option(`Unknown tag (${selectedKey})`, selectedKey));
  }
  select.value = selectedKey || "";
}

function fillIdentitySelect(select, selectedId, defaultLabel) {
  select.replaceChildren();
  select.append(new Option(defaultLabel, ""));
  for (const identity of identities) {
    select.append(new Option(identity.title, identity.id));
  }
  // Keep a stored identity selectable even if it no longer exists
  if (selectedId && !identities.some((i) => i.id === selectedId)) {
    select.append(new Option(`Unknown identity (${selectedId})`, selectedId));
  }
  select.value = selectedId || "";
}

// True when the "new recipient" row has input that was not added via "Add" yet
function hasPendingRecipient() {
  return Boolean($("newLabel").value.trim() || $("newEmail").value.trim());
}

function isDirty() {
  return hasPendingRecipient() || JSON.stringify(draft) !== JSON.stringify(saved);
}

function setStatus(text, isError = false) {
  const status = $("status");
  status.textContent = text;
  status.classList.toggle("error", isError);
}

const UNSAVED_MESSAGE = "You have unsaved changes.";

function updateSaveState() {
  const dirty = isDirty();
  $("save").disabled = !dirty;
  $("discard").disabled = !dirty;
  if (dirty) {
    setStatus(UNSAVED_MESSAGE);
  } else if ($("status").textContent === UNSAVED_MESSAGE) {
    // Only clear our own hint; keep "Saved", "Discarded" and error messages
    setStatus("");
  }
}

function change(patch) {
  draft = { ...draft, ...patch };
  updateSaveState();
}

function updateRecipient(id, patch) {
  change({
    recipients: draft.recipients.map((r) => (r.id === id ? { ...r, ...patch } : r)),
  });
}

function moveRecipient(index, delta) {
  const recipients = [...draft.recipients];
  const target = index + delta;
  if (target < 0 || target >= recipients.length) {
    return;
  }
  [recipients[index], recipients[target]] = [recipients[target], recipients[index]];
  change({ recipients });
  renderRecipients();
}

function renderGeneral() {
  fillIdentitySelect(
    $("defaultIdentity"),
    draft.defaultIdentityId,
    "Account of the selected message"
  );
  $("forwardType").value = draft.forwardType;
  fillTagSelect($("tag"), draft.tagKey);
  $("reviewBeforeSend").checked = draft.reviewBeforeSend;
}

function renderRecipients() {
  const tbody = document.querySelector("#recipients tbody");
  tbody.replaceChildren();

  draft.recipients.forEach((recipient, index) => {
    const row = document.createElement("tr");

    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.value = recipient.label || "";
    labelInput.addEventListener("input", () =>
      updateRecipient(recipient.id, { label: labelInput.value.trim() })
    );

    const emailInput = document.createElement("input");
    emailInput.type = "email";
    emailInput.value = recipient.email;
    emailInput.dataset.recipientId = recipient.id;
    emailInput.addEventListener("input", () => {
      emailInput.classList.remove("invalid");
      updateRecipient(recipient.id, { email: emailInput.value.trim() });
    });

    const identitySelect = document.createElement("select");
    fillIdentitySelect(identitySelect, recipient.identityId, "Default sender");
    identitySelect.addEventListener("change", () =>
      updateRecipient(recipient.id, { identityId: identitySelect.value })
    );

    const up = document.createElement("button");
    up.textContent = "↑";
    up.title = "Move up";
    up.disabled = index === 0;
    up.addEventListener("click", () => moveRecipient(index, -1));

    const down = document.createElement("button");
    down.textContent = "↓";
    down.title = "Move down";
    down.disabled = index === draft.recipients.length - 1;
    down.addEventListener("click", () => moveRecipient(index, 1));

    const remove = document.createElement("button");
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      change({ recipients: draft.recipients.filter((r) => r.id !== recipient.id) });
      renderRecipients();
    });

    for (const element of [labelInput, emailInput, identitySelect]) {
      const cell = document.createElement("td");
      cell.append(element);
      row.append(cell);
    }
    const actions = document.createElement("td");
    actions.append(up, down, remove);
    row.append(actions);

    tbody.append(row);
  });
}

function clearNewRecipient() {
  $("newLabel").value = "";
  $("newEmail").value = "";
  $("newIdentity").value = "";
  $("newEmail").classList.remove("invalid");
}

// Returns false if the "new recipient" row could not be added
function addRecipient() {
  const label = $("newLabel").value.trim();
  const email = $("newEmail").value.trim();
  if (!EMAIL_PATTERN.test(email)) {
    setStatus(
      email
        ? `"${email}" is not a valid email address.`
        : "Please enter an email address for the new recipient.",
      true
    );
    $("newEmail").classList.add("invalid");
    $("newEmail").focus();
    return false;
  }
  $("newEmail").classList.remove("invalid");
  setStatus("");

  change({
    recipients: [
      ...draft.recipients,
      { id: crypto.randomUUID(), label, email, identityId: $("newIdentity").value },
    ],
  });

  clearNewRecipient();
  renderRecipients();
  $("newLabel").focus();
  return true;
}

async function saveSettings() {
  // Include a filled-in "new recipient" row even if "Add" was not clicked
  if (hasPendingRecipient() && !addRecipient()) {
    setStatus(`Not saved: ${$("status").textContent}`, true);
    return;
  }

  const invalid = draft.recipients.filter((r) => !EMAIL_PATTERN.test(r.email));
  for (const input of document.querySelectorAll("#recipients tbody input[type=email]")) {
    input.classList.toggle(
      "invalid",
      invalid.some((r) => r.id === input.dataset.recipientId)
    );
  }
  if (invalid.length > 0) {
    setStatus(
      `Not saved: invalid email address(es): ${invalid.map((r) => `"${r.email}"`).join(", ")}`,
      true
    );
    return;
  }

  // The background script listens to storage changes and rebuilds the menu
  // immediately; the other settings are read on every forward.
  await messenger.storage.local.set(draft);
  saved = structuredClone(draft);
  setStatus("Saved – changes are active.");
  updateSaveState();
}

function discardChanges() {
  draft = structuredClone(saved);
  clearNewRecipient();
  renderGeneral();
  renderRecipients();
  setStatus("Changes discarded.");
  updateSaveState();
}

async function init() {
  [identities, tags] = await Promise.all([loadIdentities(), loadTags()]);
  saved = { ...DEFAULT_SETTINGS, ...(await messenger.storage.local.get(DEFAULT_SETTINGS)) };
  draft = structuredClone(saved);

  renderGeneral();
  fillIdentitySelect($("newIdentity"), "", "Default sender");

  $("defaultIdentity").addEventListener("change", (e) =>
    change({ defaultIdentityId: e.target.value })
  );
  $("forwardType").addEventListener("change", (e) =>
    change({ forwardType: e.target.value })
  );
  $("tag").addEventListener("change", (e) => change({ tagKey: e.target.value }));
  $("reviewBeforeSend").addEventListener("change", (e) =>
    change({ reviewBeforeSend: e.target.checked })
  );

  $("add").addEventListener("click", addRecipient);
  for (const id of ["newLabel", "newEmail"]) {
    $(id).addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        addRecipient();
      }
    });
    $(id).addEventListener("input", () => {
      $("newEmail").classList.remove("invalid");
      setStatus("");
      updateSaveState();
    });
  }

  $("save").addEventListener("click", saveSettings);
  $("discard").addEventListener("click", discardChanges);
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (isDirty()) {
        saveSettings();
      }
    }
  });
  window.addEventListener("beforeunload", (e) => {
    if (isDirty()) {
      e.preventDefault();
    }
  });

  renderRecipients();
  updateSaveState();
}

init();
