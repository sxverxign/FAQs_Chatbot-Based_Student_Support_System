// ============================================================
// chatbot_server.js — Node.js HTTP Server
// Chatbot-Based Student Support System
// ============================================================
// This file creates the backend server using Node.js built-in
// modules only. It handles:
//   - User authentication
//   - FAQ searching with keyword + intent matching
//   - Chat history save, load, and delete
//   - Static file serving (HTML, CSS, JS, assets)
// ============================================================

// ---- Built-in Node.js Modules (no npm install needed) ------
const http = require('http');       // Core HTTP server
const fs   = require('fs');         // File system read/write
const path = require('path');       // Safe file path building
const url  = require('url');        // URL parsing

// ============================================================
// CONFIGURATION — change these values to fit your setup
// ============================================================
const CONFIG = {
  PORT           : process.env.PORT || 3000,
  HOST           : '0.0.0.0',
  FAQ_FILE       : path.join(__dirname, 'chatbot_faq.json'),
  HISTORY_FILE   : path.join(__dirname, 'chat_history.json'),
  USERS_FILE     : path.join(__dirname, 'users.json'),
  STATIC_DIR     : __dirname,
  MATCH_THRESHOLD: 0.15,
};

// ============================================================
// UTILITY — safe JSON file reader
// Returns parsed data or a fallback value on failure
// ============================================================
function readJSONFile(filePath, fallback) {
  try {
    // Read file synchronously — simple and suitable for small JSON files
    const raw = fs.readFileSync(filePath, 'utf8');

    // Handle empty files gracefully
    if (!raw || raw.trim() === '') return fallback;

    return JSON.parse(raw);
  } catch (error) {
    // File missing, unreadable, or invalid JSON
    console.error(`[ERROR] Could not read file: ${filePath}`, error.message);
    return fallback;
  }
}

// ============================================================
// UTILITY — safe JSON file writer
// Returns true on success, false on failure
// ============================================================
function writeJSONFile(filePath, data) {
  try {
    // Write with 2-space indentation so the file stays human-readable
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`[ERROR] Could not write file: ${filePath}`, error.message);
    return false;
  }
}

// ============================================================
// UTILITY — send a JSON response back to the client
// ============================================================
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type' : 'application/json',
    // Allow requests from any origin (important for local development)
    'Access-Control-Allow-Origin' : '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

// ============================================================
// UTILITY — serve a static file (HTML, CSS, JS, images, etc.)
// ============================================================
function serveStaticFile(res, filePath) {
  // Map file extensions to MIME types so the browser handles them correctly
  const mimeTypes = {
    '.html': 'text/html',
    '.css' : 'text/css',
    '.js'  : 'application/javascript',
    '.json': 'application/json',
    '.png' : 'image/png',
    '.jpg' : 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif' : 'image/gif',
    '.svg' : 'image/svg+xml',
    '.ico' : 'image/x-icon',
    '.ttf' : 'font/ttf',
    '.woff': 'font/woff',
  };

  const ext      = path.extname(filePath).toLowerCase();
  const mimeType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // File not found — send 404
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 — File Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(data);
  });
}

// ============================================================
// NLP CORE — Text preprocessing
// Cleans and tokenises a raw string for matching
// ============================================================
function preprocessText(text) {
  if (!text || typeof text !== 'string') return [];

  // Common English stop words to ignore during matching
  const stopWords = new Set([
    'i','me','my','the','a','an','is','are','was','were','be','been','being',
    'have','has','had','do','does','did','will','would','could','should','may',
    'might','shall','can','need','dare','ought','used','to','of','in','on',
    'at','by','for','with','about','against','between','into','through',
    'during','before','after','above','below','up','down','out','off','over',
    'under','again','further','then','once','here','there','when','where',
    'why','how','all','both','each','more','most','other','some','such','no',
    'nor','not','only','same','so','than','too','very','just','it','its',
    'this','that','these','those','and','but','or','if','as','what','which',
    'who','whom','this','that','am','get','go','also','please','help','tell',
    'know','want','like','would','dear',
  ]);

  return text
    .toLowerCase()                       // make everything lowercase
    .replace(/[^a-z0-9\s]/g, ' ')        // remove punctuation
    .split(/\s+/)                         // split on whitespace
    .filter(word => word.length > 1 && !stopWords.has(word));  // remove stop words
}

