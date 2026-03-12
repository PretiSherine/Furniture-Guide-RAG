const API_URL = "http://localhost:8000/chat";

let conversationHistory = [];
let isLoading = false;

// ===== Send message =====
async function sendMessage() {
  if (isLoading) return;

  const input = document.getElementById("userInput");
  const question = input.value.trim();
  if (!question) return;

  input.value = "";
  autoResize(input);

  appendMessage("user", question);
  conversationHistory.push({ role: "user", content: question });

  const typingId = showTyping();
  setLoading(true);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: question,
        history: conversationHistory.slice(-6)
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || `Server error ${response.status}`);
    }

    // Remove typing indicator and create streaming bubble
    removeTyping(typingId);
    const { msgDiv, bubble } = createStreamingBubble();

    // Read SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullAnswer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split("\n");

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") break;

        try {
          const parsed = JSON.parse(data);
          if (parsed.token) {
            fullAnswer += parsed.token;
            bubble.innerHTML = formatText(fullAnswer);
            scrollToBottom();
          }
        } catch (_) {}
      }
    }

    conversationHistory.push({ role: "assistant", content: fullAnswer });

  } catch (err) {
    removeTyping(typingId);
    appendMessage("assistant", `Sorry, something went wrong: ${err.message}. Please make sure the server is running.`);
  } finally {
    setLoading(false);
  }
}

// ===== Create empty streaming bubble =====
function createStreamingBubble() {
  const window = document.getElementById("chatWindow");

  const msgDiv = document.createElement("div");
  msgDiv.classList.add("message", "assistant-message");

  const avatar = document.createElement("div");
  avatar.classList.add("avatar", "assistant-avatar");
  avatar.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
      <path d="M6 22V14a2 2 0 012-2h16a2 2 0 012 2v8" stroke="#c8a97e" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M4 22h24" stroke="#c8a97e" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M10 12V9a2 2 0 012-2h8a2 2 0 012 2v3" stroke="#c8a97e" stroke-width="2.5" stroke-linecap="round"/>
    </svg>`;

  const bubble = document.createElement("div");
  bubble.classList.add("bubble");

  msgDiv.appendChild(avatar);
  msgDiv.appendChild(bubble);
  window.appendChild(msgDiv);
  scrollToBottom();

  return { msgDiv, bubble };
}

// ===== Append message to chat =====
function appendMessage(role, text) {
  const window = document.getElementById("chatWindow");

  const msgDiv = document.createElement("div");
  msgDiv.classList.add("message", role === "user" ? "user-message" : "assistant-message");

  const avatar = document.createElement("div");
  avatar.classList.add("avatar", role === "user" ? "user-avatar" : "assistant-avatar");

  if (role === "user") {
    avatar.textContent = "You";
  } else {
    avatar.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
        <path d="M6 22V14a2 2 0 012-2h16a2 2 0 012 2v8" stroke="#c8a97e" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M4 22h24" stroke="#c8a97e" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M10 12V9a2 2 0 012-2h8a2 2 0 012 2v3" stroke="#c8a97e" stroke-width="2.5" stroke-linecap="round"/>
      </svg>`;
  }

  const bubble = document.createElement("div");
  bubble.classList.add("bubble");
  bubble.innerHTML = formatText(text);

  msgDiv.appendChild(avatar);
  msgDiv.appendChild(bubble);
  window.appendChild(msgDiv);

  scrollToBottom();
  return msgDiv;
}

// ===== Format text (markdown-lite) =====
function formatText(text) {
  return text
    // Bold
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Numbered lists
    .replace(/^\d+\.\s(.+)$/gm, "<li>$1</li>")
    // Bullet lists
    .replace(/^[-•]\s(.+)$/gm, "<li>$1</li>")
    // Wrap consecutive <li> in <ul>
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
    // Paragraphs (double newline)
    .replace(/\n\n+/g, "</p><p>")
    // Single newlines
    .replace(/\n/g, "<br>")
    // Wrap in paragraph
    .replace(/^(.+)/, "<p>$1</p>");
}

// ===== Typing indicator =====
function showTyping() {
  const id = "typing-" + Date.now();
  const window = document.getElementById("chatWindow");

  const msgDiv = document.createElement("div");
  msgDiv.id = id;
  msgDiv.classList.add("message", "assistant-message");

  const avatar = document.createElement("div");
  avatar.classList.add("avatar", "assistant-avatar");
  avatar.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
      <path d="M6 22V14a2 2 0 012-2h16a2 2 0 012 2v8" stroke="#c8a97e" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M4 22h24" stroke="#c8a97e" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M10 12V9a2 2 0 012-2h8a2 2 0 012 2v3" stroke="#c8a97e" stroke-width="2.5" stroke-linecap="round"/>
    </svg>`;

  const bubble = document.createElement("div");
  bubble.classList.add("bubble");
  bubble.innerHTML = `
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>`;

  msgDiv.appendChild(avatar);
  msgDiv.appendChild(bubble);
  window.appendChild(msgDiv);

  scrollToBottom();
  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ===== Sources =====
function showSources(sources) {
  const panel = document.getElementById("sourcesPanel");
  const list = document.getElementById("sourcesList");

  list.innerHTML = "";
  sources.forEach((src, i) => {
    const item = document.createElement("div");
    item.classList.add("source-item");
    item.textContent = `[${i + 1}] ${src}`;
    list.appendChild(item);
  });

  panel.style.display = "block";
}

function hideSources() {
  document.getElementById("sourcesPanel").style.display = "none";
}

// ===== Suggestion buttons =====
function insertSuggestion(btn) {
  const input = document.getElementById("userInput");
  input.value = btn.textContent;
  autoResize(input);
  input.focus();
}

// ===== Clear chat =====
function clearChat() {
  conversationHistory = [];
  const window = document.getElementById("chatWindow");

  // Remove all messages except welcome
  const messages = window.querySelectorAll(".message:not(#welcomeMsg)");
  messages.forEach(m => m.remove());

  hideSources();
}

// ===== Utils =====
function setLoading(val) {
  isLoading = val;
  document.getElementById("sendBtn").disabled = val;
}

function scrollToBottom() {
  const window = document.getElementById("chatWindow");
  window.scrollTop = window.scrollHeight;
}

function autoResize(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 150) + "px";
}

function handleKey(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

// ===== Focus input on load =====
window.addEventListener("load", () => {
  document.getElementById("userInput").focus();
});
