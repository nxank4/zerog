var vscode = acquireVsCodeApi();
var chatStream = document.getElementById('chat-stream');
var chatContainer = document.getElementById('chat-container');
var messageInput = document.getElementById('message-input');
var sendButton = document.getElementById('send-button');
var stopButton = document.getElementById('stop-button');
var attachButton = document.getElementById('attach-button');
var contextText = document.getElementById('context-text');
var commandHints = document.getElementById('command-hints');
var dropZoneOverlay = document.getElementById('drop-zone-overlay');
var droppedFilesContainer = document.getElementById('dropped-files-container');
var modeSelect = document.getElementById('mode-select');
var planContainer = document.getElementById('plan-container');
var planTasksEl = document.getElementById('plan-tasks');
var planProgressEl = document.getElementById('plan-progress');
var changesContainer = document.getElementById('changes-container');
var changesListEl = document.getElementById('changes-list');
var sessionTitle = document.getElementById('session-title');
var sessionTitleInput = document.getElementById('session-title-input');
var droppedFiles = new Map();
var pendingImages = [];
var currentPlan = [];
var spinnerFrames = ['\u280B', '\u2819', '\u2839', '\u2838', '\u283C', '\u2834', '\u2826', '\u2827', '\u2807', '\u280F'];
var isStreaming = false;

function scrollToBottom() {
  chatStream.scrollTop = chatStream.scrollHeight;
}

var bubbleSpinnerInterval = null;
function startBubbleSpinner() {
  stopBubbleSpinner();
  var bIdx = 0;
  var el = document.getElementById('bubble-spinner-char');
  if (!el) return;
  el.textContent = spinnerFrames[0];
  bubbleSpinnerInterval = setInterval(function() {
    bIdx = (bIdx + 1) % spinnerFrames.length;
    var bel = document.getElementById('bubble-spinner-char');
    if (bel) bel.textContent = spinnerFrames[bIdx];
  }, 80);
}
function stopBubbleSpinner() {
  if (bubbleSpinnerInterval) {
    clearInterval(bubbleSpinnerInterval);
    bubbleSpinnerInterval = null;
  }
  var bs = document.getElementById('bubble-spinner');
  if (bs) bs.style.display = 'none';
}

function setStreamingState(streaming) {
  isStreaming = streaming;
  if (streaming) {
    sendButton.style.display = 'none';
    stopButton.style.display = 'flex';
  } else {
    sendButton.style.display = 'flex';
    stopButton.style.display = 'none';
    sendButton.disabled = false;
  }
}

var commands = [
  { name: '/fix', icon: '<i class="codicon codicon-tools"></i>', desc: 'Fix bugs in the selected code' },
  { name: '/explain', icon: '<i class="codicon codicon-book"></i>', desc: 'Explain code in simple terms' },
  { name: '/refactor', icon: '<i class="codicon codicon-zap"></i>', desc: 'Improve code readability and performance' },
  { name: '/optimize', icon: '<i class="codicon codicon-rocket"></i>', desc: 'Optimize code for better performance' },
  { name: '/document', icon: '<i class="codicon codicon-edit"></i>', desc: 'Add documentation and comments' },
  { name: '/test', icon: '<i class="codicon codicon-beaker"></i>', desc: 'Generate unit tests' }
];

function sendMessage() {
  var message = messageInput.value.trim();
  if (!message && pendingImages.length === 0) return;
  var images = pendingImages.map(function(img) { return { base64: img.base64, media_type: img.media_type }; });
  vscode.postMessage({ type: 'sendMessage', value: message, images: images.length > 0 ? images : undefined });
  messageInput.value = '';
  messageInput.style.height = 'auto';
  clearAllImageChips();
}

sendButton.addEventListener('click', sendMessage);
stopButton.addEventListener('click', function() {
  vscode.postMessage({ type: 'stopStream' });
});
attachButton.addEventListener('click', function() {
  vscode.postMessage({ type: 'selectFile' });
});
modeSelect.addEventListener('change', function(e) {
  var mode = e.target.value;
  vscode.postMessage({ type: 'setMode', mode: mode });
  if ((mode === 'planner' || mode === 'agent') && currentPlan.length > 0) {
    planContainer.classList.add('active');
  } else if (mode !== 'planner' && mode !== 'agent') {
    planContainer.classList.remove('active');
  }
});
document.getElementById('run-agent-btn').addEventListener('click', function() {
  vscode.postMessage({ type: 'startAgent' });
});
document.getElementById('undo-btn').addEventListener('click', function() {
  vscode.postMessage({ type: 'undoLastTurn' });
});
document.getElementById('new-chat-btn').addEventListener('click', function() {
  vscode.postMessage({ type: 'newChat' });
});

/* ── History Popover ─────────────────────────────── */
var historyToggle = document.getElementById('history-toggle');
var historyPopover = document.getElementById('history-popover');
var historyList = document.getElementById('history-list');
var historyEmpty = document.getElementById('history-empty');
var clearHistoryBtn = document.getElementById('clear-history-btn');
var currentSessionId = null;
var skipDeleteConfirm = false;

/**
 * Show an inline confirmation dialog inside a container element.
 * @param {HTMLElement} container - Element to append the dialog to
 * @param {string} text - Warning message
 * @param {function} onConfirm - Called when user confirms
 */
function showConfirmDialog(container, text, onConfirm) {
  // Remove any existing dialog in this container first
  var existing = container.querySelector('.confirm-dialog');
  if (existing) existing.remove();

  var dialog = document.createElement('div');
  dialog.className = 'confirm-dialog';

  var msgEl = document.createElement('div');
  msgEl.className = 'confirm-dialog-text';
  msgEl.textContent = text;

  var checkLabel = document.createElement('label');
  checkLabel.className = 'confirm-dialog-check';
  var checkInput = document.createElement('input');
  checkInput.type = 'checkbox';
  checkLabel.appendChild(checkInput);
  checkLabel.appendChild(document.createTextNode(" Don't ask again"));

  var actions = document.createElement('div');
  actions.className = 'confirm-dialog-actions';

  var confirmBtn = document.createElement('button');
  confirmBtn.className = 'confirm-dialog-btn confirm-dialog-btn-danger';
  confirmBtn.textContent = 'Delete';
  confirmBtn.addEventListener('click', function() {
    if (checkInput.checked) {
      skipDeleteConfirm = true;
      // Persist to settings
      vscode.postMessage({ type: 'updateSettings', value: { 'general.confirmOnDelete': false } });
      setChecked('setting-confirmOnDelete', false);
    }
    dialog.remove();
    onConfirm();
  });

  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'confirm-dialog-btn confirm-dialog-btn-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', function() {
    dialog.remove();
  });

  actions.appendChild(confirmBtn);
  actions.appendChild(cancelBtn);
  dialog.appendChild(msgEl);
  dialog.appendChild(checkLabel);
  dialog.appendChild(actions);
  container.appendChild(dialog);
}

historyToggle.addEventListener('click', function(e) {
  e.stopPropagation();
  var isHidden = historyPopover.classList.contains('hidden');
  if (isHidden) {
    historyPopover.classList.remove('hidden');
    vscode.postMessage({ type: 'listSessions' });
  } else {
    historyPopover.classList.add('hidden');
  }
});