// ============================================================
// NLP CORE — Synonym / intent expansion map
// Maps common student phrases to standard keywords
// ============================================================
const SYNONYM_MAP = {
  // Registration-related
  'sign up'       : 'register',
  'enroll'        : 'register',
  'enrolment'     : 'registration',
  'signup'        : 'register',
  'add'           : 'register',
  'taking'        : 'register',
  'subjects'      : 'courses',
  'units'         : 'courses',
  'classes'       : 'courses',

  // Grade-related
  'marks'         : 'grade',
  'score'         : 'grade',
  'scoring'       : 'grade',
  'scored'        : 'grade',
  'fail'          : 'failed',
  'failing'       : 'failed',
  'pass'          : 'passed',
  'retake'        : 'carryover',
  'redo'          : 'carryover',
  'repeat'        : 'carryover',
  'supplementary' : 'carryover',
  'average'       : 'gpa',
  'points'        : 'gpa',
  'cumulative'    : 'cgpa',

  // Payment-related
  'tuition'       : 'fees',
  'pay'           : 'payment',
  'paying'        : 'payment',
  'paid'          : 'payment',
  'cost'          : 'fees',
  'amount'        : 'fees',
  'money'         : 'fees',

  // Dress code-related
  'wear'          : 'dress',
  'wearing'       : 'dress',
  'outfit'        : 'dress',
  'clothes'       : 'dress',
  'clothing'      : 'dress',
  'attire'        : 'dress',
  'slippers'      : 'slippers',
  'flip'          : 'slippers',
  'flops'         : 'slippers',
  'sandals'       : 'footwear',

  // Portal-related
  'website'       : 'portal',
  'online'        : 'portal',
  'login'         : 'portal',
  'account'       : 'portal',
  'log in'        : 'portal',

  // Result-related
  'transcript'    : 'result',
  'grades'        : 'result',
  'check'         : 'result',
  'view'          : 'result',

  // Library-related
  'books'         : 'library',
  'borrow'        : 'library',

  // Health-related
  'sick'          : 'health',
  'doctor'        : 'health',
  'nurse'         : 'health',
  'hospital'      : 'health',
  'clinic'        : 'health',

  // Project-related
  'thesis'        : 'project',
  'dissertation'  : 'project',
  'fyp'           : 'project',
  'research'      : 'project',
};

// ============================================================
// NLP CORE — Expand tokens using synonym map
// ============================================================
function expandWithSynonyms(tokens) {
  const expanded = new Set(tokens);

  tokens.forEach(token => {
    if (SYNONYM_MAP[token]) {
      expanded.add(SYNONYM_MAP[token]);
    }
  });

  return Array.from(expanded);
}

// ============================================================
// NLP CORE — Score a single FAQ entry against user query tokens
// Returns a score between 0 and 1
// ============================================================
function scoreFAQEntry(faqEntry, queryTokens) {
  if (!faqEntry || !queryTokens.length) return 0;

  // Combine the FAQ's keywords and question into one searchable text block
  const faqKeywords  = faqEntry.keywords || [];
  const faqQuestion  = preprocessText(faqEntry.question);
  const faqAnswer    = preprocessText(faqEntry.answer);

  // Build a combined set of all FAQ words (keywords get higher weight)
  const allFaqWords = [
    ...faqKeywords,          // exact keywords — highest weight (×3)
    ...faqQuestion,          // words from the FAQ question text — weight ×2
    ...faqAnswer.slice(0, 20), // first 20 words from answer — weight ×1
  ];

  let matchCount    = 0;
  let weightedScore = 0;

  queryTokens.forEach(token => {
    // Check keyword match (exact) — very strong signal
    if (faqKeywords.includes(token)) {
      weightedScore += 3;
      matchCount++;
      return;
    }

    // Check partial keyword match — moderate signal
    if (faqKeywords.some(kw => kw.includes(token) || token.includes(kw))) {
      weightedScore += 2;
      matchCount++;
      return;
    }

    // Check question text match — moderate signal
    if (faqQuestion.includes(token)) {
      weightedScore += 2;
      matchCount++;
      return;
    }

    // Check answer text match — weak signal
    if (faqAnswer.includes(token)) {
      weightedScore += 1;
      matchCount++;
    }
  });

  if (matchCount === 0) return 0;

  // Normalise: divide weighted score by maximum possible score
  const maxPossibleScore = queryTokens.length * 3;
  return weightedScore / maxPossibleScore;
}

