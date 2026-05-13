/**
 * Raksha — Main Application
 */
(function () {
  const crypto = new VaultCrypto();
  let ws = null;
  let currentUser = null;
  let activeChat = null;
  let users = {};
  let chatHistory = {};
  let typingTimeout = null;
  let pendingFile = null; // { name, size, type, dataUrl }

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
  const avatarWrapper = $('#avatar-wrapper');
  const avatarInput = $('#avatar-input');
  const fileInput = $('#file-input');
  const attachBtn = $('#attach-btn');
  const filePreview = $('#file-preview');

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
          setAvatar(myAvatar, currentUser, null);
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
          // Update own avatar if server has it
          if (users[currentUser] && users[currentUser].avatar) {
            setAvatar(myAvatar, currentUser, users[currentUser].avatar);
          }
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

        // ─── Video Call Signaling ───
        case 'call_offer':
          handleIncomingCall(data);
          break;

        case 'call_answer':
          if (window.RakshaCall) {
            window.RakshaCall.handleAnswer(data.answer);
          }
          break;

        case 'ice_candidate':
          if (window.RakshaCall) {
            window.RakshaCall.addIceCandidate(data.candidate);
          }
          break;

        case 'call_end':
          endVideoCall(false);
          showToast(`${data.from} ended the call`);
          break;

        case 'call_reject':
          endVideoCall(false);
          showToast(`${data.from} declined the call`, 'error');
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
      const avatarContent = user.avatar
        ? `<img src="${user.avatar}" alt="${u}">`
        : u[0].toUpperCase();
      const lastPreview = last
        ? (last.from === currentUser ? 'You: ' : '') + (last.fileMetadata ? '📎 ' + last.fileMetadata.name : last.text.substring(0, 30))
        : 'Start encrypted conversation';
      return `<div class="contact-item ${activeChat === u ? 'active' : ''}" data-user="${u}">
        <div class="avatar-circle small">${avatarContent}</div>
        <div class="contact-info">
          <div class="contact-name">
            ${u}
            <span class="status-dot ${user.online ? 'online' : ''}" style="width:7px;height:7px;"></span>
          </div>
          <div class="contact-last-msg">${lastPreview}</div>
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
    setAvatar(chatAvatar, username, users[username] ? users[username].avatar : null);

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

      let mediaHTML = '';
      if (m.fileMetadata && m.fileDataUrl) {
        const fm = m.fileMetadata;
        if (fm.type.startsWith('image/')) {
          mediaHTML = `<div class="message-media"><img src="${m.fileDataUrl}" alt="${escapeHTML(fm.name)}" onclick="window._openLightbox(this.src)" /></div>`;
        } else if (fm.type.startsWith('video/')) {
          mediaHTML = `<div class="message-media"><video src="${m.fileDataUrl}" controls playsinline></video></div>`;
        } else {
          mediaHTML = `<div class="message-file" onclick="window._downloadFile('${m.fileDataUrl}','${escapeHTML(fm.name)}')">
            <div class="message-file-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg></div>
            <div class="message-file-info"><div class="message-file-name">${escapeHTML(fm.name)}</div><div class="message-file-size">${formatSize(fm.size)}</div></div>
          </div>`;
        }
      }

      const textHTML = m.text ? `<div class="message-text">${escapeHTML(m.text)}</div>` : '';
      div.innerHTML = `${mediaHTML}${textHTML}
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
      const msg = {
        id: data.messageId, from: data.from, text: '',
        timestamp: data.timestamp, unread: data.from !== activeChat,
        fileMetadata: data.fileMetadata, fileDataUrl: null
      };

      // If it's a file message, the plaintext is the dataUrl
      if (data.fileMetadata) {
        msg.fileDataUrl = plaintext;
        msg.text = ''; // file messages have no separate text
      } else {
        msg.text = plaintext;
      }

      if (!chatHistory[data.from]) chatHistory[data.from] = [];
      chatHistory[data.from].push(msg);

      if (data.from === activeChat) {
        renderMessages();
        showTyping(false);
      } else {
        const preview = data.fileMetadata ? `📎 ${data.fileMetadata.name}` : 'New message';
        showToast(`${preview} from ${data.from}`);
      }
      renderContacts(userSearch.value);
    } catch (e) {
      console.error('Decryption failed:', e);
    }
  }

  async function sendMessage() {
    const text = msgInput.value.trim();
    if (!text && !pendingFile) return;
    if (!activeChat) return;

    const recipient = users[activeChat];
    if (!recipient || !recipient.publicKey) {
      showToast('Cannot encrypt: recipient key unavailable', 'error');
      return;
    }

    try {
      const messageId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      const timestamp = Date.now();

      if (pendingFile) {
        // Send file: encrypt the dataUrl as the payload
        const encrypted = await crypto.encryptMessage(pendingFile.dataUrl, recipient.publicKey);

        ws.send(JSON.stringify({
          type: 'message', to: activeChat,
          encryptedMessage: encrypted.encryptedMessage,
          encryptedKey: encrypted.encryptedKey,
          iv: encrypted.iv,
          messageId, timestamp,
          fileMetadata: { name: pendingFile.name, size: pendingFile.size, type: pendingFile.type }
        }));

        const msg = {
          id: messageId, from: currentUser, text: '',
          timestamp, unread: false,
          fileMetadata: { name: pendingFile.name, size: pendingFile.size, type: pendingFile.type },
          fileDataUrl: pendingFile.dataUrl
        };
        if (!chatHistory[activeChat]) chatHistory[activeChat] = [];
        chatHistory[activeChat].push(msg);

        clearPendingFile();
      } else {
        // Send text message
        const encrypted = await crypto.encryptMessage(text, recipient.publicKey);

        ws.send(JSON.stringify({
          type: 'message', to: activeChat,
          encryptedMessage: encrypted.encryptedMessage,
          encryptedKey: encrypted.encryptedKey,
          iv: encrypted.iv,
          messageId, timestamp
        }));

        const msg = { id: messageId, from: currentUser, text, timestamp, unread: false, fileMetadata: null, fileDataUrl: null };
        if (!chatHistory[activeChat]) chatHistory[activeChat] = [];
        chatHistory[activeChat].push(msg);
      }

      renderMessages();
      renderContacts(userSearch.value);
      msgInput.value = '';
      msgInput.style.height = 'auto';
      sendBtn.disabled = true;

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

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function setAvatar(el, username, avatarUrl) {
    if (avatarUrl) {
      el.innerHTML = `<img src="${avatarUrl}" alt="${username}">`;
    } else {
      el.textContent = username[0].toUpperCase();
    }
  }

  function clearPendingFile() {
    pendingFile = null;
    filePreview.classList.add('hidden');
    filePreview.innerHTML = '';
    fileInput.value = '';
    sendBtn.disabled = !msgInput.value.trim();
  }

  function showFilePreview(file, dataUrl) {
    filePreview.classList.remove('hidden');
    let thumbHTML;
    if (file.type.startsWith('image/')) {
      thumbHTML = `<img src="${dataUrl}" class="file-preview-thumb" />`;
    } else if (file.type.startsWith('video/')) {
      thumbHTML = `<div class="file-preview-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5,3 19,12 5,21"/></svg></div>`;
    } else {
      thumbHTML = `<div class="file-preview-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg></div>`;
    }
    filePreview.innerHTML = `${thumbHTML}
      <div class="file-preview-info">
        <div class="file-preview-name">${escapeHTML(file.name)}</div>
        <div class="file-preview-size">${formatSize(file.size)}</div>
      </div>
      <button class="file-preview-remove" id="remove-file"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
    $('#remove-file').addEventListener('click', clearPendingFile);
    sendBtn.disabled = false;
  }

  // Lightbox
  window._openLightbox = function(src) {
    const lb = document.createElement('div');
    lb.className = 'lightbox-overlay';
    lb.innerHTML = `<img src="${src}" />`;
    lb.addEventListener('click', () => lb.remove());
    document.body.appendChild(lb);
  };

  // File download
  window._downloadFile = function(dataUrl, name) {
    const a = document.createElement('a');
    a.href = dataUrl; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  };

  // ─── Event Listeners ───
  let googlePhotoUrl = null;

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

  // ─── Google Sign-In ───
  const googleBtn = $('#google-signin-btn');
  const googleUserInfo = $('#google-user-info');
  const googleAvatarImg = $('#google-avatar');
  const googleNameEl = $('#google-name');
  const googleEmailEl = $('#google-email');

  googleBtn.addEventListener('click', async () => {
    // Wait for Firebase to load (ES module loads async)
    if (!window.VaultAuth) {
      googleBtn.querySelector('span').textContent = 'Loading...';
      await new Promise((resolve) => {
        const check = setInterval(() => {
          if (window.VaultAuth) { clearInterval(check); resolve(); }
        }, 200);
        setTimeout(() => { clearInterval(check); resolve(); }, 5000);
      });
    }
    if (!window.VaultAuth) {
      showToast('Firebase failed to load. Please refresh and try again.', 'error');
      googleBtn.querySelector('span').textContent = 'Sign in with Google';
      return;
    }

    googleBtn.disabled = true;
    googleBtn.querySelector('span').textContent = 'Signing in...';

    try {
      const user = await window.VaultAuth.signInWithGoogle();
      // Show user info
      googleUserInfo.classList.remove('hidden');
      googleAvatarImg.src = user.photoURL || '';
      googleNameEl.textContent = user.displayName;
      googleEmailEl.textContent = user.email;
      googlePhotoUrl = user.photoURL;

      // Auto-fill username from Google name
      const displayName = user.displayName.split(' ')[0]; // First name
      usernameInput.value = displayName;

      // Auto-generate keys and connect
      keyStatus.classList.remove('hidden');
      joinBtn.disabled = true;

      await crypto.generateKeyPair();
      keyStatus.querySelector('span').textContent = 'Keys generated! Connecting...';
      currentUser = displayName;
      connectWS();

      // Set Google photo as avatar after connection
      setTimeout(() => {
        if (googlePhotoUrl && ws && ws.readyState === WebSocket.OPEN) {
          // Use Google profile pic as avatar
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 128; canvas.height = 128;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, 128, 128);
            const avatarDataUrl = canvas.toDataURL('image/jpeg', 0.8);
            setAvatar(myAvatar, currentUser, avatarDataUrl);
            ws.send(JSON.stringify({ type: 'update_avatar', avatar: avatarDataUrl }));
          };
          img.src = googlePhotoUrl;
        }
      }, 2000);
    } catch (e) {
      showToast('Google sign-in failed', 'error');
      console.error(e);
    }
    googleBtn.disabled = false;
    googleBtn.querySelector('span').textContent = 'Sign in with Google';
  });


  msgInput.addEventListener('input', () => {
    sendBtn.disabled = !msgInput.value.trim() && !pendingFile;
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

  logoutBtn.addEventListener('click', async () => {
    if (ws) ws.close();
    // Sign out of Firebase/Google
    if (window.VaultAuth) {
      try { await window.VaultAuth.signOutUser(); } catch(e) {}
    }
    currentUser = null; activeChat = null; chatHistory = {}; users = {};
    pendingFile = null; googlePhotoUrl = null;
    showScreen('login');
    joinBtn.disabled = false;
    keyStatus.classList.add('hidden');
    usernameInput.value = '';
    googleUserInfo.classList.add('hidden');
    showToast('Logged out successfully');
  });

  // ─── Settings ───
  const settingsBtn = $('#settings-btn');
  const settingsModal = $('#settings-modal');
  const closeSettings = $('#close-settings');
  const clearDataBtn = $('#clear-data-btn');

  settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
  closeSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.classList.add('hidden');
  });

  clearDataBtn.addEventListener('click', () => {
    if (confirm('Clear all chat history? This cannot be undone.')) {
      chatHistory = {};
      if (activeChat) renderMessages();
      renderContacts(userSearch.value);
      showToast('Chat data cleared');
      settingsModal.classList.add('hidden');
    }
  });

  // ─── Avatar Upload ───
  avatarWrapper.addEventListener('click', () => avatarInput.click());

  avatarInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('Profile picture must be under 2MB', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      // Resize to 128x128 for efficiency
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        ctx.drawImage(img, sx, sy, size, size, 0, 0, 128, 128);
        const avatarDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setAvatar(myAvatar, currentUser, avatarDataUrl);
        // Send to server
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'update_avatar', avatar: avatarDataUrl }));
        }
        showToast('Profile picture updated');
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  // ─── File Attachment ───
  attachBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      showToast('File size must be under 25MB', 'error');
      fileInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      pendingFile = { name: file.name, size: file.size, type: file.type, dataUrl: reader.result };
      showFilePreview(file, reader.result);
    };
    reader.readAsDataURL(file);
  });


  // ─── Phone Contacts Import ───
  const importContactsBtn = $('#import-contacts-btn');
  const contactsModal = $('#contacts-modal');
  const closeContactsModal = $('#close-contacts-modal');
  const phoneContactsList = $('#phone-contacts-list');
  const contactsUnsupported = $('#contacts-unsupported');
  const shareLink = $('#share-link');
  const copyLinkBtn = $('#copy-link-btn');

  importContactsBtn.addEventListener('click', async () => {
    contactsModal.classList.remove('hidden');
    shareLink.value = window.location.href;

    // Check if Contact Picker API is available (Android Chrome)
    if ('contacts' in navigator && 'ContactsManager' in window) {
      try {
        const props = ['name', 'tel'];
        const opts = { multiple: true };
        const contacts = await navigator.contacts.select(props, opts);

        if (contacts.length > 0) {
          phoneContactsList.innerHTML = '';
          contactsUnsupported.classList.add('hidden');

          contacts.forEach(contact => {
            const name = contact.name ? contact.name[0] : 'Unknown';
            const tel = contact.tel ? contact.tel[0] : 'No number';
            const initial = name[0] || '?';

            const item = document.createElement('div');
            item.className = 'phone-contact-item';
            item.innerHTML = `
              <div class="phone-contact-avatar">${initial.toUpperCase()}</div>
              <div class="phone-contact-info">
                <div class="phone-contact-name">${escapeHTML(name)}</div>
                <div class="phone-contact-number">${escapeHTML(tel)}</div>
              </div>
              <button class="btn-invite" data-name="${escapeHTML(name)}" data-tel="${escapeHTML(tel)}">Invite</button>
            `;
            phoneContactsList.appendChild(item);
          });

          // Invite button handlers
          phoneContactsList.querySelectorAll('.btn-invite').forEach(btn => {
            btn.addEventListener('click', async () => {
              const name = btn.dataset.name;
              const tel = btn.dataset.tel;
              const shareText = `Hey ${name}! Join me on Raksha for encrypted messaging: ${window.location.href}`;

              if (navigator.share) {
                try {
                  await navigator.share({ title: 'Raksha - Encrypted Chat', text: shareText, url: window.location.href });
                  btn.textContent = 'Invited ✓';
                  btn.classList.add('invited');
                } catch { /* user cancelled */ }
              } else {
                await navigator.clipboard.writeText(shareText);
                btn.textContent = 'Copied ✓';
                btn.classList.add('invited');
                showToast(`Invite link copied for ${name}`);
              }
            });
          });
        } else {
          // User cancelled contact picker
          phoneContactsList.innerHTML = '';
          contactsUnsupported.classList.remove('hidden');
        }
      } catch (e) {
        // API error fallback
        phoneContactsList.innerHTML = '';
        contactsUnsupported.classList.remove('hidden');
      }
    } else {
      // Contact Picker not supported — show share link
      phoneContactsList.innerHTML = '';
      contactsUnsupported.classList.remove('hidden');
    }
  });

  closeContactsModal.addEventListener('click', () => {
    contactsModal.classList.add('hidden');
  });

  contactsModal.addEventListener('click', (e) => {
    if (e.target === contactsModal) contactsModal.classList.add('hidden');
  });

  copyLinkBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareLink.value);
      copyLinkBtn.textContent = 'Copied ✓';
      showToast('Link copied to clipboard');
      setTimeout(() => { copyLinkBtn.textContent = 'Copy'; }, 2000);
    } catch {
      shareLink.select();
      document.execCommand('copy');
      copyLinkBtn.textContent = 'Copied ✓';
      setTimeout(() => { copyLinkBtn.textContent = 'Copy'; }, 2000);
    }
  });

  // ─── Video Call ───
  const callOverlay = $('#call-overlay');
  const localVideoRaw = $('#local-video-raw');
  const localFilterCanvas = $('#local-filter-canvas');
  const remoteVideo = $('#remote-video');
  const callRemoteName = $('#call-remote-name');
  const callTimer = $('#call-timer');
  const callMuteBtn = $('#call-mute-btn');
  const callVideoBtn = $('#call-video-btn');
  const callFilterBtn = $('#call-filter-btn');
  const callEndBtn = $('#call-end-btn');
  const filterPicker = $('#filter-picker');
  const filterList = $('#filter-list');
  const videoCallBtn = $('#video-call-btn');
  const incomingCallModal = $('#incoming-call-modal');
  const incomingCallName = $('#incoming-call-name');
  const incomingCallAvatar = $('#incoming-call-avatar');
  const acceptCallBtn = $('#accept-call-btn');
  const rejectCallBtn = $('#reject-call-btn');

  let callTimerInterval = null;
  let callSeconds = 0;
  let pendingOffer = null;
  let callTarget = null;

  function startCallTimer() {
    callSeconds = 0;
    callTimer.textContent = '00:00';
    callTimerInterval = setInterval(() => {
      callSeconds++;
      const m = String(Math.floor(callSeconds / 60)).padStart(2, '0');
      const s = String(callSeconds % 60).padStart(2, '0');
      callTimer.textContent = `${m}:${s}`;
    }, 1000);
  }

  function stopCallTimer() {
    if (callTimerInterval) clearInterval(callTimerInterval);
    callTimerInterval = null;
  }

  function buildFilterPicker() {
    const filters = window.RakshaCall.FILTERS;
    filterList.innerHTML = Object.keys(filters).map(key => {
      const f = filters[key];
      return `<div class="filter-chip ${key === 'none' ? 'active' : ''}" data-filter="${key}">${f.icon} ${f.name}</div>`;
    }).join('');

    filterList.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        filterList.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        window.RakshaCall.setFilter(chip.dataset.filter);
      });
    });
  }

  function showCallUI(remoteName) {
    callOverlay.classList.remove('hidden');
    callRemoteName.textContent = remoteName;
    callTarget = remoteName;
    buildFilterPicker();
    startCallTimer();
  }

  function endVideoCall(notify = true) {
    if (notify && callTarget && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'call_end', to: callTarget }));
    }
    window.RakshaCall.endCall();
    callOverlay.classList.add('hidden');
    incomingCallModal.classList.add('hidden');
    filterPicker.classList.add('hidden');
    stopCallTimer();
    callTarget = null;
    pendingOffer = null;
    // Reset button states
    callMuteBtn.classList.remove('muted');
    callMuteBtn.querySelector('span').textContent = 'Mute';
    callVideoBtn.classList.remove('muted');
    callVideoBtn.querySelector('span').textContent = 'Video';
    callFilterBtn.classList.remove('active');
  }

  async function initiateCall(targetUser) {
    if (!window.RakshaCall) { showToast('Video call module not loaded', 'error'); return; }
    try {
      showToast('Starting video call...');
      const stream = await window.RakshaCall.startLocalStream();
      localVideoRaw.srcObject = stream;
      localVideoRaw.classList.remove('hidden');
      window.RakshaCall.startFilterRendering(localVideoRaw, localFilterCanvas);

      showCallUI(targetUser);

      window.RakshaCall.createPeerConnection(
        (candidate) => {
          ws.send(JSON.stringify({ type: 'ice_candidate', to: targetUser, candidate }));
        },
        (remoteStream) => {
          remoteVideo.srcObject = remoteStream;
          $('#remote-no-video').classList.add('hidden');
        }
      );

      const offer = await window.RakshaCall.createOffer();
      ws.send(JSON.stringify({ type: 'call_offer', to: targetUser, offer }));
    } catch (e) {
      showToast('Failed to start call: ' + e.message, 'error');
      endVideoCall(false);
    }
  }

  function handleIncomingCall(data) {
    pendingOffer = data;
    incomingCallName.textContent = data.from;
    incomingCallAvatar.textContent = data.from[0].toUpperCase();
    incomingCallModal.classList.remove('hidden');
  }

  acceptCallBtn.addEventListener('click', async () => {
    if (!pendingOffer) return;
    incomingCallModal.classList.add('hidden');
    const caller = pendingOffer.from;

    try {
      const stream = await window.RakshaCall.startLocalStream();
      localVideoRaw.srcObject = stream;
      localVideoRaw.classList.remove('hidden');
      window.RakshaCall.startFilterRendering(localVideoRaw, localFilterCanvas);

      showCallUI(caller);

      window.RakshaCall.createPeerConnection(
        (candidate) => {
          ws.send(JSON.stringify({ type: 'ice_candidate', to: caller, candidate }));
        },
        (remoteStream) => {
          remoteVideo.srcObject = remoteStream;
          $('#remote-no-video').classList.add('hidden');
        }
      );

      const answer = await window.RakshaCall.handleOffer(pendingOffer.offer);
      ws.send(JSON.stringify({ type: 'call_answer', to: caller, answer }));
      pendingOffer = null;
    } catch (e) {
      showToast('Failed to accept call', 'error');
      endVideoCall(false);
    }
  });

  rejectCallBtn.addEventListener('click', () => {
    if (pendingOffer) {
      ws.send(JSON.stringify({ type: 'call_reject', to: pendingOffer.from }));
      pendingOffer = null;
    }
    incomingCallModal.classList.add('hidden');
  });

  videoCallBtn.addEventListener('click', () => {
    if (!activeChat) return;
    const user = users[activeChat];
    if (!user || !user.online) {
      showToast('User is offline', 'error');
      return;
    }
    initiateCall(activeChat);
  });

  callMuteBtn.addEventListener('click', () => {
    const muted = window.RakshaCall.toggleMute();
    callMuteBtn.classList.toggle('muted', muted);
    callMuteBtn.querySelector('span').textContent = muted ? 'Unmute' : 'Mute';
  });

  callVideoBtn.addEventListener('click', () => {
    const off = window.RakshaCall.toggleVideo();
    callVideoBtn.classList.toggle('muted', off);
    callVideoBtn.querySelector('span').textContent = off ? 'Show' : 'Video';
    $('#local-no-video').classList.toggle('hidden', !off);
    localFilterCanvas.classList.toggle('hidden', off);
  });

  callFilterBtn.addEventListener('click', () => {
    filterPicker.classList.toggle('hidden');
    callFilterBtn.classList.toggle('active');
  });

  callEndBtn.addEventListener('click', () => endVideoCall(true));

  // ─── Init ───
  initMatrix();
  initParticles();
})();
