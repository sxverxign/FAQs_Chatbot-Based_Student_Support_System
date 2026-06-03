/* ============================================================
   chat_bot.js — Frontend Application Logic
   Chatbot-Based Student Support System
   ============================================================
   This file controls the entire client-side behaviour:
     - Login / logout flow
     - Sending messages to the server
     - Displaying messages and responses
     - Managing chat history (save, load, delete)
     - Sidebar toggle for mobile
     - Auto-resizing textarea
     - Confirmation modal

   Architecture:
     All state is kept in the `App` object.
     Functions are grouped by feature area.
   ============================================================ */

'use strict';

// ============================================================
// SERVER URL — change this if your server runs on a different port
// ============================================================
const SERVER_URL = 'http://localhost:3000';

// ============================================================
// APP STATE — single object holds all runtime state
// ============================================================
const App = {
  currentUser   : null,     // { username, fullName, department, level }
  currentChatId : null,     // unique ID string for the active chat session
  currentMessages: [],      // array of { role, text, time } for active chat
  allHistory    : [],       // array of history summary objects from server
  isLoading     : false,    // true while waiting for server response
  confirmCallback: null,    // callback function for modal confirm button
};

// ============================================================
// DOM ELEMENT REFERENCES
// We grab all elements once at startup for performance
// ============================================================
const DOM = {
  // --- Login ---
  loginScreen    : document.getElementById('loginScreen'),
  loginForm      : document.getElementById('loginForm'),
  usernameInput  : document.getElementById('usernameInput'),
  passwordInput  : document.getElementById('passwordInput'),
  togglePassword : document.getElementById('togglePassword'),
  loginError     : document.getElementById('loginError'),
  loginBtn       : document.getElementById('loginBtn'),
  loginBtnText   : document.getElementById('loginBtnText'),
  loginSpinner   : document.getElementById('loginSpinner'),

  // --- Chat App ---
  chatApp        : document.getElementById('chatApp'),

  // --- Sidebar ---
  sidebar        : document.getElementById('sidebar'),
  sidebarOverlay : document.getElementById('sidebarOverlay'),
  closeSidebarBtn: document.getElementById('closeSidebarBtn'),
  menuBtn        : document.getElementById('menuBtn'),
  newChatBtn     : document.getElementById('newChatBtn'),
  historySearch  : document.getElementById('historySearch'),
  historyList    : document.getElementById('historyList'),
  sidebarUserName: document.getElementById('sidebarUserName'),
  sidebarUserDept: document.getElementById('sidebarUserDept'),
  userAvatar     : document.getElementById('userAvatar'),
  logoutBtn      : document.getElementById('logoutBtn'),

  // --- Chat Main ---
  chatTitle        : document.getElementById('chatTitle'),
  messagesContainer: document.getElementById('messagesContainer'),
  welcomeMessage   : document.getElementById('welcomeMessage'),
  messageInput     : document.getElementById('messageInput'),
  sendBtn          : document.getElementById('sendBtn'),
  deleteChatBtn    : document.getElementById('deleteChatBtn'),
  clearAllBtn      : document.getElementById('clearAllBtn'),

  // --- Modal ---
  confirmModal   : document.getElementById('confirmModal'),
  modalTitle     : document.getElementById('modalTitle'),
  modalBody      : document.getElementById('modalBody'),
  modalCancelBtn : document.getElementById('modalCancelBtn'),
  modalConfirmBtn: document.getElementById('modalConfirmBtn'),
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Generates a unique chat session ID based on timestamp + random number.
 * Example: "chat_1715000000000_4821"
 */
function generateChatId() {
  return `chat_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

/**
 * Formats a Date object to a human-readable time string.
 * Example: "2:35 PM"
 */
function formatTime(date) {
  return new Date(date).toLocaleTimeString([], {
    hour  : '2-digit',
    minute: '2-digit',
  });
}

/**
 * Formats a Date object to a short date string for sidebar.
 * Example: "Jan 5"
 */
function formatShortDate(dateStr) {
  const date = new Date(dateStr);
  const now  = new Date();

  // If today, show time only
  if (date.toDateString() === now.toDateString()) {
    return formatTime(date);
  }

  // Otherwise show month + day
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * Safely escapes HTML characters to prevent XSS injection.
 * Any user input displayed in the DOM must go through this.
 */
function escapeHTML(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

/**
 * Converts plain text with newlines into HTML with <br> tags.
 * Used for displaying bot answers that may contain line breaks.
 */
function textToHTML(str) {
  return escapeHTML(str).replace(/\n/g, '<br>');
}

/**
 * Generates a title for a new chat session based on the first message.
 * Truncates to 40 characters.
 */
function generateChatTitle(firstMessage) {
  if (!firstMessage) return 'New Chat';
  const trimmed = firstMessage.trim();
  return trimmed.length > 40
    ? trimmed.substring(0, 37) + '...'
    : trimmed;
}

/**
 * Scrolls the messages container to the bottom smoothly.
 */
function scrollToBottom() {
  const container = DOM.messagesContainer;
  container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
}

// ============================================================
// MODAL — Confirmation Dialog
// ============================================================

/**
 * Shows the confirmation modal with a custom title, message, and callback.
 * @param {string}   title    - Modal heading
 * @param {string}   message  - Modal body text
 * @param {Function} callback - Called if user clicks "Confirm"
 */
function showModal(title, message, callback) {
  DOM.modalTitle.textContent  = title;
  DOM.modalBody.textContent   = message;
  App.confirmCallback          = callback;
  DOM.confirmModal.classList.remove('hidden');
}

/** Hides the confirmation modal without triggering the callback. */
function hideModal() {
  DOM.confirmModal.classList.add('hidden');
  App.confirmCallback = null;
}

// Modal button events
DOM.modalCancelBtn.addEventListener('click', hideModal);

DOM.modalConfirmBtn.addEventListener('click', () => {
  if (typeof App.confirmCallback === 'function') {
    App.confirmCallback();
  }
  hideModal();
});

// Close modal when clicking the backdrop
DOM.confirmModal.addEventListener('click', (e) => {
  if (e.target === DOM.confirmModal) hideModal();
});

// ============================================================
// LOGIN — Authentication
// ============================================================

/**
 * Shows an error message inside the login form.
 * @param {string} message - Error text to display
 */
function showLoginError(message) {
  DOM.loginError.textContent = message;
  DOM.loginError.classList.add('visible');
  DOM.loginError.style.display = 'block';
}

/** Clears the login error message. */
function clearLoginError() {
  DOM.loginError.textContent = '';
  DOM.loginError.classList.remove('visible');
  DOM.loginError.style.display = 'none';
}

/**
 * Sets the login button to a loading state (shows spinner, disables button).
 */
function setLoginLoading(isLoading) {
  if (isLoading) {
    DOM.loginBtn.disabled        = true;
    DOM.loginBtnText.textContent = 'Logging in…';
    DOM.loginSpinner.classList.remove('hidden');
  } else {
    DOM.loginBtn.disabled        = false;
    DOM.loginBtnText.textContent = 'Login';
    DOM.loginSpinner.classList.add('hidden');
  }
}

/**
 * Handles the login form submission.
 * Sends username + password to /api/login, handles response.
 */
async function handleLogin(event) {
  // Prevent the form from actually submitting (which would reload the page)
  event.preventDefault();

  clearLoginError();

  const username = DOM.usernameInput.value.trim();
  const password = DOM.passwordInput.value.trim();

  // Basic client-side validation before making a server request
  if (!username) {
    showLoginError('Please enter your username.');
    DOM.usernameInput.focus();
    return;
  }

  if (!password) {
    showLoginError('Please enter your password.');
    DOM.passwordInput.focus();
    return;
  }

  // Show loading state
  setLoginLoading(true);

  try {
    // Send credentials to the Node.js server
    const response = await fetch(`${SERVER_URL}/api/login`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (data.success) {
      // ---- Login successful ----
      App.currentUser = data.user;

      // Save session to localStorage so user stays logged in on page refresh
      localStorage.setItem('chatbot_user', JSON.stringify(data.user));

      // Update UI and switch to chat interface
      initChatUI();
    } else {
      // ---- Login failed ----
      showLoginError(data.message || 'Login failed. Please check your credentials.');
    }

  } catch (error) {
    // Network error (server not running, no internet, etc.)
    console.error('[LOGIN] Network error:', error);
    showLoginError(
      'Could not connect to the server. Please make sure the server is running.'
    );
  } finally {
    // Always restore button to normal state
    setLoginLoading(false);
  }
}

// Attach login form submit handler
DOM.loginForm.addEventListener('submit', handleLogin);

// Toggle password visibility
DOM.togglePassword.addEventListener('click', () => {
  const isPassword = DOM.passwordInput.type === 'password';
  DOM.passwordInput.type    = isPassword ? 'text' : 'password';
  DOM.togglePassword.textContent = isPassword ? '🙈' : '👁';
});

// ============================================================
// SESSION — Persist and restore login
// ============================================================

/**
 * Checks if a user session exists in localStorage.
 * If yes, auto-logs in. If no, shows login screen.
 */
function checkExistingSession() {
  try {
    const stored = localStorage.getItem('chatbot_user');
    if (stored) {
      const user = JSON.parse(stored);
      if (user && user.username) {
        App.currentUser = user;
        initChatUI();
        return;
      }
    }
  } catch {
    // If parsing fails, clear the corrupted data
    localStorage.removeItem('chatbot_user');
  }

  // No valid session — show login screen
  showLoginScreen();
}

/** Shows the login screen and hides the chat app. */
function showLoginScreen() {
  DOM.loginScreen.classList.remove('hidden');
  DOM.chatApp.classList.add('hidden');
  DOM.loginForm.reset();
  clearLoginError();
  DOM.usernameInput.focus();
}

/** Logs out the current user and returns to the login screen. */
function logout() {
  showModal(
    'Logout',
    'Are you sure you want to logout?',
    () => {
      // Clear session
      App.currentUser    = null;
      App.currentChatId  = null;
      App.currentMessages = [];
      App.allHistory     = [];

      localStorage.removeItem('chatbot_user');

      showLoginScreen();
    }
  );
}

DOM.logoutBtn.addEventListener('click', logout);

// ============================================================
// CHAT UI — Initialise after successful login
// ============================================================

/**
 * Sets up the chat interface after a user logs in.
 * Populates user info in sidebar, loads history.
 */
function initChatUI() {
  const user = App.currentUser;
  if (!user) return;

  // Switch screens
  DOM.loginScreen.classList.add('hidden');
  DOM.chatApp.classList.remove('hidden');

  // Set user info in sidebar
  DOM.sidebarUserName.textContent = user.fullName  || user.username;
  DOM.sidebarUserDept.textContent = user.department || '';
  DOM.userAvatar.textContent = (user.fullName || user.username)
    .charAt(0)
    .toUpperCase();

  // Start a fresh chat session
  startNewChat();

  // Load chat history from server
  loadHistory();

  // Focus the input field for immediate typing
  DOM.messageInput.focus();
}

// ============================================================
// CHAT — Start a new chat session
// ============================================================

/**
 * Resets the chat area and begins a new empty conversation.
 */
function startNewChat() {
  // Generate a new unique session ID
  App.currentChatId   = generateChatId();
  App.currentMessages = [];

  // Reset UI
  DOM.messagesContainer.innerHTML = '';
  DOM.messagesContainer.appendChild(DOM.welcomeMessage);
  DOM.welcomeMessage.style.display = 'flex';
  DOM.chatTitle.textContent = 'Student Support Chatbot';

  // Deactivate any active history item in sidebar
  document
    .querySelectorAll('.history-item.active')
    .forEach(el => el.classList.remove('active'));

  // Focus input
  DOM.messageInput.value = '';
  updateSendButton();
  DOM.messageInput.focus();

  // Close sidebar on mobile after new chat
  closeSidebar();
}

DOM.newChatBtn.addEventListener('click', startNewChat);

// ============================================================
// MESSAGES — Render message bubbles
// ============================================================

/**
 * Appends a message bubble to the chat area.
 * @param {string} role   - 'user' | 'bot' | 'error'
 * @param {string} text   - Message content
 * @param {string} time   - Time string (optional, defaults to now)
 * @param {string} matched - The FAQ question matched (optional, for bot messages)
 * @returns {HTMLElement} The created message row element
 */
function appendMessage(role, text, time, matched) {
  // Hide welcome message as soon as first message appears
  DOM.welcomeMessage.style.display = 'none';

  const timeStr = time || formatTime(new Date());

  // Determine avatar content
  let avatarContent;
  if (role === 'user') {
    avatarContent = (App.currentUser?.fullName || App.currentUser?.username || 'U')
      .charAt(0)
      .toUpperCase();
  } else {
    avatarContent = '🤖';
  }

  // Build the message row HTML
  const row = document.createElement('div');
  row.classList.add('message-row', role === 'error' ? 'bot error' : role);

  row.innerHTML = `
    <div class="message-avatar">${avatarContent}</div>
    <div>
      <div class="message-bubble">
        ${role === 'user' ? escapeHTML(text) : textToHTML(text)}
        ${matched ? `<div class="matched-label">📌 Related to: ${escapeHTML(matched)}</div>` : ''}
      </div>
      <div class="message-time">${escapeHTML(timeStr)}</div>
    </div>
  `;

  DOM.messagesContainer.appendChild(row);
  scrollToBottom();
  return row;
}

/**
 * Shows a typing indicator (animated dots) while waiting for a bot response.
 * @returns {HTMLElement} The indicator element (so it can be removed later)
 */
function showTypingIndicator() {
  const row = document.createElement('div');
  row.classList.add('message-row', 'bot');
  row.id = 'typingIndicator';

  row.innerHTML = `
    <div class="message-avatar">🤖</div>
    <div>
      <div class="message-bubble">
        <div class="typing-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>
  `;

  DOM.messagesContainer.appendChild(row);
  scrollToBottom();
  return row;
}

/** Removes the typing indicator from the DOM. */
function removeTypingIndicator() {
  const indicator = document.getElementById('typingIndicator');
  if (indicator) indicator.remove();
}

// ============================================================
// MESSAGES — Send a question to the server
// ============================================================

/**
 * Sends the user's typed question to the server and displays the response.
 */
async function sendMessage() {
  // Don't send if already loading
  if (App.isLoading) return;

  const question = DOM.messageInput.value.trim();

  // Don't send empty messages
  if (!question) return;

  // Mark as loading
  App.isLoading = true;
  DOM.sendBtn.disabled = true;

  // Clear the input field and reset its height
  DOM.messageInput.value = '';
  DOM.messageInput.style.height = 'auto';

  const now = formatTime(new Date());

  // 1. Display user message immediately
  appendMessage('user', question, now);

  // 2. Save to current session messages
  App.currentMessages.push({ role: 'user', text: question, time: now });

  // 3. Show typing indicator
  showTypingIndicator();

  try {
    // 4. Send question to server
    const response = await fetch(`${SERVER_URL}/api/chat`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({
        question: question,
        username: App.currentUser?.username || 'guest',
      }),
    });

    const data = await response.json();

    // 5. Remove typing indicator
    removeTypingIndicator();

    const botTime = formatTime(new Date());

    if (response.ok) {
      // 6. Display bot response
      appendMessage('bot', data.answer, botTime, data.matched || null);

      // 7. Save bot response to current session
      App.currentMessages.push({
        role   : 'bot',
        text   : data.answer,
        time   : botTime,
        matched: data.matched || null,
      });
    } else {
      // Server returned an error (4xx, 5xx)
      const errorMsg = data.answer || 'An unexpected error occurred. Please try again.';
      appendMessage('error', errorMsg, botTime);
      App.currentMessages.push({ role: 'error', text: errorMsg, time: botTime });
    }

  } catch (error) {
    // Network error or server is offline
    console.error('[CHAT] Fetch error:', error);
    removeTypingIndicator();

    const errorMsg = 'I cannot connect to the server right now. Please check that the server is running and try again.';
    appendMessage('error', errorMsg, formatTime(new Date()));
    App.currentMessages.push({ role: 'error', text: errorMsg, time: formatTime(new Date()) });
  } finally {
    // Always reset loading state
    App.isLoading = false;
    updateSendButton();
    DOM.messageInput.focus();

    // 8. Auto-save the conversation after each exchange
    await saveChatHistory();
  }
}

// ============================================================
// SEND BUTTON — Input controls
// ============================================================

/**
 * Updates the send button enabled/disabled state based on input content.
 */
function updateSendButton() {
  const hasText = DOM.messageInput.value.trim().length > 0;
  DOM.sendBtn.disabled = !hasText || App.isLoading;
}

// Listen for typing in the textarea
DOM.messageInput.addEventListener('input', () => {
  updateSendButton();
  autoResizeTextarea();
});

// Send on Enter key (but not Shift+Enter, which adds a new line)
DOM.messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();          // prevent newline
    if (!DOM.sendBtn.disabled) {
      sendMessage();
    }
  }
});

// Send button click
DOM.sendBtn.addEventListener('click', sendMessage);

/**
 * Auto-resizes the textarea to fit its content (up to max-height set in CSS).
 */
function autoResizeTextarea() {
  const el = DOM.messageInput;
  el.style.height = 'auto';           // shrink first
  el.style.height = el.scrollHeight + 'px'; // then expand to fit
}

// ============================================================
// EXAMPLE BUTTONS — Clickable question chips in welcome message
// ============================================================

// Add click handlers for all example question buttons
DOM.messagesContainer.addEventListener('click', (e) => {
  const btn = e.target.closest('.example-btn');
  if (btn) {
    const question = btn.getAttribute('data-question');
    if (question) {
      DOM.messageInput.value = question;
      updateSendButton();
      autoResizeTextarea();
      DOM.messageInput.focus();
      sendMessage();
    }
  }
});

// ============================================================
// CHAT HISTORY — Save to server
// ============================================================

/**
 * Saves the current chat session to the server (chat_history.json).
 * Called automatically after each message exchange.
 */
async function saveChatHistory() {
  // Don't save if there are no messages or no user
  if (!App.currentMessages.length || !App.currentUser) return;

  // Generate a title from the first user message
  const firstUserMsg = App.currentMessages.find(m => m.role === 'user');
  const title = generateChatTitle(firstUserMsg?.text || 'Chat');

  try {
    await fetch(`${SERVER_URL}/api/history/save`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({
        chatId  : App.currentChatId,
        username: App.currentUser.username,
        title   : title,
        messages: App.currentMessages,
      }),
    });

    // Refresh the sidebar history list (don't await — background operation)
    loadHistory();

  } catch (error) {
    // Non-critical: history save failed, but chat still works
    console.warn('[HISTORY] Could not save chat history:', error.message);
  }
}

// ============================================================
// CHAT HISTORY — Load from server (populate sidebar)
// ============================================================

/**
 * Fetches the user's chat history from the server and populates the sidebar.
 */
async function loadHistory() {
  if (!App.currentUser) return;

  try {
    const response = await fetch(
      `${SERVER_URL}/api/history?username=${encodeURIComponent(App.currentUser.username)}`
    );

    const data = await response.json();

    if (data.success) {
      App.allHistory = data.history || [];
      renderHistoryList(App.allHistory);
    }

  } catch (error) {
    console.warn('[HISTORY] Could not load history:', error.message);
    // Show empty state — non-critical failure
    renderHistoryList([]);
  }
}

/**
 * Renders the history list in the sidebar.
 * @param {Array} historyItems - Array of history summary objects
 */
function renderHistoryList(historyItems) {
  DOM.historyList.innerHTML = '';   // clear existing items

  if (!historyItems.length) {
    DOM.historyList.innerHTML = '<li class="history-empty-msg">No conversations yet.</li>';
    return;
  }

  historyItems.forEach(item => {
    const li = document.createElement('li');
    li.classList.add('history-item');
    li.setAttribute('data-id', item.chatId);
    li.setAttribute('role', 'button');
    li.setAttribute('tabindex', '0');

    // Mark as active if it's the current chat
    if (item.chatId === App.currentChatId) {
      li.classList.add('active');
    }

    li.innerHTML = `
      <span class="history-item-title" title="${escapeHTML(item.title)}">
        ${escapeHTML(item.title)}
      </span>
      <span class="history-item-time">${formatShortDate(item.updatedAt || item.createdAt)}</span>
      <button
        class="history-delete-btn"
        data-id="${escapeHTML(item.chatId)}"
        title="Delete this chat"
        aria-label="Delete chat: ${escapeHTML(item.title)}"
      >🗑</button>
    `;

    // Click the row to load this chat
    li.addEventListener('click', (e) => {
      // If the delete button was clicked, don't load the chat
      if (e.target.closest('.history-delete-btn')) return;
      loadChat(item.chatId);
    });

    // Keyboard accessibility (Enter / Space to activate)
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (e.target.closest('.history-delete-btn')) return;
        loadChat(item.chatId);
      }
    });

    // Delete button inside this history item
    const deleteBtn = li.querySelector('.history-delete-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();         // prevent loading the chat
      deleteSingleChat(item.chatId, item.title);
    });

    DOM.historyList.appendChild(li);
  });
}

// ============================================================
// CHAT HISTORY — Load a specific past chat
// ============================================================

/**
 * Loads a specific chat session from the server and displays it in the chat area.
 * @param {string} chatId - The unique ID of the chat session to load
 */
async function loadChat(chatId) {
  if (!App.currentUser) return;

  try {
    const response = await fetch(
      `${SERVER_URL}/api/history/${encodeURIComponent(chatId)}?username=${encodeURIComponent(App.currentUser.username)}`
    );

    const data = await response.json();

    if (!data.success || !data.chat) {
      console.warn('[HISTORY] Could not load chat:', chatId);
      return;
    }

    const chat = data.chat;

    // Set current session to the loaded chat
    App.currentChatId   = chat.chatId;
    App.currentMessages = chat.messages || [];

    // Update UI title
    DOM.chatTitle.textContent = chat.title || 'Chat';

    // Clear messages area and re-render all messages
    DOM.messagesContainer.innerHTML = '';
    DOM.welcomeMessage.style.display = 'none';

    chat.messages.forEach(msg => {
      appendMessage(msg.role, msg.text, msg.time, msg.matched || null);
    });

    // Mark active in sidebar
    document
      .querySelectorAll('.history-item')
      .forEach(el => el.classList.toggle('active', el.getAttribute('data-id') === chatId));

    // Close sidebar on mobile
    closeSidebar();

    // Focus input
    DOM.messageInput.focus();

  } catch (error) {
    console.error('[HISTORY] Error loading chat:', error.message);
  }
}

// ============================================================
// CHAT HISTORY — Delete operations
// ============================================================

/**
 * Deletes a single chat session.
 * @param {string} chatId - Chat ID to delete
 * @param {string} title  - Chat title (for the confirmation message)
 */
function deleteSingleChat(chatId, title) {
  showModal(
    'Delete Chat',
    `Delete "${title}"? This cannot be undone.`,
    async () => {
      try {
        const response = await fetch(
          `${SERVER_URL}/api/history/${encodeURIComponent(chatId)}?username=${encodeURIComponent(App.currentUser.username)}`,
          { method: 'DELETE' }
        );

        const data = await response.json();

        if (data.success) {
          // If the deleted chat was the active one, start a new chat
          if (App.currentChatId === chatId) {
            startNewChat();
          }
          // Refresh sidebar
          loadHistory();
        } else {
          alert('Could not delete chat. Please try again.');
        }

      } catch (error) {
        console.error('[HISTORY] Delete error:', error.message);
        alert('Network error. Could not delete chat.');
      }
    }
  );
}

/**
 * Deletes ALL chat history for the current user.
 */
function deleteAllChats() {
  showModal(
    'Clear All History',
    'This will permanently delete all your conversations. Are you sure?',
    async () => {
      try {
        const response = await fetch(
          `${SERVER_URL}/api/history/all?username=${encodeURIComponent(App.currentUser.username)}`,
          { method: 'DELETE' }
        );

        const data = await response.json();

        if (data.success) {
          App.allHistory = [];
          renderHistoryList([]);
          startNewChat();
        } else {
          alert('Could not clear history. Please try again.');
        }

      } catch (error) {
        console.error('[HISTORY] Clear all error:', error.message);
        alert('Network error. Could not clear history.');
      }
    }
  );
}

/**
 * Deletes the currently active chat session.
 */
function deleteCurrentChat() {
  if (!App.currentChatId || !App.currentMessages.length) {
    // Nothing to delete
    return;
  }

  const firstMsg = App.currentMessages.find(m => m.role === 'user');
  const title    = generateChatTitle(firstMsg?.text || 'this chat');
  deleteSingleChat(App.currentChatId, title);
}

// Attach delete / clear button handlers
DOM.deleteChatBtn.addEventListener('click', deleteCurrentChat);
DOM.clearAllBtn.addEventListener('click', deleteAllChats);

// ============================================================
// SIDEBAR SEARCH — Filter history items
// ============================================================

DOM.historySearch.addEventListener('input', (e) => {
  const query = e.target.value.trim().toLowerCase();

  // If empty, re-render full history
  if (!query) {
    renderHistoryList(App.allHistory);
    return;
  }

  // Filter by title or preview text
  const filtered = App.allHistory.filter(item =>
    item.title.toLowerCase().includes(query) ||
    (item.preview && item.preview.toLowerCase().includes(query))
  );

  renderHistoryList(filtered);
});

// ============================================================
// SIDEBAR — Mobile toggle
// ============================================================

/** Opens the sidebar (mobile only). */
function openSidebar() {
  DOM.sidebar.classList.add('open');
  DOM.sidebarOverlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';   // prevent background scroll
}

/** Closes the sidebar (mobile only). */
function closeSidebar() {
  DOM.sidebar.classList.remove('open');
  DOM.sidebarOverlay.classList.add('hidden');
  document.body.style.overflow = '';
}

DOM.menuBtn.addEventListener('click', openSidebar);
DOM.closeSidebarBtn.addEventListener('click', closeSidebar);
DOM.sidebarOverlay.addEventListener('click', closeSidebar);

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================

document.addEventListener('keydown', (e) => {
  // Escape — close modal or sidebar
  if (e.key === 'Escape') {
    hideModal();
    closeSidebar();
  }

  // Ctrl+N or Cmd+N — new chat (when chat app is visible)
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    if (!DOM.chatApp.classList.contains('hidden')) {
      e.preventDefault();
      startNewChat();
    }
  }
});

// ============================================================
// WINDOW RESIZE — Handle sidebar state changes
// ============================================================

window.addEventListener('resize', () => {
  // If screen becomes large enough for sidebar, reset mobile state
  if (window.innerWidth > 640) {
    DOM.sidebar.classList.remove('open');
    DOM.sidebarOverlay.classList.add('hidden');
    document.body.style.overflow = '';
  }
});

// ============================================================
// APP STARTUP
// ============================================================

/**
 * Entry point — called once when the page loads.
 * Checks for an existing session and sets up the initial view.
 */
function init() {
  console.log('[APP] Student Support Chatbot initialising…');
  checkExistingSession();
}

// Run on DOM ready
init();