document.addEventListener('click', function(e) {
  if (!historyPopover.classList.contains('hidden') &&
      !e.target.closest('#history-popover') &&
      !e.target.closest('#history-toggle')) {
    historyPopover.classList.add('hidden');
  }
});

clearHistoryBtn.addEventListener('click', function(e) {
  e.stopPropagation();
  function doClear() {
    vscode.postMessage({ type: 'clearAllSessions' });
    historyList.innerHTML = '';
    historyEmpty.style.display = 'block';
  }
  if (skipDeleteConfirm) {
    doClear();
  } else {
    showConfirmDialog(historyPopover, 'Delete all chat history? This cannot be undone.', doClear);
  }
});

function renderSessionList(sessions, activeId) {
  currentSessionId = activeId;
  historyList.innerHTML = '';
  if (!sessions || sessions.length === 0) {
    historyEmpty.style.display = 'block';
    return;
  }
  historyEmpty.style.display = 'none';
  for (var i = 0; i < sessions.length; i++) {
    (function(session) {
      var li = document.createElement('li');
      li.className = 'history-item' + (session.id === activeId ? ' active' : '');

      var info = document.createElement('div');
      info.className = 'history-item-info';
      var name = document.createElement('div');
      name.className = 'history-item-name';
      name.textContent = session.name || 'Untitled';
      var date = document.createElement('div');
      date.className = 'history-item-date';
      date.textContent = formatRelativeDate(session.lastModified);
      info.appendChild(name);
      info.appendChild(date);

      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'history-item-delete';
      deleteBtn.innerHTML = '<i class="codicon codicon-close"></i>';
      deleteBtn.title = 'Delete';
      deleteBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        function doDelete() {
          vscode.postMessage({ type: 'deleteSession', value: session.id });
          li.remove();
          if (historyList.children.length === 0) {
            historyEmpty.style.display = 'block';
          }
        }
        if (skipDeleteConfirm) {
          doDelete();
        } else {
          showConfirmDialog(historyPopover, 'Delete "' + (session.name || 'Untitled') + '"?', doDelete);
        }
      });

      li.addEventListener('click', function() {
        vscode.postMessage({ type: 'loadSession', value: session.id });
        historyPopover.classList.add('hidden');
      });

      li.appendChild(info);
      li.appendChild(deleteBtn);
      historyList.appendChild(li);
    })(sessions[i]);
  }
}

function formatRelativeDate(timestamp) {
  if (!timestamp) return '';
  var now = Date.now();
  var diff = now - timestamp;
  var mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return mins + 'm ago';
  var hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  var days = Math.floor(hours / 24);
  if (days < 7) return days + 'd ago';
  return new Date(timestamp).toLocaleDateString();
}

/* ── Session Title Editing ───────────────────────── */
sessionTitle.addEventListener('dblclick', function() {
  sessionTitleInput.value = sessionTitle.textContent;
  sessionTitle.style.display = 'none';
  sessionTitleInput.style.display = 'inline-block';
  sessionTitleInput.focus();
  sessionTitleInput.select();
});
sessionTitleInput.addEventListener('blur', commitTitleEdit);
sessionTitleInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') { e.preventDefault(); commitTitleEdit(); }
  if (e.key === 'Escape') { cancelTitleEdit(); }
});
function commitTitleEdit() {
  var newTitle = sessionTitleInput.value.trim() || 'New Chat';
  sessionTitle.textContent = newTitle;
  sessionTitle.style.display = '';
  sessionTitleInput.style.display = 'none';
  vscode.postMessage({ type: 'updateSessionTitle', value: newTitle });
}
function cancelTitleEdit() {
  sessionTitle.style.display = '';
  sessionTitleInput.style.display = 'none';
}

/* ── Textarea Auto-resize & Input Handling ────────── */
messageInput.addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 150) + 'px';
  var value = this.value;
  if (value.startsWith('/') && value.length > 0) {
    showCommandHints(value);
  } else {
    hideCommandHints();
  }
});
messageInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    hideCommandHints();
    sendMessage();
  }
});
messageInput.addEventListener('blur', function() {
  setTimeout(function() { hideCommandHints(); }, 200);
});

function showCommandHints(input) {
  var searchTerm = input.toLowerCase();
  var filtered = commands.filter(function(cmd) { return cmd.name.startsWith(searchTerm); });
  if (filtered.length === 0) {
    hideCommandHints();
    return;
  }
  commandHints.innerHTML = filtered.map(function(cmd) {
    return '<div class="command-hint-item" data-command="' + cmd.name + '">' +
      '<div class="command-hint-name">' + cmd.icon + ' ' + cmd.name + '</div>' +
      '<div class="command-hint-desc">' + cmd.desc + '</div>' +
    '</div>';
  }).join('');
  commandHints.querySelectorAll('.command-hint-item').forEach(function(item) {
    item.addEventListener('click', function() {
      messageInput.value = item.dataset.command + ' ';
      messageInput.focus();
      hideCommandHints();
    });
  });
  commandHints.classList.add('active');
}
function hideCommandHints() {
  commandHints.classList.remove('active');
}

/* ── Drag & Drop ──────────────────────────────────── */
var dragCounter = 0;

/**
 * Parse a file:// URI into a local filesystem path.
 * Handles decoding and Windows drive-letter paths.
 */
function fileUriToPath(uri) {
  uri = uri.trim();
  if (!uri || uri.startsWith('#')) return null; // skip comments in uri-list
  try {
    // Use URL parser for reliable decoding
    var parsed = new URL(uri);
    if (parsed.protocol !== 'file:') return null;
    var p = decodeURIComponent(parsed.pathname);
    // Windows: /C:/foo → C:/foo
    if (/^\/[a-zA-Z]:/.test(p)) {
      p = p.substring(1);
    }
    return p;
  } catch (_) {
    // Not a valid URL — treat as a raw path
    return uri;
  }
}

/**
 * Extract file paths from a drop event.
 * Try 1: OS file manager drops (dataTransfer.files with .path)
 * Try 2: VS Code Explorer / text/uri-list (file:// URIs)
 */
function extractDroppedPaths(e) {
  var paths = [];

  // Try 1: Native file objects (OS file manager)
  var files = e.dataTransfer.files;
  if (files && files.length > 0) {
    for (var i = 0; i < files.length; i++) {
      if (files[i].path) {
        paths.push(files[i].path);
      }
    }
    if (paths.length > 0) return paths;
  }

  // Try 2: text/uri-list (VS Code Explorer, or URI drops)
  var uriList = e.dataTransfer.getData('text/uri-list');
  if (uriList) {
    var lines = uriList.split(/\r?\n/);
    for (var j = 0; j < lines.length; j++) {
      var p = fileUriToPath(lines[j]);
      if (p) paths.push(p);
    }
    if (paths.length > 0) return paths;
  }

  // Try 3: text/plain fallback (some drag sources)
  var plainText = e.dataTransfer.getData('text/plain');
  if (plainText) {
    var plines = plainText.split(/\r?\n/);
    for (var k = 0; k < plines.length; k++) {
      var pp = fileUriToPath(plines[k]);
      if (pp) paths.push(pp);
    }
  }

  return paths;
}

