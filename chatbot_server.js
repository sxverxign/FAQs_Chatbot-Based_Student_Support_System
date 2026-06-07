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
// GRATITUDE DETECTION — Phrases List
// ============================================================
// This list contains all the phrases and keywords that should
// be recognised as expressions of gratitude or politeness.
// When a student's message matches any of these, the chatbot
// will respond with a warm acknowledgement instead of
// searching the FAQ knowledge base.
//
// To add more phrases: simply add a new string to this array.
// All comparisons are case-insensitive.
// ============================================================
const GRATITUDE_PHRASES = [
  // Direct thank you variations
  'thank you',
  'thank you so much',
  'thank you very much',
  'thank you a lot',
  'thank you for the info',
  'thank you for the information',
  'thank you for your help',
  'thank you for helping me',
  'thank you for the clarification',
  'thank you for explaining',
  'thank you for the answer',
  'thank you for answering',
  'thank you for the response',
  'thank you for the update',
  'thank you for the assistance',

  // Shortened thank you
  'thanks',
  'thanks a lot',
  'thanks so much',
  'thanks very much',
  'thanks for the info',
  'thanks for the information',
  'thanks for your help',
  'thanks for helping',
  'thanks for helping me',
  'thanks for the clarification',
  'thanks for explaining',
  'thanks for the answer',
  'thanks for answering',
  'thanks for the response',
  'thanks for the update',
  'thanks for the assistance',
  'thanks a bunch',
  'thanks a ton',
  'many thanks',

  // Informal / slang variations
  'thx',
  'thnx',
  'tnx',
  'ty',
  'tysm',
  'tyvm',
  'tq',
  'tq so much',
  'tq very much',

  // Appreciative expressions
  'i appreciate it',
  'i appreciate that',
  'i appreciate your help',
  'i appreciate the help',
  'i appreciate the info',
  'i appreciate the information',
  'i appreciate the clarification',
  'much appreciated',
  'greatly appreciated',
  'deeply appreciated',
  'this is helpful',
  'this was helpful',
  'very helpful',
  'so helpful',
  'that was helpful',
  'that is helpful',
  'that was very helpful',
  'that is very helpful',
  'this was very helpful',
  'this is very helpful',
  'quite helpful',

  // Acknowledgement expressions
  'noted',
  'got it',
  'got it thanks',
  'got it thank you',
  'understood',
  'understood thank you',
  'understood thanks',
  'alright thanks',
  'alright thank you',
  'okay thanks',
  'okay thank you',
  'ok thanks',
  'ok thank you',
  'perfect thanks',
  'perfect thank you',
  'great thanks',
  'great thank you',
  'wonderful thanks',
  'wonderful thank you',
  'excellent thanks',
  'excellent thank you',
  'awesome thanks',
  'awesome thank you',
  'brilliant thanks',
  'brilliant thank you',

  // Complimentary expressions
  'you are helpful',
  'you are very helpful',
  'you have been helpful',
  'you have been very helpful',
  'you are doing great',
  'you are amazing',
  'you are wonderful',
  'this is amazing',
  'this is great',
  'this is wonderful',
  'this is excellent',
  'great job',
  'good job',
  'well done',
  'keep it up',
  'nice one',

  // Nigerian / informal expressions commonly used by students
  'e don do',
  'na him be dat',
  'you don help me',
  'you don do am',
  'i don get am',
  'i don see am',
  'i understand now',
  'i get it now',
  'i see now',
  'now i understand',
  'now i get it',
  'now i see',
  'clear',
  'all clear',
  'crystal clear',
  'very clear',
  'that is clear',
  'that is very clear',
  'that is quite clear',
];

// ============================================================
// GRATITUDE DETECTION — Response Pool
// ============================================================
// The chatbot randomly selects one response from this list
// each time it detects a gratitude message.
// This makes the chatbot feel more natural and less repetitive.
//
// To add more responses: add a new string to this array.
// ============================================================
const GRATITUDE_RESPONSES = [
  "You're welcome! 😊 If you have any other questions about your courses, grades, exams, or dress code, feel free to ask anytime.",
  "Happy to help! 🎓 Don't hesitate to ask if there's anything else you'd like to know.",
  "Glad I could assist! If you need any more information, I'm always here to help.",
  "You're welcome! 😊 Feel free to come back anytime you have questions about your academic journey.",
  "It's my pleasure! 🎓 Is there anything else you'd like to know about course registration, grading, exams, or dress code?",
  "Anytime! That's what I'm here for. If you think of more questions later, don't hesitate to ask. 😊",
  "You're welcome! Good luck with your studies! 📚 Feel free to ask if you need anything else.",
  "Happy to be of help! 😊 Remember, I'm available anytime you have academic questions.",
  "Glad that was helpful! 🎓 If you have more questions as the semester progresses, I'm always here.",
  "You're very welcome! Best of luck with your academics. Feel free to return anytime you need assistance. 😊",
  "No problem at all! 😊 That's exactly what I'm here for. Ask me anything else if you need to.",
  "It was my pleasure helping you! 🎓 Don't forget — I'm available 24/7 for any academic questions you may have.",
  "Glad I could clear that up! 😊 Feel free to ask if anything else comes to mind.",
  "You're welcome! 🎓 Wishing you all the best in your studies. Come back anytime!",
  "Happy to help! Academic success starts with being informed. 📚 Keep asking questions whenever you need to!",
];