// ============================================================
// NLP CORE — Find the best matching FAQ for a given question
// Returns { answer, confidence, question } or null
// ============================================================
function findBestFAQMatch(userQuestion, faqData) {
  if (!userQuestion || !faqData || !faqData.length) return null;

  // Step 1: Preprocess and expand the user's query
  const rawTokens   = preprocessText(userQuestion);
  const queryTokens = expandWithSynonyms(rawTokens);

  console.log(`[NLP] Query tokens: [${queryTokens.join(', ')}]`);

  if (!queryTokens.length) return null;

  // Step 2: Score every FAQ entry
  let bestMatch = null;
  let bestScore = 0;

  faqData.forEach(entry => {
    const score = scoreFAQEntry(entry, queryTokens);

    // Log every entry score for debugging
    console.log(`[NLP] FAQ #${entry.id} score: ${score.toFixed(3)} — "${entry.question}"`);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  });

  // Step 3: Only return a result if the score meets the minimum threshold
  if (bestScore >= CONFIG.MATCH_THRESHOLD && bestMatch) {
    console.log(`[NLP] Best match (score=${bestScore.toFixed(3)}): "${bestMatch.question}"`);
    return {
      answer    : bestMatch.answer,
      question  : bestMatch.question,
      confidence: Math.round(bestScore * 100),
    };
  }

  console.log(`[NLP] No match above threshold (best score: ${bestScore.toFixed(3)})`);
  return null;
}

// ============================================================
// ROUTE HANDLER — POST /api/login
// Authenticates a student against users.json
// ============================================================
function handleLogin(req, res, body) {
  let data;

  // Parse the incoming JSON body safely
  try {
    data = JSON.parse(body);
  } catch {
    return sendJSON(res, 400, { success: false, message: 'Invalid request format.' });
  }

  const { username, password } = data;

  // Basic input validation
  if (!username || !password) {
    return sendJSON(res, 400, {
      success: false,
      message: 'Username and password are required.',
    });
  }

  // Sanitise inputs — trim whitespace, convert username to lowercase
  const cleanUsername = String(username).trim().toLowerCase();
  const cleanPassword = String(password).trim();

  // Load users from JSON file
  const users = readJSONFile(CONFIG.USERS_FILE, []);

  if (!users.length) {
    return sendJSON(res, 500, {
      success: false,
      message: 'User database unavailable. Please contact support.',
    });
  }

  // Find matching user (case-insensitive username)
  const matchedUser = users.find(
    user =>
      user.username.toLowerCase() === cleanUsername &&
      user.password === cleanPassword
  );

  if (matchedUser) {
    // Login successful — return user info (never return the password)
    console.log(`[AUTH] Login successful: ${matchedUser.username}`);
    sendJSON(res, 200, {
      success   : true,
      message   : 'Login successful.',
      user      : {
        username  : matchedUser.username,
        fullName  : matchedUser.fullName,
        department: matchedUser.department,
        level     : matchedUser.level,
      },
    });
  } else {
    // Login failed
    console.log(`[AUTH] Login failed for username: "${cleanUsername}"`);
    sendJSON(res, 401, {
      success: false,
      message: 'Invalid username or password. Please try again.',
    });
  }
}

// ============================================================
// ROUTE HANDLER — POST /api/chat
// Receives a question, searches FAQ, returns an answer
// ============================================================
function handleChat(req, res, body) {
  let data;

  try {
    data = JSON.parse(body);
  } catch {
    return sendJSON(res, 400, {
      success: false,
      answer : 'I could not understand your request. Please try again.',
    });
  }

  const { question, username } = data;

  // Validate input
  if (!question || typeof question !== 'string' || question.trim() === '') {
    return sendJSON(res, 400, {
      success: false,
      answer : 'Please type a question before sending.',
    });
  }

  const cleanQuestion = question.trim();

  // Guard against very long inputs (spam protection)
  if (cleanQuestion.length > 500) {
    return sendJSON(res, 400, {
      success: false,
      answer : 'Your question is too long. Please keep it under 500 characters.',
    });
  }

  console.log(`[CHAT] User "${username || 'unknown'}" asked: "${cleanQuestion}"`);

  // Load FAQ data
  const faqData = readJSONFile(CONFIG.FAQ_FILE, []);

  if (!faqData.length) {
    return sendJSON(res, 500, {
      success: false,
      answer : 'The knowledge base is currently unavailable. Please try again later.',
    });
  }

  // Run NLP matching
  const result = findBestFAQMatch(cleanQuestion, faqData);

  if (result) {
    sendJSON(res, 200, {
      success   : true,
      answer    : result.answer,
      matched   : result.question,
      confidence: result.confidence,
    });
  } else {
    // No match found — polite fallback message
    sendJSON(res, 200, {
      success   : false,
      answer    : "I'm sorry, I couldn't find information related to your question. " +
                  "Please try rephrasing it, or ask about topics like course registration, " +
                  "GPA calculation, school fees, dress code, or exam rules.",
      matched   : null,
      confidence: 0,
    });
  }
}