document.addEventListener('dragenter', function(e) {
  e.preventDefault();
  dragCounter++;
  if (dropZoneOverlay) dropZoneOverlay.classList.add('active');
});
document.addEventListener('dragover', function(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});
document.addEventListener('dragleave', function(e) {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    if (dropZoneOverlay) dropZoneOverlay.classList.remove('active');
  }
});
document.addEventListener('drop', function(e) {
  e.preventDefault();
  e.stopPropagation();
  dragCounter = 0;
  if (dropZoneOverlay) dropZoneOverlay.classList.remove('active');

  var paths = extractDroppedPaths(e);
  for (var i = 0; i < paths.length; i++) {
    var filePath = paths[i];
    var fileName = filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
    vscode.postMessage({ type: 'fileDropped', filePath: filePath, fileName: fileName });
  }
});

/* ── File & Image Chip Functions ──────────────────── */
var focusTrayEmpty = document.getElementById('focus-tray-empty');

function updateFocusTrayState() {
  if (focusTrayEmpty) {
    focusTrayEmpty.style.display = droppedFiles.size === 0 ? 'block' : 'none';
  }
}

function addFileChip(filePath, fileName) {
  if (droppedFiles.has(filePath)) return;
  droppedFiles.set(filePath, fileName);
  var chip = document.createElement('div');
  chip.className = 'file-chip';
  chip.dataset.filepath = filePath;
  chip.title = filePath;
  var nameSpan = document.createElement('span');
  nameSpan.className = 'file-chip-name';
  nameSpan.textContent = fileName;
  var removeBtn = document.createElement('span');
  removeBtn.className = 'file-chip-remove';
  removeBtn.innerHTML = '<i class="codicon codicon-close"></i>';
  removeBtn.addEventListener('click', function() {
    removeFileChip(filePath);
  });
  chip.appendChild(nameSpan);
  chip.appendChild(removeBtn);
  droppedFilesContainer.appendChild(chip);
  updateFocusTrayState();
}
function removeFileChip(filePath) {
  droppedFiles.delete(filePath);
  var chip = droppedFilesContainer.querySelector('[data-filepath="' + filePath + '"]');
  if (chip) chip.remove();
  vscode.postMessage({ type: 'removeFile', filePath: filePath });
  updateFocusTrayState();
}
function clearAllFileChips() {
  droppedFiles.clear();
  droppedFilesContainer.innerHTML = '';
  updateFocusTrayState();
}

/* ── Image Paste ──────────────────────────────────── */
messageInput.addEventListener('paste', function(e) {
  var items = e.clipboardData ? e.clipboardData.items : null;
  if (!items) return;
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      var blob = item.getAsFile();
      if (!blob) continue;
      var reader = new FileReader();
      reader.onload = function(ev) {
        var dataUrl = ev.target.result;
        var base64 = dataUrl.split(',')[1];
        var media_type = item.type;
        var id = Date.now() + '_' + Math.random().toString(36).slice(2);
        pendingImages.push({ id: id, base64: base64, media_type: media_type, dataUrl: dataUrl });
        addImageChip(id, dataUrl);
      };
      reader.readAsDataURL(blob);
      break;
    }
  }
});
function addImageChip(id, dataUrl) {
  var chip = document.createElement('div');
  chip.className = 'image-chip';
  chip.dataset.imageId = id;
  var img = document.createElement('img');
  img.src = dataUrl;
  img.alt = 'Pasted image';
  chip.appendChild(img);
  var removeBtn = document.createElement('span');
  removeBtn.className = 'image-chip-remove';
  removeBtn.innerHTML = '<i class="codicon codicon-close"></i>';
  removeBtn.addEventListener('click', function() { removeImageChip(id); });
  chip.appendChild(removeBtn);
  droppedFilesContainer.appendChild(chip);
}
function removeImageChip(id) {
  var idx = pendingImages.findIndex(function(img) { return img.id === id; });
  if (idx !== -1) pendingImages.splice(idx, 1);
  var chip = droppedFilesContainer.querySelector('[data-image-id="' + id + '"]');
  if (chip) chip.remove();
}
function clearAllImageChips() {
  pendingImages.length = 0;
  droppedFilesContainer.querySelectorAll('.image-chip').forEach(function(c) { c.remove(); });
}

/* ── Plan Rendering ───────────────────────────────── */
function renderPlan(tasks) {
  currentPlan = tasks;
  planTasksEl.innerHTML = '';
  if (!tasks || tasks.length === 0) {
    planContainer.classList.remove('active');
    return;
  }
  planContainer.classList.add('active');
  var done = tasks.filter(function(t) { return t.status === 'done'; }).length;
  planProgressEl.textContent = done + '/' + tasks.length + ' done';
  tasks.forEach(function(task) {
    var row = document.createElement('div');
    row.className = 'plan-task' + (task.status === 'done' ? ' done' : '') + (task.status === 'in_progress' ? ' in_progress' : '');
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'plan-task-checkbox';
    cb.checked = task.status === 'done';
    cb.addEventListener('change', function() {
      var newStatus = cb.checked ? 'done' : 'pending';
      vscode.postMessage({ type: 'updatePlanTask', value: { id: task.id, status: newStatus } });
    });
    var idSpan = document.createElement('span');
    idSpan.className = 'plan-task-id';
    idSpan.textContent = task.id + '.';
    var textSpan = document.createElement('span');
    textSpan.className = 'plan-task-text';
    textSpan.textContent = task.task;
    var statusSpan = document.createElement('span');
    statusSpan.className = 'plan-task-status ' + task.status;
    statusSpan.textContent = task.status;
    row.appendChild(cb);
    row.appendChild(idSpan);
    row.appendChild(textSpan);
    row.appendChild(statusSpan);
    planTasksEl.appendChild(row);
  });
}

/* ── Changes Rendering ────────────────────────────── */
function renderChanges(changes) {
  changesListEl.innerHTML = '';
  if (!changes || changes.length === 0) {
    changesContainer.classList.remove('active');
    return;
  }
  changesContainer.classList.add('active');
  changes.forEach(function(change) {
    var row = document.createElement('div');
    row.className = 'change-item';
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = change.selected !== false;
    cb.addEventListener('change', function() {
      vscode.postMessage({ type: 'toggleChangeSelection', filePath: change.filePath });
    });
    var nameSpan = document.createElement('span');
    nameSpan.textContent = change.fileName;
    nameSpan.style.flex = '1';
    nameSpan.style.cursor = 'pointer';
    nameSpan.addEventListener('click', function() {
      vscode.postMessage({ type: 'openChangeDiff', filePath: change.filePath });
    });
    var actionSpan = document.createElement('span');
    actionSpan.className = 'change-action ' + change.action;
    actionSpan.textContent = change.action;
    row.appendChild(cb);
    row.appendChild(nameSpan);
    row.appendChild(actionSpan);
    changesListEl.appendChild(row);
  });
}
document.getElementById('btn-accept-all').addEventListener('click', function() {
  vscode.postMessage({ type: 'acceptAllChanges' });
});
document.getElementById('btn-apply-selected').addEventListener('click', function() {
  vscode.postMessage({ type: 'applySelectedChanges' });
});
document.getElementById('btn-reject').addEventListener('click', function() {
  vscode.postMessage({ type: 'discardAllChanges' });
});

