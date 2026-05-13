const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, maxPayload: 50 * 1024 * 1024 });

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// In-memory store
const users = new Map();       // username -> { ws, publicKey, online, avatar }
const messages = new Map();    // recipientId -> [messages]
const sessions = new Map();    // sessionId -> username

/**
 * Broadcast user list update to all connected clients
 */
function broadcastUserList() {
  const userList = [];
  users.forEach((data, username) => {
    userList.push({
      username,
      online: data.online,
      publicKey: data.publicKey,
      avatar: data.avatar || null
    });
  });

  const payload = JSON.stringify({
    type: 'user_list',
    users: userList
  });

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

/**
 * Send pending messages to a user who just came online
 */
function deliverPendingMessages(username) {
  const pending = messages.get(username) || [];
  const userData = users.get(username);
  if (!userData || !userData.ws) return;

  pending.forEach(msg => {
    userData.ws.send(JSON.stringify(msg));
  });
  messages.set(username, []);
}

wss.on('connection', (ws) => {
  let currentUser = null;
  let sessionId = uuidv4();

  ws.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    switch (data.type) {
      case 'register': {
        const { username, publicKey } = data;

        if (!username || !publicKey) {
          ws.send(JSON.stringify({ type: 'error', message: 'Username and public key required' }));
          return;
        }

        // Check if user already exists and is online
        if (users.has(username) && users.get(username).online) {
          ws.send(JSON.stringify({ type: 'error', message: 'Username already taken and online' }));
          return;
        }

        currentUser = username;
        sessions.set(sessionId, username);
        const existingAvatar = users.has(username) ? users.get(username).avatar : null;
        users.set(username, {
          ws,
          publicKey,
          online: true,
          avatar: data.avatar || existingAvatar
        });

        ws.send(JSON.stringify({
          type: 'registered',
          username,
          sessionId
        }));

        // Deliver any pending messages
        deliverPendingMessages(username);
        broadcastUserList();
        break;
      }

      case 'message': {
        const { to, encryptedMessage, encryptedKey, iv, timestamp, messageId, fileMetadata } = data;

        if (!to || !encryptedMessage) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
          return;
        }

        const msgPayload = {
          type: 'message',
          from: currentUser,
          encryptedMessage,
          encryptedKey,
          iv,
          timestamp: timestamp || Date.now(),
          messageId: messageId || uuidv4(),
          fileMetadata: fileMetadata || null
        };

        const recipient = users.get(to);
        if (recipient && recipient.online && recipient.ws.readyState === WebSocket.OPEN) {
          // Deliver immediately
          recipient.ws.send(JSON.stringify(msgPayload));
          // Confirm delivery to sender
          ws.send(JSON.stringify({
            type: 'delivered',
            messageId: msgPayload.messageId,
            to
          }));
        } else {
          // Queue for later delivery
          if (!messages.has(to)) messages.set(to, []);
          messages.get(to).push(msgPayload);
          ws.send(JSON.stringify({
            type: 'queued',
            messageId: msgPayload.messageId,
            to
          }));
        }
        break;
      }

      case 'typing': {
        const { to } = data;
        const recipient = users.get(to);
        if (recipient && recipient.online && recipient.ws.readyState === WebSocket.OPEN) {
          recipient.ws.send(JSON.stringify({
            type: 'typing',
            from: currentUser
          }));
        }
        break;
      }

      case 'stop_typing': {
        const { to } = data;
        const recipient = users.get(to);
        if (recipient && recipient.online && recipient.ws.readyState === WebSocket.OPEN) {
          recipient.ws.send(JSON.stringify({
            type: 'stop_typing',
            from: currentUser
          }));
        }
        break;
      }

      case 'get_public_key': {
        const { username } = data;
        const user = users.get(username);
        if (user) {
          ws.send(JSON.stringify({
            type: 'public_key',
            username,
            publicKey: user.publicKey
          }));
        }
        break;
      }

      case 'ping': {
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      }

      case 'update_avatar': {
        const { avatar } = data;
        if (currentUser && users.has(currentUser)) {
          users.get(currentUser).avatar = avatar;
          broadcastUserList();
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (currentUser && users.has(currentUser)) {
      users.get(currentUser).online = false;
      users.get(currentUser).ws = null;
      broadcastUserList();
    }
    sessions.delete(sessionId);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════════╗`);
  console.log(`  ║    🔒 VaultChat Server Running           ║`);
  console.log(`  ║    ─────────────────────────────         ║`);
  console.log(`  ║    Port: ${PORT}                            ║`);
  console.log(`  ║    URL:  http://localhost:${PORT}           ║`);
  console.log(`  ║    E2E Encryption: ACTIVE                ║`);
  console.log(`  ╚══════════════════════════════════════════╝\n`);
});