// ============================================================
// ROUTE HANDLER — POST /api/history/save
// Saves a new chat conversation to chat_history.json
// ============================================================
function handleSaveHistory(req, res, body) {
  let data;

  try {
    data = JSON.parse(body);
  } catch {
    return sendJSON(res, 400, { success: false, message: 'Invalid data format.' });
  }

  const { username, chatId, title, messages } = data;

  if (!username || !chatId || !messages) {
    return sendJSON(res, 400, { success: false, message: 'Missing required fields.' });
  }

  // Load existing history
  const history = readJSONFile(CONFIG.HISTORY_FILE, []);

  // Check if this chat session already exists (update it)
  const existingIndex = history.findIndex(
    entry => entry.chatId === chatId && entry.username === username
  );

  const historyEntry = {
    chatId   : chatId,
    username : username,
    title    : title || 'Untitled Chat',
    messages : messages,
    createdAt: existingIndex >= 0
      ? history[existingIndex].createdAt       // preserve original timestamp
      : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    // Update existing entry
    history[existingIndex] = historyEntry;
  } else {
    // Add new entry at the beginning (newest first)
    history.unshift(historyEntry);
  }

  const saved = writeJSONFile(CONFIG.HISTORY_FILE, history);

  if (saved) {
    sendJSON(res, 200, { success: true, message: 'Chat saved successfully.' });
  } else {
    sendJSON(res, 500, { success: false, message: 'Could not save chat history.' });
  }
}

// ============================================================
// ROUTE HANDLER — GET /api/history?username=...
// Returns all chat sessions for a specific user
// ============================================================
function handleGetHistory(req, res, parsedUrl) {
  const username = parsedUrl.query.username;

  if (!username) {
    return sendJSON(res, 400, { success: false, message: 'Username is required.' });
  }

  const history = readJSONFile(CONFIG.HISTORY_FILE, []);

  // Filter history for this specific user
  const userHistory = history.filter(entry => entry.username === username);

  // Return summary (no full messages) for sidebar list
  const summary = userHistory.map(entry => ({
    chatId   : entry.chatId,
    title    : entry.title,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    preview  : entry.messages && entry.messages.length > 0
      ? entry.messages[0].text.substring(0, 60) + '...'
      : '',
  }));

  sendJSON(res, 200, { success: true, history: summary });
}

// ============================================================
// ROUTE HANDLER — GET /api/history/:chatId?username=...
// Returns the full messages of a specific chat session
// ============================================================
function handleGetChatById(req, res, chatId, parsedUrl) {
  const username = parsedUrl.query.username;

  if (!username || !chatId) {
    return sendJSON(res, 400, { success: false, message: 'Username and chatId are required.' });
  }

  const history = readJSONFile(CONFIG.HISTORY_FILE, []);

  const chat = history.find(
    entry => entry.chatId === chatId && entry.username === username
  );

  if (chat) {
    sendJSON(res, 200, { success: true, chat: chat });
  } else {
    sendJSON(res, 404, { success: false, message: 'Chat session not found.' });
  }
}

// ============================================================
// ROUTE HANDLER — DELETE /api/history/:chatId?username=...
// Deletes a specific chat session
// ============================================================
function handleDeleteChat(req, res, chatId, parsedUrl) {
  const username = parsedUrl.query.username;

  if (!username || !chatId) {
    return sendJSON(res, 400, { success: false, message: 'Username and chatId are required.' });
  }

  const history = readJSONFile(CONFIG.HISTORY_FILE, []);
  const originalLength = history.length;

  const filtered = history.filter(
    entry => !(entry.chatId === chatId && entry.username === username)
  );

  if (filtered.length === originalLength) {
    return sendJSON(res, 404, { success: false, message: 'Chat not found.' });
  }

  const saved = writeJSONFile(CONFIG.HISTORY_FILE, filtered);

  if (saved) {
    sendJSON(res, 200, { success: true, message: 'Chat deleted successfully.' });
  } else {
    sendJSON(res, 500, { success: false, message: 'Could not delete chat.' });
  }
}