/* ── Request Initial Context ──────────────────────── */
vscode.postMessage({ type: 'requestContext' });

/* ── Streaming State ──────────────────────────────── */
var currentStreamingMessage = null;
var currentStreamingContent = null;
var currentMessageBuffer = '';
var renderPending = false;
var currentStreamMode = 'ask';
var agentParserState = 'idle';
var agentRawBuffer = '';
var agentContentBuffer = '';
var agentThinkingBodyEl = null;
var agentMessageEl = null;
var agentMessageBuffer = '';

/* ── Markdown Setup ───────────────────────────────── */
var md = window.markdownit({
  html: true,
  linkify: true,
  typographer: true,
  highlight: function(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return '<pre class="hljs"><code>' + hljs.highlight(str, { language: lang, ignoreIllegals: true }).value + '</code></pre>';
      } catch (__) {}
    }
    return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>';
  }
});

function renderStreamingMarkdown() {
  if (!currentStreamingContent || !currentMessageBuffer) return;
  var textToRender = currentMessageBuffer;
  var backtickCount = (textToRender.match(/```/g) || []).length;
  if (backtickCount % 2 !== 0) {
    textToRender += '\n```';
  }
  currentStreamingContent.innerHTML = md.render(textToRender);
  scrollToBottom();
  renderPending = false;
}

/* ── Message Handler ──────────────────────────────── */
window.addEventListener('message', function(event) {
  var message = event.data;
  switch (message.type) {
    case 'addMessage':
      addMessage(message.role, message.content, message.html);
      break;
    case 'startStream':
      startStreamingMessage(message.role, message.mode || 'ask');
      setStreamingState(true);
      break;
    case 'streamChunk':
      appendStreamChunk(message.content);
      break;
    case 'streamDone':
      finalizeStream(message.content, message.parsedContent);
      setStreamingState(false);
      break;
    case 'streamError':
      handleStreamError(message.content);
      setStreamingState(false);
      break;
    case 'setLoading':
      if (message.value) {
        setStreamingState(true);
      } else {
        setStreamingState(false);
      }
      break;
    case 'updateContext':
      updateContextDisplay(message.fileName, message.languageId);
      break;
    case 'contextCleared':
      chatContainer.innerHTML = '';
      planContainer.classList.remove('active');
      changesContainer.classList.remove('active');
      clearAllFileChips();
      clearAllImageChips();
      break;
    case 'fileAdded':
      addFileChip(message.filePath, message.fileName);
      break;
    case 'fileRemoved':
      droppedFiles.delete(message.filePath);
      var chipToRemove = droppedFilesContainer.querySelector('[data-filepath="' + message.filePath + '"]');
      if (chipToRemove) chipToRemove.remove();
      updateFocusTrayState();
      break;
    case 'updatePlan':
      renderPlan(message.plan);
      break;
    case 'updateChanges':
      renderChanges(message.changes);
      break;
    case 'undoComplete':
      var msgs = chatContainer.querySelectorAll('.message');
      if (msgs.length >= 2) {
        msgs[msgs.length - 1].remove();
        msgs[msgs.length - 2].remove();
      }
      break;
    case 'editComplete':
      var editMsgs = chatContainer.querySelectorAll('.message');
      if (editMsgs.length >= 2) {
        editMsgs[editMsgs.length - 1].remove();
        editMsgs[editMsgs.length - 2].remove();
      } else if (editMsgs.length === 1) {
        editMsgs[editMsgs.length - 1].remove();
      }
      if (message.value) {
        messageInput.value = message.value;
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + 'px';
        messageInput.focus();
      }
      break;
    case 'updateSessionTitle':
      sessionTitle.textContent = message.value || 'New Chat';
      break;
    case 'clearChat':
      chatContainer.innerHTML = '';
      sessionTitle.textContent = 'New Chat';
      planContainer.classList.remove('active');
      changesContainer.classList.remove('active');
      clearAllFileChips();
      clearAllImageChips();
      break;
    case 'loadSettings':
      renderSettings(message.settings || {});
      break;
    case 'applyTheme':
      applyTheme(message.theme);
      break;
    case 'indexStatus':
      updateIndexStatus(message.status);
      break;
    case 'sessionList':
      renderSessionList(message.sessions, message.activeId);
      break;
    case 'activeSessionId':
      currentSessionId = message.value;
      break;
    case 'agentWaitingForTool':
      showToolApproval(message.toolCall);
      break;
    case 'agentToolResult':
      showToolResult(message.result);
      break;
    case 'agentStateChanged':
      updateAgentState(message.state);
      break;
    case 'commandResult':
      handleCommandResult(message);
      break;
    case 'applyResult':
      handleApplyResult(message);
      break;
  }
});

function updateContextDisplay(fileName, languageId) {
  if (fileName && languageId) {
    contextText.textContent = fileName + ' (' + languageId + ')';
  } else {
    contextText.textContent = '';
  }
}

function updateIndexStatus(status) {
  var el = document.getElementById('index-status');
  if (!el) return;
  if (status === 'indexing') {
    el.textContent = 'Indexing...';
    el.className = 'index-status indexing';
  } else if (status === 'ready') {
    el.textContent = 'Indexed';
    el.className = 'index-status ready';
  } else {
    el.textContent = '';
    el.className = 'index-status';
  }
}

/* ── Agent Tool Approval ─────────────────────────── */
var agentState = 'IDLE';

function updateAgentState(state) {
  agentState = state;
}

function showToolApproval(toolCall) {
  if (!toolCall) return;
  var container = document.createElement('div');
  container.className = 'tool-approval';

  var label = document.createElement('div');
  label.className = 'tool-approval-label';
  label.textContent = toolCall.name === 'run_command'
    ? 'Run command?'
    : toolCall.name === 'write_file'
    ? 'Write file?'
    : 'Read file?';

  var detail = document.createElement('div');
  detail.className = 'tool-approval-detail';
  if (toolCall.name === 'run_command') {
    detail.textContent = '> ' + (toolCall.arguments.command || '');
  } else {
    detail.textContent = toolCall.arguments.file_path || '';
  }

  var actions = document.createElement('div');
  actions.className = 'tool-approval-actions';

  var approveBtn = document.createElement('button');
  approveBtn.className = 'tool-approval-btn tool-approval-btn-run';
  approveBtn.innerHTML = '<i class="codicon codicon-play"></i> Run';
  approveBtn.addEventListener('click', function() {
    vscode.postMessage({ type: 'approveToolExecution' });
    approveBtn.disabled = true;
    rejectBtn.disabled = true;
    approveBtn.textContent = 'Running...';
    container.classList.add('approved');
  });

  var rejectBtn = document.createElement('button');
  rejectBtn.className = 'tool-approval-btn tool-approval-btn-reject';
  rejectBtn.textContent = 'Reject';
  rejectBtn.addEventListener('click', function() {
    vscode.postMessage({ type: 'rejectToolExecution' });
    approveBtn.disabled = true;
    rejectBtn.disabled = true;
    rejectBtn.textContent = 'Rejected';
    container.classList.add('rejected');
  });

  actions.appendChild(approveBtn);
  actions.appendChild(rejectBtn);
  container.appendChild(label);
  container.appendChild(detail);
  container.appendChild(actions);
  chatContainer.appendChild(container);
  scrollToBottom();
}

function showToolResult(result) {
  if (!result) return;
  var container = document.createElement('div');
  container.className = 'tool-result ' + (result.status === 'success' ? 'success' : 'error');

  var header = document.createElement('div');
  header.className = 'tool-result-header';
  var statusText = document.createElement('span');
  statusText.textContent = result.status === 'success' ? 'Success' : 'Error';
  var logsBtn = document.createElement('button');
  logsBtn.className = 'tool-result-logs-btn';
  logsBtn.innerHTML = '<i class="codicon codicon-output"></i> Logs';
  logsBtn.title = 'Open Zero-G Console output';
  logsBtn.addEventListener('click', function() {
    vscode.postMessage({ type: 'showLogs' });
  });
  header.appendChild(statusText);
  header.appendChild(logsBtn);

  var output = document.createElement('pre');
  output.className = 'tool-result-output';
  var displayOutput = result.output || '(no output)';
  if (displayOutput.length > 500) {
    displayOutput = displayOutput.substring(0, 500) + '\n...(truncated)';
  }
  output.textContent = displayOutput;

  container.appendChild(header);
  container.appendChild(output);
  chatContainer.appendChild(container);
  scrollToBottom();
}

function handleCommandResult(message) {
  var output = message.output || '(no output)';
  if (output.length > 500) {
    output = output.substring(0, 500) + '\n...(truncated)';
  }
  var container = document.createElement('div');
  container.className = 'tool-result ' + (message.success ? 'success' : 'error');
  var header = document.createElement('div');
  header.className = 'tool-result-header';
  var statusText = document.createElement('span');
  statusText.textContent = (message.success ? 'Success' : 'Error') + ' (exit ' + message.exitCode + ')';
  var logsBtn = document.createElement('button');
  logsBtn.className = 'tool-result-logs-btn';
  logsBtn.innerHTML = '<i class="codicon codicon-output"></i> Logs';
  logsBtn.title = 'Open Zero-G Console output';
  logsBtn.addEventListener('click', function() {
    vscode.postMessage({ type: 'showLogs' });
  });
  header.appendChild(statusText);
  header.appendChild(logsBtn);
  var pre = document.createElement('pre');
  pre.className = 'tool-result-output';
  pre.textContent = output;
  container.appendChild(header);
  container.appendChild(pre);
  chatContainer.appendChild(container);
  scrollToBottom();

  // Update any Run buttons that match this command
  var widgets = chatContainer.querySelectorAll('.tool-call-widget');
  widgets.forEach(function(w) {
    var cmdDiv = w.querySelector('.tool-call-command');
    if (cmdDiv && cmdDiv.textContent === '> ' + message.command) {
      var btn = w.querySelector('.tool-call-btn-run');
      if (btn && btn.textContent === 'Running...') {
        btn.textContent = message.success ? 'Done' : 'Failed';
        btn.disabled = true;
      }
    }
  });
}

function handleApplyResult(message) {
  // Update Apply buttons matching the file path
  var cards = chatContainer.querySelectorAll('.file-change-card');
  cards.forEach(function(card) {
    var nameEl = card.querySelector('.file-change-name');
    if (nameEl && nameEl.textContent === message.filePath) {
      var applyBtn = card.querySelectorAll('.file-change-btn-diff')[1]; // second btn is Apply
      if (applyBtn && applyBtn.textContent === 'Applying...') {
        applyBtn.textContent = message.success ? 'Applied' : 'Failed';
        applyBtn.disabled = true;
        if (message.success) {
          card.style.opacity = '0.6';
        }
      }
    }
  });
}

/* ── Streaming Functions ──────────────────────────── */
function startStreamingMessage(role, mode) {
  currentMessageBuffer = '';
  currentStreamMode = mode || 'ask';
  agentParserState = 'idle';
  agentRawBuffer = '';
  agentContentBuffer = '';
  agentThinkingBodyEl = null;
  agentMessageEl = null;
  agentMessageBuffer = '';
  var messageDiv = document.createElement('div');
  messageDiv.className = 'message ' + role;
  var bubbleDiv = document.createElement('div');
  bubbleDiv.className = 'message-bubble';
  var headerDiv = document.createElement('div');
  headerDiv.className = 'message-header';
  headerDiv.textContent = role === 'user' ? 'You' : 'Zero-G AI';
  var contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  var bubbleSpinner = document.createElement('div');
  bubbleSpinner.className = 'bubble-spinner';
  bubbleSpinner.id = 'bubble-spinner';
  bubbleSpinner.innerHTML = '<span class="spinner-char" id="bubble-spinner-char"></span> Generating...';
  contentDiv.appendChild(bubbleSpinner);
  bubbleDiv.appendChild(headerDiv);
  bubbleDiv.appendChild(contentDiv);
  messageDiv.appendChild(bubbleDiv);
  chatContainer.appendChild(messageDiv);
  currentStreamingMessage = messageDiv;
  currentStreamingContent = contentDiv;
  scrollToBottom();
  startBubbleSpinner();
}

function appendStreamChunk(chunk) {
  if (!currentStreamingContent) return;
  stopBubbleSpinner();
  currentMessageBuffer += chunk;
  if (currentStreamMode === 'agent') {
    appendAgentChunk(chunk);
    return;
  }
  if (!renderPending) {
    renderPending = true;
    requestAnimationFrame(renderStreamingMarkdown);
  }
}

function appendAgentChunk(chunk) {
  agentRawBuffer += chunk;
  processAgentBuffer();
}

function processAgentBuffer() {
  while (agentRawBuffer.length > 0) {
    if (agentParserState === 'idle') {
      var openIdx = agentRawBuffer.indexOf('<');
      if (openIdx === -1) { agentRawBuffer = ''; return; }
      agentRawBuffer = agentRawBuffer.substring(openIdx);
      var closeIdx = agentRawBuffer.indexOf('>');
      if (closeIdx === -1) { return; }
      var tagContent = agentRawBuffer.substring(1, closeIdx).trim();
      agentRawBuffer = agentRawBuffer.substring(closeIdx + 1);
      if (tagContent === 'thinking') {
        agentParserState = 'thinking';
        agentContentBuffer = '';
        var acc = createThinkingAccordion();
        currentStreamingContent.appendChild(acc);
        agentThinkingBodyEl = acc.querySelector('.thinking-body');
      } else if (tagContent === 'tool_call') {
        agentParserState = 'tool_call';
        agentContentBuffer = '';
      } else if (tagContent === 'message') {
        agentParserState = 'message';
        agentContentBuffer = '';
        agentMessageBuffer = '';
        agentMessageEl = document.createElement('div');
        agentMessageEl.className = 'agent-message-content';
        currentStreamingContent.appendChild(agentMessageEl);
      }
    } else {
      var closingTag = '</' + agentParserState + '>';
      var cIdx = agentRawBuffer.indexOf(closingTag);
      if (cIdx === -1) {
        var safeContent = agentRawBuffer;
        var holdBack = '';
        for (var pLen = closingTag.length - 1; pLen >= 1; pLen--) {
          if (agentRawBuffer.length >= pLen && agentRawBuffer.endsWith(closingTag.substring(0, pLen))) {
            safeContent = agentRawBuffer.substring(0, agentRawBuffer.length - pLen);
            holdBack = agentRawBuffer.substring(agentRawBuffer.length - pLen);
            break;
          }
        }
        if (safeContent.length > 0) {
          agentContentBuffer += safeContent;
          renderAgentContent(agentParserState, safeContent);
        }
        agentRawBuffer = holdBack;
        return;
      } else {
        var content = agentRawBuffer.substring(0, cIdx);
        if (content.length > 0) {
          agentContentBuffer += content;
          renderAgentContent(agentParserState, content);
        }
        finalizeAgentTag(agentParserState, agentContentBuffer);
        agentRawBuffer = agentRawBuffer.substring(cIdx + closingTag.length);
        agentParserState = 'idle';
        agentContentBuffer = '';
      }
    }
  }
}

function renderAgentContent(state, newContent) {
  if (!currentStreamingContent) return;
  if (state === 'thinking' && agentThinkingBodyEl) {
    agentThinkingBodyEl.textContent += newContent;
  } else if (state === 'message' && agentMessageEl) {
    agentMessageBuffer += newContent;
    if (!renderPending) {
      renderPending = true;
      requestAnimationFrame(function() {
        var text = agentMessageBuffer;
        var bCount = (text.match(/```/g) || []).length;
        if (bCount % 2 !== 0) text += '\n```';
        agentMessageEl.innerHTML = md.render(text);
        renderPending = false;
        scrollToBottom();
      });
    }
  }
  scrollToBottom();
}

function finalizeAgentTag(state, fullContent) {
  if (!currentStreamingContent) return;
  if (state === 'thinking') {
    agentThinkingBodyEl = null;
  } else if (state === 'message' && agentMessageEl) {
    agentMessageEl.innerHTML = md.render(fullContent);
    enhanceCodeBlocks(agentMessageEl);
    agentMessageEl = null;
    agentMessageBuffer = '';
  } else if (state === 'tool_call') {
    try {
      var tc = JSON.parse(fullContent.trim());
      if (tc.name === 'write_file') {
        var card = createFileChangeCard(tc);
        currentStreamingContent.appendChild(card);
      } else if (tc.name === 'run_command') {
        var widget = createToolCallWidget(tc);
        currentStreamingContent.appendChild(widget);
      }
    } catch (e) {
      console.error('Failed to parse agent tool call:', e);
    }
  }
  scrollToBottom();
}

/* ── Widget Factories ─────────────────────────────── */
function createThinkingAccordion() {
  var accordion = document.createElement('div');
  accordion.className = 'thinking-accordion';
  var toggle = document.createElement('div');
  toggle.className = 'thinking-toggle';
  toggle.innerHTML = '<i class="codicon codicon-chevron-right thinking-arrow"></i> Thinking...';
  toggle.addEventListener('click', function() {
    accordion.classList.toggle('open');
  });
  var body = document.createElement('div');
  body.className = 'thinking-body';
  accordion.appendChild(toggle);
  accordion.appendChild(body);
  return accordion;
}

function createFileChangeCard(toolCall) {
  var filePath = toolCall.arguments ? toolCall.arguments.file_path : 'unknown';
  if (!filePath) filePath = 'unknown';
  var fileName = filePath.split('/').pop() || filePath;
  var card = document.createElement('div');
  card.className = 'file-change-card';
  var header = document.createElement('div');
  header.className = 'file-change-header';
  var nameSpan = document.createElement('span');
  nameSpan.className = 'file-change-name';
  nameSpan.textContent = filePath;
  nameSpan.title = filePath;
  var badge = document.createElement('span');
  badge.className = 'file-change-badge';
  badge.textContent = 'WRITE';
  header.appendChild(nameSpan);
  header.appendChild(badge);
  var actions = document.createElement('div');
  actions.className = 'file-change-actions';
  var diffBtn = document.createElement('button');
  diffBtn.className = 'file-change-btn-diff';
  diffBtn.textContent = 'Show Diff';
  diffBtn.addEventListener('click', function() {
    vscode.postMessage({ type: 'openChangeDiff', filePath: filePath });
  });
  var applyBtn = document.createElement('button');
  applyBtn.className = 'file-change-btn-diff';
  applyBtn.textContent = 'Apply';
  applyBtn.addEventListener('click', function() {
    vscode.postMessage({ type: 'applyFileChange', filePath: filePath, value: (toolCall.arguments ? toolCall.arguments.content : '') || '' });
    applyBtn.textContent = 'Applying...';
    applyBtn.disabled = true;
  });
  var rejectBtn = document.createElement('button');
  rejectBtn.className = 'file-change-btn-reject';
  rejectBtn.textContent = 'Reject';
  rejectBtn.addEventListener('click', function() {
    // Replace actions with inline reason input
    actions.style.display = 'none';
    var reasonRow = document.createElement('div');
    reasonRow.className = 'reject-reason-row';
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'reject-reason-input';
    input.placeholder = 'Reason (optional)';
    var sendBtn = document.createElement('button');
    sendBtn.className = 'reject-reason-btn';
    sendBtn.textContent = 'Send';
    var skipBtn = document.createElement('button');
    skipBtn.className = 'reject-reason-btn';
    skipBtn.textContent = 'Skip';

    function submitReject(reason) {
      vscode.postMessage({ type: 'rejectFileChange', filePath: filePath, fileName: fileName, value: reason || '' });
      reasonRow.remove();
      actions.style.display = '';
      card.style.opacity = '0.5';
      rejectBtn.disabled = true;
      rejectBtn.textContent = 'Rejected';
    }

    sendBtn.addEventListener('click', function() { submitReject(input.value.trim()); });
    skipBtn.addEventListener('click', function() { submitReject(''); });
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); submitReject(input.value.trim()); }
      if (e.key === 'Escape') { reasonRow.remove(); actions.style.display = ''; }
    });

    reasonRow.appendChild(input);
    reasonRow.appendChild(sendBtn);
    reasonRow.appendChild(skipBtn);
    card.appendChild(reasonRow);
    input.focus();
  });
  actions.appendChild(diffBtn);
  actions.appendChild(applyBtn);
  actions.appendChild(rejectBtn);
  card.appendChild(header);
  card.appendChild(actions);
  return card;
}