// ============================================================
// GRATITUDE DETECTION — Main Function
// ============================================================
// Checks whether the user's message is a gratitude expression.
// Returns true if it matches, false if it does not.
//
// How it works:
//   1. Cleans the input (lowercase, remove punctuation, trim)
//   2. Checks for an exact match against GRATITUDE_PHRASES
//   3. Checks if the cleaned input STARTS WITH a gratitude phrase
//      (handles cases like "thanks a lot for that explanation")
//   4. Checks if the cleaned input CONTAINS a short gratitude
//      keyword like "thanks" or "thank you"
// ============================================================
function isGratitude(userMessage) {
  if (!userMessage || typeof userMessage !== 'string') return false;

  // Clean the input — lowercase and remove punctuation
  const cleaned = userMessage
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim();

  // Guard against empty string after cleaning
  if (!cleaned) return false;

  // Check 1 — Exact match against any phrase in the list
  if (GRATITUDE_PHRASES.includes(cleaned)) {
    return true;
  }

  // Check 2 — The message STARTS WITH a gratitude phrase
  // Handles: "thanks for that, very useful" or "thank you so much!"
  const startsWithGratitude = GRATITUDE_PHRASES.some(phrase =>
    cleaned.startsWith(phrase)
  );
  if (startsWithGratitude) return true;

  // Check 3 — The message CONTAINS a core short gratitude keyword
  // These are kept short and specific to avoid false positives
  const coreKeywords = [
    'thank you',
    'thanks',
    'appreciate',
    'helpful',
    'noted',
    'understood',
  ];

  const containsGratitude = coreKeywords.some(keyword =>
    cleaned.includes(keyword)
  );
  if (containsGratitude) return true;

  return false;
}

// ============================================================
// GRATITUDE DETECTION — Picks a Random Response
// ============================================================