// ============================================================
// ROUTE HANDLER — DELETE /api/history/all?username=...
// Deletes all chat sessions for a user
// ============================================================
function handleDeleteAllChats(req, res, parsedUrl) {
  const username = parsedUrl.query.username;

  if (!username) {
    return sendJSON(res, 400, { success: false, message: 'Username is required.' });
  }

  const history = readJSONFile(CONFIG.HISTORY_FILE, []);
  const filtered = history.filter(entry => entry.username !== username);

  const saved = writeJSONFile(CONFIG.HISTORY_FILE, filtered);

  if (saved) {
    sendJSON(res, 200, { success: true, message: 'All chats deleted.' });
  } else {
    sendJSON(res, 500, { success: false, message: 'Could not delete chats.' });
  }
}

// ============================================================
// COLLECT REQUEST BODY — reads POST body chunks
// ============================================================
function collectBody(req, callback) {
  let body = '';

  req.on('data', chunk => {
    body += chunk.toString();

    // Prevent excessively large bodies (1 MB limit)
    if (body.length > 1_000_000) {
      body = '';
      req.destroy(new Error('Request body too large'));
    }
  });

  req.on('end', () => callback(body));
  req.on('error', () => callback(''));
}

// ============================================================
// MAIN HTTP SERVER
// Routes every incoming request to the correct handler
// ============================================================
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);   // parse URL + query string
  const pathname  = parsedUrl.pathname;
  const method    = req.method.toUpperCase();

  console.log(`[SERVER] ${method} ${pathname}`);

  // Handle CORS preflight (browser OPTIONS requests)
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin' : '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // ---- API Routes -------------------------------------------

  // POST /api/login
  if (method === 'POST' && pathname === '/api/login') {
    collectBody(req, body => handleLogin(req, res, body));
    return;
  }

  // POST /api/chat
  if (method === 'POST' && pathname === '/api/chat') {
    collectBody(req, body => handleChat(req, res, body));
    return;
  }

  // POST /api/history/save
  if (method === 'POST' && pathname === '/api/history/save') {
    collectBody(req, body => handleSaveHistory(req, res, body));
    return;
  }

  // DELETE /api/history/all
  if (method === 'DELETE' && pathname === '/api/history/all') {
    handleDeleteAllChats(req, res, parsedUrl);
    return;
  }

  // GET /api/history (list all for user)
  if (method === 'GET' && pathname === '/api/history') {
    handleGetHistory(req, res, parsedUrl);
    return;
  }

  // GET /api/history/:chatId  OR  DELETE /api/history/:chatId
  const historyMatch = pathname.match(/^\/api\/history\/(.+)$/);
  if (historyMatch) {
    const chatId = decodeURIComponent(historyMatch[1]);

    if (method === 'GET') {
      handleGetChatById(req, res, chatId, parsedUrl);
      return;
    }

    if (method === 'DELETE') {
      handleDeleteChat(req, res, chatId, parsedUrl);
      return;
    }
  }

  // ---- Static File Serving ----------------------------------

  // Root URL → serve chat_bot.html
  if (pathname === '/' || pathname === '/index.html') {
    serveStaticFile(res, path.join(CONFIG.STATIC_DIR, 'chat_bot.html'));
    return;
  }

  // All other static files (CSS, JS, assets, etc.)
  const safePath = path.join(CONFIG.STATIC_DIR, pathname);

  // Security: prevent directory traversal attacks
  if (!safePath.startsWith(CONFIG.STATIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 — Forbidden');
    return;
  }

  serveStaticFile(res, safePath);
});

// ============================================================
// START SERVER
// ============================================================
server.listen(CONFIG.PORT, CONFIG.HOST, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Chatbot Student Support System — Server Ready  ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`   Host   : ${CONFIG.HOST}`);
  console.log(`   Port   : ${CONFIG.PORT}`);
  console.log(`   FAQ    : ${CONFIG.FAQ_FILE}`);
  console.log(`   History: ${CONFIG.HISTORY_FILE}`);
  console.log('   Press CTRL+C to stop the server.');
  console.log('');
});

// Gracefully handle server errors
server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[ERROR] Port ${CONFIG.PORT} is already in use.`);
    console.error('        Try changing the PORT value in CONFIG or stop the other process.');
  } else {
    console.error('[ERROR] Server error:', err.message);
  }
  process.exit(1);
});