function createToolCallWidget(toolCall) {
  var widget = document.createElement('div');
  widget.className = 'tool-call-widget';
  var header = document.createElement('div');
  header.className = 'tool-call-header';
  header.innerHTML = '<i class="codicon codicon-terminal"></i> Command';
  var commandDiv = document.createElement('div');
  commandDiv.className = 'tool-call-command';
  var command = (toolCall.arguments ? toolCall.arguments.command : null) || JSON.stringify(toolCall.arguments);
  commandDiv.textContent = '> ' + command;
  var actionsDiv = document.createElement('div');
  actionsDiv.className = 'tool-call-actions';
  var runBtn = document.createElement('button');
  runBtn.className = 'tool-call-btn tool-call-btn-run';
  runBtn.innerHTML = '<i class="codicon codicon-play"></i> Run';
  runBtn.addEventListener('click', function() {
    vscode.postMessage({ type: 'runCommand', value: command });
    runBtn.textContent = 'Running...';
    runBtn.disabled = true;
  });
  var copyBtn = document.createElement('button');
  copyBtn.className = 'tool-call-btn tool-call-btn-copy';
  copyBtn.textContent = 'Copy';
  copyBtn.addEventListener('click', function() {
    vscode.postMessage({ type: 'copyCode', value: command });
    copyBtn.textContent = 'Copied!';
    setTimeout(function() { copyBtn.textContent = 'Copy'; }, 2000);
  });
  actionsDiv.appendChild(runBtn);
  actionsDiv.appendChild(copyBtn);
  widget.appendChild(header);
  widget.appendChild(commandDiv);
  widget.appendChild(actionsDiv);
  return widget;
}

