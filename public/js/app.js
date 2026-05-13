/**
 * VaultChat — Main Application
 */
(function () {
  const crypto = new VaultCrypto();
  let ws = null;
  let currentUser = null;
  let activeChat = null;
  let users = {};
  let chatHistory = {};
  let typingTimeout = null;

  // ─── DOM refs ───
  const $ = (s) => document.querySelector(s);
  const loginScreen = $('#login-screen');
  const chatScreen = $('#chat-screen');
  const usernameInput = $('#username-input');
  const joinBtn = $('#join-btn');
  const keyStatus = $('#key-generation-status');
  const myUsername = $('#my-username');
  const myAvatar = $('#my-avatar');
  const userList = $('#user-list');
  const onlineCount = $('#online-count');
  const userSearch = $('#user-search');
  const noChat = $('#no-chat');
  const activeSection = $('#active-chat');
  const chatAvatar = $('#chat-avatar');
  const chatName = $('#chat-contact-name');
  const chatStatus = $('#chat-contact-status');
  const messagesContainer = $('#messages-container');
  const msgInput = $('#message-input');
  const sendBtn = $('#send-btn');
  const typingIndicator = $('#typing-indicator');
  const securityPanel = $('#security-panel');
  const securityBtn = $('#security-info-btn');
  const myFingerprint = $('#my-fingerprint');
  const contactFingerprint = $('#contact-fingerprint');
  const backBtn = $('#back-btn');
  const sidebar = $('#sidebar');
  const logoutBtn = $('#logout-btn');
  const toastContainer = $('#toast-container');

  // ─── Matrix Rain ───
  function initMatrix() {
    const canvas = $('#matrix-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const cols = Math.floor(canvas.width / 18);
    const drops = Array(cols).fill(1);
    const chars = 'ァアィイゥウェエォオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF';

    function draw() {
      ctx.fillStyle = 'rgba(2, 10, 2, 0.06)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(0, 255, 70, 0.12)';
      ctx.font = '14px monospace';
      for (let i = 0; i < drops.length; i++) {
        const char = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(char, i * 18, drops[i] * 18);
        if (drops[i] * 18 > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    }
    setInterval(draw, 55);
    window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; });
  }

  // ─── Particle Canvas ───
  function initParticles() {
    const canvas = $('#particle-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const particles = [];
    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * canvas.width, y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 2 + 1
      });
    }
    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 255, 100, 0.08)';
        ctx.fill();
      });
      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0, 255, 100, ${0.03 * (1 - dist / 150)})`;
            ctx.stroke();
          }
        }
      }
      requestAnimationFrame(animate);
    }
    animate();
    window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; });
  }

  // ─── Toast notifications ───
  function showToast(msg, type = 'success') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;flex-shrink:0;color:${type === 'error' ? 'var(--danger)' : 'var(--green-400)'}">
      ${type === 'error' ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>' : '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/>'}
    </svg><span>${msg}</span>`;
    toastContainer.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(20px)'; setTimeout(() => t.remove(), 300); }, 3500);
  }

  // ─── WebSocket Connection ───
  function connectWS() {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${protocol}://${location.host}`);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'register', username: currentUser, publicKey: crypto.publicKeyPem }));
    };

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'registered':
          showScreen('chat');
          myUsername.textContent = currentUser;
          myAvatar.textContent = currentUser[0].toUpperCase();
          myFingerprint.textContent = await crypto.getFingerprint(crypto.publicKeyPem);
          showToast('Secure session established');
          break;

        case 'error':
          showToast(data.message, 'error');
          keyStatus.classList.add('hidden');
          joinBtn.disabled = false;
          break;

        case 'user_list':
          updateUserList(data.users);
          break;

        case 'message':
          await handleIncomingMessage(data);
          break;

        case 'delivered':
          markDelivered(data.messageId);
          break;

        case 'typing':
          if (data.from === activeChat) showTyping(true);
          break;

        case 'stop_typing':
          if (data.from === activeChat) showTyping(false);
          break;

        case 'public_key':
          users[data.username] = { ...users[data.username], publicKey: data.publicKey };
          break;
      }
    };

    ws.onclose = () => {
      showToast('Connection lost. Reconnecting...', 'error');
      setTimeout(connectWS, 3000);
    };

    ws.onerror = () => {};
  }

  // ─── Screen switch ───
  function showScreen(name) {
    loginScreen.classList.toggle('active', name === 'login');
    chatScreen.classList.toggle('active', name === 'chat');
  }

  // ─── User list ───
  function updateUserList(userArray) {
    users = {};
    let onlineN = 0;
    userArray.forEach(u => {
      users[u.username] = u;
      if (u.online && u.username !== currentUser) onlineN++;
    });
    onlineCount.textContent = `${onlineN} online`;
    renderContacts();
  }

  function renderContacts(filter = '') {
    const keys = Object.keys(users).filter(u => u !== currentUser && u.toLowerCase().includes(filter.toLowerCase()));
    if (keys.length === 0) {
      userList.innerHTML = `<div class="empty-contacts"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><p>No contacts found</p></div>`;
      return;
    }
    userList.innerHTML = keys.map(u => {
      const user = users[u];
      const last = chatHistory[u] ? chatHistory[u][chatHistory[u].length - 1] : null;
      const unread = (chatHistory[u] || []).filter(m => m.unread).length;
      return `<div class="contact-item ${activeChat === u ? 'active' : ''}" data-user="${u}">
        <div class="avatar-circle small">${u[0].toUpperCase()}</div>
        <div class="contact-info">
          <div class="contact-name">
            ${u}
            <span class="status-dot ${user.online ? 'online' : ''}" style="width:7px;height:7px;"></span>
          </div>
          <div class="contact-last-msg">${last ? (last.from === currentUser ? 'You: ' : '') + last.text.substring(0, 30) : 'Start encrypted conversation'}</div>
        </div>
        ${unread > 0 ? `<span class="unread-badge">${unread}</span>` : ''}
      </div>`;
    }).join('');

    userList.querySelectorAll('.contact-item').forEach(el => {
      el.addEventListener('click', () => openChat(el.dataset.user));
    });
  }

  // ─── Open Chat ───
  async function openChat(username) {
    activeChat = username;
    noChat.classList.add('hidden');
    activeSection.classList.remove('hidden');
    securityPanel.classList.add('hidden');

    chatName.textContent = username;
    chatAvatar.textContent = username[0].toUpperCase();

    const user = users[username];
    const statusHTML = user && user.online
      ? '<span class="status-dot online" style="width:7px;height:7px;"></span> Online · <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="lock-icon"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Encrypted'
      : '<span class="status-dot" style="width:7px;height:7px;"></span> Offline · <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="lock-icon"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Encrypted';
    chatStatus.innerHTML = statusHTML;

    if (user && user.publicKey) {
      contactFingerprint.textContent = await crypto.getFingerprint(user.publicKey);
    }

    // Mark messages as read
    if (chatHistory[username]) chatHistory[username].forEach(m => m.unread = false);

    renderMessages();
    renderContacts(userSearch.value);

    // Mobile: hide sidebar
    sidebar.classList.add('hidden-mobile');
    msgInput.focus();
  }

  // ─── Messages ───
  function renderMessages() {
    const msgs = chatHistory[activeChat] || [];
    const banner = messagesContainer.querySelector('.encryption-banner');
    const bannerHTML = banner ? banner.outerHTML : '';
    messagesContainer.innerHTML = bannerHTML;

    msgs.forEach(m => {
      const div = document.createElement('div');
      div.className = `message-bubble ${m.from === currentUser ? 'sent' : 'received'}`;
      div.dataset.id = m.id;
      const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      div.innerHTML = `<div class="message-text">${escapeHTML(m.text)}</div>
        <div class="message-meta">
          <span class="message-time">${time}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="message-lock"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
        </div>`;
      messagesContainer.appendChild(div);
    });

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  async function handleIncomingMessage(data) {
    try {
      const plaintext = await crypto.decryptMessage(data.encryptedMessage, data.encryptedKey, data.iv);
      const msg = { id: data.messageId, from: data.from, text: plaintext, timestamp: data.timestamp, unread: data.from !== activeChat };
      if (!chatHistory[data.from]) chatHistory[data.from] = [];
      chatHistory[data.from].push(msg);

      if (data.from === activeChat) {
        renderMessages();
        showTyping(false);
      } else {
        showToast(`New message from ${data.from}`);
      }
      renderContacts(userSearch.value);
    } catch (e) {
      console.error('Decryption failed:', e);
    }
  }

  async function sendMessage() {
    const text = msgInput.value.trim();
    if (!text || !activeChat) return;

    const recipient = users[activeChat];
    if (!recipient || !recipient.publicKey) {
      showToast('Cannot encrypt: recipient key unavailable', 'error');
      return;
    }

    try {
      const encrypted = await crypto.encryptMessage(text, recipient.publicKey);
      const messageId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      const timestamp = Date.now();

      ws.send(JSON.stringify({
        type: 'message', to: activeChat,
        encryptedMessage: encrypted.encryptedMessage,
        encryptedKey: encrypted.encryptedKey,
        iv: encrypted.iv,
        messageId, timestamp
      }));

      const msg = { id: messageId, from: currentUser, text, timestamp, unread: false };
      if (!chatHistory[activeChat]) chatHistory[activeChat] = [];
      chatHistory[activeChat].push(msg);

      renderMessages();
      renderContacts(userSearch.value);
      msgInput.value = '';
      msgInput.style.height = 'auto';
      sendBtn.disabled = true;

      // Stop typing
      ws.send(JSON.stringify({ type: 'stop_typing', to: activeChat }));
    } catch (e) {
      showToast('Encryption failed', 'error');
      console.error(e);
    }
  }

  function markDelivered(messageId) {
    const el = messagesContainer.querySelector(`[data-id="${messageId}"]`);
    if (el) {
      const meta = el.querySelector('.message-meta');
      if (meta && !meta.querySelector('.delivered-check')) {
        const check = document.createElement('span');
        check.className = 'delivered-check';
        check.innerHTML = '✓';
        check.style.cssText = 'font-size:11px;color:var(--green-400);';
        meta.insertBefore(check, meta.firstChild);
      }
    }
  }

  function showTyping(show) {
    typingIndicator.classList.toggle('hidden', !show);
    if (show) messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Event Listeners ───
  joinBtn.addEventListener('click', async () => {
    const name = usernameInput.value.trim();
    if (!name) { showToast('Please enter a username', 'error'); return; }
    if (name.length < 2) { showToast('Username must be at least 2 characters', 'error'); return; }

    joinBtn.disabled = true;
    keyStatus.classList.remove('hidden');

    try {
      await crypto.generateKeyPair();
      keyStatus.querySelector('span').textContent = 'Keys generated! Connecting...';
      currentUser = name;
      connectWS();
    } catch (e) {
      showToast('Key generation failed', 'error');
      joinBtn.disabled = false;
      keyStatus.classList.add('hidden');
    }
  });

  usernameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinBtn.click(); });

  msgInput.addEventListener('input', () => {
    sendBtn.disabled = !msgInput.value.trim();
    // Auto-resize
    msgInput.style.height = 'auto';
    msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
    // Typing indicator
    if (activeChat && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'typing', to: activeChat }));
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        ws.send(JSON.stringify({ type: 'stop_typing', to: activeChat }));
      }, 2000);
    }
  });

  msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  sendBtn.addEventListener('click', sendMessage);

  userSearch.addEventListener('input', () => renderContacts(userSearch.value));

  securityBtn.addEventListener('click', () => securityPanel.classList.toggle('hidden'));

  backBtn.addEventListener('click', () => sidebar.classList.remove('hidden-mobile'));

  logoutBtn.addEventListener('click', () => {
    if (ws) ws.close();
    currentUser = null; activeChat = null; chatHistory = {}; users = {};
    showScreen('login');
    joinBtn.disabled = false;
    keyStatus.classList.add('hidden');
    usernameInput.value = '';
  });

  // ─── Init ───
  initMatrix();
  initParticles();
})();