function getGratitudeResponse() {
  const randomIndex = Math.floor(Math.random() * GRATITUDE_RESPONSES.length);
  return GRATITUDE_RESPONSES[randomIndex];
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
// ============================================================
const SYNONYM_MAP = {

  // --- Registration routing ---
  'enroll'         : 'registration',
  'enrollment'     : 'registration',
  'signup'         : 'registration',
  'sign'           : 'registration',
  'registering'    : 'registration',
  'registered'     : 'registration',
  'portal'         : 'registration',
  'proceed'        : 'registration',

  // --- GPA specific routing ---
  'average'        : 'gpa',
  'semester average': 'gpa',
  'gpa'            : 'gpa',
  'gp'            : 'gp',

  // --- CGPA specific routing ---
  'cumulative'     : 'cgpa',
  'overall'        : 'cgpa',
  'cgpa'           : 'cgpa',

  // --- TLU specific routing ---
  'tlu'            : 'tlu',
  'load units'     : 'tlu',

  // --- CLU specific routing ---
  'clu'            : 'clu',
  'cumulative load': 'clu',

  // --- TCP specific routing ---
  'tcp'            : 'tcp',
  'credit points'  : 'tcp',

  // --- CCP specific routing ---
  'ccp'            : 'ccp',
  'cumulative credit': 'ccp',

  // --- Grade point specific routing ---
  'gp'             : 'grade point',
  'grade points'   : 'grade point',
  'point value'    : 'grade point',

  // --- Grading system routing ---
  'marks'          : 'grading',
  'score'          : 'grading',
  'scores'         : 'grading',
  'percentage'     : 'grading',

  // --- Carryover routing ---
  'carryover'      : 'carryover',
  'carry'          : 'carryover',
  'retake'         : 'carryover',
  'repeat'         : 'carryover',
  'failed'         : 'carryover',
  'fail'           : 'carryover',

  // --- Dress code routing ---
  'wear'           : 'dress',
  'wearing'        : 'dress',
  'outfit'         : 'dress',
  'clothes'        : 'dress',
  'clothing'       : 'dress',
  'attire'         : 'dress',
  'dressed'        : 'dress',
  'dressing'       : 'dress',

  // --- Exam routing ---
  'exam'           : 'examination',
  'exams'          : 'examination',
  'test'           : 'examination',
  'paper'          : 'examination',
  'finals'         : 'examination',
  'examination'    : 'examination',

  // --- Probation routing ---
  'probation'      : 'probation',
  'warning'        : 'probation',
  'dismissed'      : 'probation',
  'withdrawal'     : 'probation',

  // --- CA routing ---
  'ca'             : 'continuous assessment',
  'coursework'     : 'continuous assessment',
  'assignment'     : 'continuous assessment',
  'quiz'           : 'continuous assessment',

  // --- Footwear routing ---
  'slippers'       : 'slippers',
  'flip'           : 'slippers',
  'sandals'        : 'slippers',
  'footwear'       : 'slippers',
  'shoes'          : 'slippers',
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
// NLP CORE — REFINED Scoring Logic
// This version prioritises exact phrase matches to prevent clashing.
// ============================================================
function scoreFAQEntry(faqEntry, queryTokens) {
  if (!faqEntry || !queryTokens.length) return 0;

  const faqKeywords = faqEntry.keywords || [];
  const faqQuestion = preprocessText(faqEntry.question);
  
  // Create a single string of keywords for phrase matching
  const keywordString = faqKeywords.join(' ').toLowerCase();
  // Create a single string of the user query
  const queryPhrase = queryTokens.join(' ');

  let weightedScore = 0;

  // --- 1. PHRASE MATCHING (The "Anti-Clash" Secret) ---
  // If the user's exact phrase (e.g., "grade point") exists in the FAQ keywords,
  // we give it a massive boost so it beats partial matches elsewhere.
  if (keywordString.includes(queryPhrase)) {
    weightedScore += 20; 
  }

  // --- 2. INDIVIDUAL TOKEN MATCHING ---
  queryTokens.forEach(token => {
    // Check for exact matches in keywords
    if (faqKeywords.includes(token)) {
      weightedScore += 5; // Heavy weight for exact keyword
    } 
    // Check if token is part of a multi-word keyword
    else if (faqKeywords.some(kw => kw.split(' ').includes(token))) {
      weightedScore += 3;
    }
    
    // Check matches in the actual question text
    if (faqQuestion.includes(token)) {
      weightedScore += 2;
    }
  });

  if (weightedScore === 0) return 0;

  // Normalise: higher score means higher confidence
  // We divide by a fixed factor to keep scores between 0 and 1
  return weightedScore / (queryTokens.length * 10 + 10);
}

function findBestFAQMatch(userQuestion, faqData) {
  if (!userQuestion || !faqData || !faqData.length) return null;

  const rawTokens = preprocessText(userQuestion);
  const queryTokens = expandWithSynonyms(rawTokens);

  if (!queryTokens.length) return null;

  let bestMatch = null;
  let bestScore = 0;

  faqData.forEach(entry => {
    const score = scoreFAQEntry(entry, queryTokens);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  });

  // LOG FOR DEBUGGING - Check your terminal to see why it matched
  if (bestMatch) {
    console.log(`[NLP] Best: "${bestMatch.question}" | Score: ${bestScore.toFixed(2)}`);
  }

  // THRESHOLD CHECK
  // We use 0.25 now to be stricter
  if (bestScore >= 0.25 && bestMatch) {
    return {
      answer: bestMatch.answer,
      question: bestMatch.question,
      confidence: Math.round(bestScore * 100),
    };
  }

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

  // ---- Gratitude Detection --------------------------------
  // Checks if the student is expressing gratitude before
  // running the FAQ search.
  // --------------------------------------------------------
  if (isGratitude(cleanQuestion)) {
    console.log(`[CHAT] Gratitude detected — sending acknowledgement response`);
    return sendJSON(res, 200, {
      success   : true,
      answer    : getGratitudeResponse(),
      matched   : null,
      confidence: 100,
      type      : 'gratitude',
    });
  }

  // Loads FAQ data
  const faqData = readJSONFile(CONFIG.FAQ_FILE, []);

  if (!faqData.length) {
    return sendJSON(res, 500, {
      success: false,
      answer : 'The knowledge base is currently unavailable. Please try again later.',
    });
  }

  // Runs NLP matching
  const result = findBestFAQMatch(cleanQuestion, faqData);

  if (result) {
    sendJSON(res, 200, {
      success   : true,
      answer    : result.answer,
      matched   : result.question,
      confidence: result.confidence,
    });
  } else {
    // When no match is  found — polite fallback message
    sendJSON(res, 200, {
      success   : false,
      answer    : "I'm sorry, I couldn't find information related to your question. " +
                  "Please try rephrasing it, or ask about topics like course registration, " +
                  "GPA calculation or dress code policies",
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