/* ── Finalize & Error Handling ─────────────────────── */
function finalizeStream(renderedHtml, parsedContent) {
  if (!currentStreamingContent) return;
  // Remove spinner element completely
  var bs = document.getElementById('bubble-spinner');
  if (bs) bs.remove();
  if (currentStreamMode === 'agent') {
    if (agentRawBuffer.length > 0 && agentParserState !== 'idle') {
      agentContentBuffer += agentRawBuffer;
      finalizeAgentTag(agentParserState, agentContentBuffer);
    }
    agentParserState = 'idle';
    agentRawBuffer = '';
    agentContentBuffer = '';
    agentThinkingBodyEl = null;
    agentMessageEl = null;
    agentMessageBuffer = '';
  } else if (parsedContent && parsedContent.segments) {
    currentStreamingContent.innerHTML = '';
    var container = currentStreamingContent;
    parsedContent.segments.forEach(function(segment) {
      if (segment.type === 'text') {
        var textDiv = document.createElement('div');
        textDiv.innerHTML = segment.content;
        container.appendChild(textDiv);
      } else if (segment.type === 'tool_call' && segment.toolCall) {
        var toolWidget = createToolCallWidget(segment.toolCall);
        container.appendChild(toolWidget);
      }
    });
    enhanceCodeBlocks(container);
  } else if (renderedHtml) {
    currentStreamingContent.innerHTML = renderedHtml;
    enhanceCodeBlocks(currentStreamingContent);
  }
  currentStreamingMessage = null;
  currentStreamingContent = null;
  scrollToBottom();
}

function handleStreamError(errorMessage) {
  stopBubbleSpinner();
  if (currentStreamingContent) {
    currentStreamingContent.textContent = errorMessage;
  } else {
    addMessage('assistant', errorMessage, false);
  }
  currentStreamingMessage = null;
  currentStreamingContent = null;
}

/* ── System Notice Detection ─────────────────────────── */
var systemNoticePrefixes = [
  'Agent: Starting task',
  'Task #',
  'All plan tasks completed',
  'User rejected',
  'Applied changes',
  'Command executed'
];

function isSystemNotice(content) {
  if (!content || typeof content !== 'string') return false;
  for (var i = 0; i < systemNoticePrefixes.length; i++) {
    if (content.startsWith(systemNoticePrefixes[i])) return true;
  }
  return false;
}

/* ── Add Static Message ───────────────────────────── */
function addMessage(role, content, isHtml) {
  // Render system notices as lightweight divs instead of full bubbles
  if (!isHtml && isSystemNotice(content)) {
    var notice = document.createElement('div');
    notice.className = 'system-notice';
    notice.textContent = content;
    chatContainer.appendChild(notice);
    scrollToBottom();
    return;
  }

  var messageDiv = document.createElement('div');
  messageDiv.className = 'message ' + role;
  var bubbleDiv = document.createElement('div');
  bubbleDiv.className = 'message-bubble';
  var headerDiv = document.createElement('div');
  headerDiv.className = 'message-header';
  headerDiv.textContent = role === 'user' ? 'You' : 'Zero-G AI';
  var contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  if (role === 'user') {
    chatContainer.querySelectorAll('.edit-message-btn').forEach(function(btn) { btn.remove(); });
    var editBtn = document.createElement('button');
    editBtn.className = 'edit-message-btn';
    editBtn.title = 'Edit message';
    editBtn.innerHTML = '<i class="codicon codicon-edit"></i>';
    editBtn.addEventListener('click', function() {
      var msgText = contentDiv.textContent || '';
      messageInput.value = msgText;
      messageInput.style.height = 'auto';
      messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + 'px';
      messageInput.focus();
      vscode.postMessage({ type: 'editLastMessage', value: msgText });
    });
    headerDiv.appendChild(editBtn);
  }
  if (isHtml) {
    contentDiv.innerHTML = content;
    enhanceCodeBlocks(contentDiv);
  } else {
    contentDiv.textContent = content;
  }
  bubbleDiv.appendChild(headerDiv);
  bubbleDiv.appendChild(contentDiv);
  messageDiv.appendChild(bubbleDiv);
  chatContainer.appendChild(messageDiv);
  scrollToBottom();
}

/* ── Settings Overlay ───────────────────────────────── */

/* ── Theme Engine ──────────────────────────────────── */
function applyTheme(themeName) {
  var validThemes = ['system', 'zerog-dark', 'midnight', 'matrix', 'latte'];
  if (validThemes.indexOf(themeName) === -1) themeName = 'system';
  document.body.setAttribute('data-theme', themeName);
}

var settingsOverlay = document.getElementById('settings-overlay');
var settingsDefaults = {
  'ui.theme': 'system',
  'general.mode': 'ask',
  'general.language': 'auto',
  'general.enableAutocomplete': true,
  'general.confirmOnDelete': true,
  'connection.provider': 'antigravity',
  'connection.baseUrl': 'http://localhost:8080',
  'connection.apiKey': 'test',
  'connection.model': 'claude-opus-4-6-thinking',
  'agent.allowTerminal': false,
  'agent.autoApplyDiff': false,
  'agent.maxIterations': 5,
  'advanced.temperature': 0.7,
  'advanced.systemPrompt': '',
  'advanced.contextLimit': 4096,
  'advanced.debugMode': false
};

/* Field → setting key lookup (id without "setting-" prefix → data-key) */
var settingFieldMap = {
  theme: 'ui.theme',
  mode: 'general.mode',
  language: 'general.language',
  enableAutocomplete: 'general.enableAutocomplete',
  confirmOnDelete: 'general.confirmOnDelete',
  provider: 'connection.provider',
  baseUrl: 'connection.baseUrl',
  apiKey: 'connection.apiKey',
  model: 'connection.model',
  allowTerminal: 'agent.allowTerminal',
  autoApplyDiff: 'agent.autoApplyDiff',
  maxIterations: 'agent.maxIterations',
  temperature: 'advanced.temperature',
  systemPrompt: 'advanced.systemPrompt',
  contextLimit: 'advanced.contextLimit',
  debugMode: 'advanced.debugMode'
};

function openSettings() {
  settingsOverlay.classList.add('active');
  vscode.postMessage({ type: 'getSettings' });
}

function closeSettings() {
  settingsOverlay.classList.remove('active');
}

function renderSettings(s) {
  // UI
  setVal('setting-theme', s.theme, 'system');
  // General
  setVal('setting-mode', s.mode, 'ask');
  setVal('setting-language', s.language, 'auto');
  setChecked('setting-enableAutocomplete', s.enableAutocomplete !== false);
  setChecked('setting-confirmOnDelete', s.confirmOnDelete !== false);
  skipDeleteConfirm = s.confirmOnDelete === false;
  // Connection
  setVal('setting-provider', s.provider, 'antigravity');
  setVal('setting-baseUrl', s.baseUrl, '');
  setVal('setting-apiKey', s.apiKey, '');
  setVal('setting-model', s.model, 'claude-opus-4-6-thinking');
  // Agent
  setChecked('setting-allowTerminal', !!s.allowTerminal);
  setChecked('setting-autoApplyDiff', !!s.autoApplyDiff);
  setVal('setting-maxIterations', s.maxIterations, 5);
  // Advanced
  setVal('setting-temperature', s.temperature != null ? s.temperature : 0.7);
  setVal('setting-systemPrompt', s.systemPrompt, '');
  setVal('setting-contextLimit', s.contextLimit, 4096);
  setChecked('setting-debugMode', !!s.debugMode);
  if (s.version) {
    document.getElementById('settings-version').textContent = 'Zero-G v' + s.version;
  }
}

function setVal(id, value, fallback) {
  var el = document.getElementById(id);
  if (el) el.value = value != null ? value : (fallback != null ? fallback : '');
}
function setChecked(id, value) {
  var el = document.getElementById(id);
  if (el) el.checked = value;
}

function gatherSettings() {
  var data = {};
  // Gather text/number/select inputs
  settingsOverlay.querySelectorAll('.so-input, .so-select, .so-textarea').forEach(function(el) {
    var key = el.dataset.key;
    if (!key) return;
    if (el.type === 'number') {
      data[key] = Number(el.value);
    } else {
      data[key] = el.value;
    }
  });
  // Gather checkboxes
  settingsOverlay.querySelectorAll('input[type="checkbox"]').forEach(function(el) {
    var key = el.dataset.key;
    if (!key) return;
    data[key] = el.checked;
  });
  return data;
}

function saveSettings() {
  var data = gatherSettings();
  vscode.postMessage({ type: 'updateSettings', value: data });
  closeSettings();
}

function resetToDefaults() {
  renderSettings({
    theme: settingsDefaults['ui.theme'],
    mode: settingsDefaults['general.mode'],
    language: settingsDefaults['general.language'],
    enableAutocomplete: settingsDefaults['general.enableAutocomplete'],
    confirmOnDelete: settingsDefaults['general.confirmOnDelete'],
    provider: settingsDefaults['connection.provider'],
    baseUrl: settingsDefaults['connection.baseUrl'],
    apiKey: settingsDefaults['connection.apiKey'],
    model: settingsDefaults['connection.model'],
    allowTerminal: settingsDefaults['agent.allowTerminal'],
    autoApplyDiff: settingsDefaults['agent.autoApplyDiff'],
    maxIterations: settingsDefaults['agent.maxIterations'],
    temperature: settingsDefaults['advanced.temperature'],
    systemPrompt: settingsDefaults['advanced.systemPrompt'],
    contextLimit: settingsDefaults['advanced.contextLimit'],
    debugMode: settingsDefaults['advanced.debugMode']
  });
}

/* Tab Switcher */
document.getElementById('so-tabs').addEventListener('click', function(e) {
  var tab = e.target.closest('.so-tab');
  if (!tab) return;
  var tabName = tab.dataset.tab;
  // Deactivate all tabs and panes
  document.querySelectorAll('.so-tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.so-pane').forEach(function(p) { p.classList.remove('active'); });
  // Activate clicked tab and matching pane
  tab.classList.add('active');
  var pane = document.querySelector('.so-pane[data-pane="' + tabName + '"]');
  if (pane) pane.classList.add('active');
});

/* Button handlers */
document.getElementById('so-close-btn').addEventListener('click', closeSettings);
document.getElementById('so-save-btn').addEventListener('click', saveSettings);
document.getElementById('so-reset-btn').addEventListener('click', resetToDefaults);
document.getElementById('settings-btn').addEventListener('click', function() {
  openSettings();
});
document.getElementById('settings-open-advanced').addEventListener('click', function() {
  vscode.postMessage({ type: 'openAdvancedSettings' });
});

/* Live preview: apply theme immediately when dropdown changes */
document.getElementById('setting-theme').addEventListener('change', function(e) {
  applyTheme(e.target.value);
});

/* ── Code Block Enhancement ────────────────────────── */
function enhanceCodeBlocks(container) {
  var codeBlocks = container.querySelectorAll('pre.hljs');
  codeBlocks.forEach(function(pre) {
    var code = pre.querySelector('code');
    if (!code) return;
    var codeText = code.textContent;
    var codeLanguage = code.className.match(/language-(\w+)/);
    codeLanguage = codeLanguage ? codeLanguage[1] : '';
    var isShellCommand = ['bash', 'sh', 'shell', 'zsh', 'fish', 'powershell', 'cmd'].indexOf(codeLanguage.toLowerCase()) !== -1;
    var actionsDiv = document.createElement('div');
    actionsDiv.className = 'code-actions';
    var copyBtn = document.createElement('button');
    copyBtn.className = 'code-action-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', function() {
      vscode.postMessage({ type: 'copyCode', value: codeText });
      copyBtn.textContent = 'Copied!';
      setTimeout(function() { copyBtn.textContent = 'Copy'; }, 2000);
    });
    if (isShellCommand) {
      var runBtn = document.createElement('button');
      runBtn.className = 'code-action-btn code-action-btn-run';
      runBtn.innerHTML = '<i class="codicon codicon-play"></i> Run';
      runBtn.addEventListener('click', function() {
        vscode.postMessage({ type: 'runTerminalCommand', value: codeText });
      });
      actionsDiv.appendChild(copyBtn);
      actionsDiv.appendChild(runBtn);
    } else {
      var applyBtn = document.createElement('button');
      applyBtn.className = 'code-action-btn';
      applyBtn.textContent = 'Apply';
      applyBtn.addEventListener('mouseenter', function() {
        vscode.postMessage({ type: 'previewCode', code: codeText });
      });
      applyBtn.addEventListener('mouseleave', function() {
        vscode.postMessage({ type: 'clearPreview' });
      });
      applyBtn.addEventListener('click', function() {
        vscode.postMessage({ type: 'applyCode', value: codeText });
      });
      actionsDiv.appendChild(copyBtn);
      actionsDiv.appendChild(applyBtn);
    }
    pre.insertBefore(actionsDiv, pre.firstChild);
  });
}
