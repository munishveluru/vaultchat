/**
 * Raksha — WebRTC Video Calling with Filters
 */
window.RakshaCall = (function () {
  let localStream = null;
  let peerConnection = null;
  let filterCanvas = null;
  let filterCtx = null;
  let filterVideo = null;
  let filterRAF = null;
  let currentFilter = 'none';
  let isCallActive = false;
  let isMuted = false;
  let isVideoOff = false;

  const ICE_SERVERS = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  };

  // ─── Filters ───
  const FILTERS = {
    none: { name: 'Normal', icon: '🎥', apply: (ctx, w, h) => {} },
    grayscale: {
      name: 'Grayscale', icon: '⬛',
      apply: (ctx, w, h) => {
        const img = ctx.getImageData(0, 0, w, h);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const avg = d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114;
          d[i] = d[i+1] = d[i+2] = avg;
        }
        ctx.putImageData(img, 0, 0);
      }
    },
    sepia: {
      name: 'Sepia', icon: '🟤',
      apply: (ctx, w, h) => {
        const img = ctx.getImageData(0, 0, w, h);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i+1], b = d[i+2];
          d[i]   = Math.min(255, r*0.393 + g*0.769 + b*0.189);
          d[i+1] = Math.min(255, r*0.349 + g*0.686 + b*0.168);
          d[i+2] = Math.min(255, r*0.272 + g*0.534 + b*0.131);
        }
        ctx.putImageData(img, 0, 0);
      }
    },
    nightvision: {
      name: 'Night Vision', icon: '🟢',
      apply: (ctx, w, h) => {
        const img = ctx.getImageData(0, 0, w, h);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const avg = (d[i] + d[i+1] + d[i+2]) / 3;
          d[i] = 0;
          d[i+1] = Math.min(255, avg * 1.5);
          d[i+2] = 0;
        }
        ctx.putImageData(img, 0, 0);
      }
    },
    matrix: {
      name: 'Matrix', icon: '💚',
      apply: (ctx, w, h) => {
        const img = ctx.getImageData(0, 0, w, h);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const brightness = (d[i] + d[i+1] + d[i+2]) / 3;
          d[i] = brightness * 0.1;
          d[i+1] = Math.min(255, brightness * 1.2 + 30);
          d[i+2] = brightness * 0.1;
          // Add scanlines
          const y = Math.floor((i / 4) / w);
          if (y % 3 === 0) { d[i] *= 0.7; d[i+1] *= 0.7; d[i+2] *= 0.7; }
        }
        ctx.putImageData(img, 0, 0);
      }
    },
    invert: {
      name: 'Invert', icon: '🔄',
      apply: (ctx, w, h) => {
        const img = ctx.getImageData(0, 0, w, h);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          d[i] = 255 - d[i];
          d[i+1] = 255 - d[i+1];
          d[i+2] = 255 - d[i+2];
        }
        ctx.putImageData(img, 0, 0);
      }
    },
    warm: {
      name: 'Warm', icon: '🌅',
      apply: (ctx, w, h) => {
        const img = ctx.getImageData(0, 0, w, h);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          d[i]   = Math.min(255, d[i] + 30);
          d[i+1] = Math.min(255, d[i+1] + 10);
          d[i+2] = Math.max(0, d[i+2] - 20);
        }
        ctx.putImageData(img, 0, 0);
      }
    },
    cool: {
      name: 'Cool', icon: '❄️',
      apply: (ctx, w, h) => {
        const img = ctx.getImageData(0, 0, w, h);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          d[i]   = Math.max(0, d[i] - 20);
          d[i+1] = Math.min(255, d[i+1] + 5);
          d[i+2] = Math.min(255, d[i+2] + 30);
        }
        ctx.putImageData(img, 0, 0);
      }
    }
  };

  // ─── Filter rendering loop ───
  function renderFilterFrame() {
    if (!filterVideo || !filterCanvas || !filterCtx) return;
    const w = filterCanvas.width;
    const h = filterCanvas.height;

    filterCtx.drawImage(filterVideo, 0, 0, w, h);

    if (currentFilter !== 'none' && FILTERS[currentFilter]) {
      FILTERS[currentFilter].apply(filterCtx, w, h);
    }

    filterRAF = requestAnimationFrame(renderFilterFrame);
  }

  function startFilterRendering(videoEl, canvasEl) {
    filterVideo = videoEl;
    filterCanvas = canvasEl;
    filterCtx = canvasEl.getContext('2d', { willReadFrequently: true });
    filterCanvas.width = 640;
    filterCanvas.height = 480;
    renderFilterFrame();
  }

  function stopFilterRendering() {
    if (filterRAF) cancelAnimationFrame(filterRAF);
    filterRAF = null;
  }

  return {
    FILTERS,
    get isActive() { return isCallActive; },
    get isMuted() { return isMuted; },
    get isVideoOff() { return isVideoOff; },
    get currentFilter() { return currentFilter; },

    setFilter(name) {
      if (FILTERS[name]) currentFilter = name;
    },

    async startLocalStream() {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: true
        });
        return localStream;
      } catch (e) {
        console.error('Camera access denied:', e);
        throw e;
      }
    },

    getLocalStream() { return localStream; },

    createPeerConnection(onIceCandidate, onRemoteStream) {
      peerConnection = new RTCPeerConnection(ICE_SERVERS);

      // Add local tracks
      if (localStream) {
        localStream.getTracks().forEach(track => {
          peerConnection.addTrack(track, localStream);
        });
      }

      peerConnection.onicecandidate = (e) => {
        if (e.candidate) onIceCandidate(e.candidate);
      };

      peerConnection.ontrack = (e) => {
        if (e.streams && e.streams[0]) onRemoteStream(e.streams[0]);
      };

      peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE state:', peerConnection.iceConnectionState);
      };

      isCallActive = true;
      return peerConnection;
    },

    async createOffer() {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      return offer;
    },

    async handleOffer(offer) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      return answer;
    },

    async handleAnswer(answer) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    },

    async addIceCandidate(candidate) {
      if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    },

    toggleMute() {
      if (localStream) {
        localStream.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
        isMuted = !isMuted;
      }
      return isMuted;
    },

    toggleVideo() {
      if (localStream) {
        localStream.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
        isVideoOff = !isVideoOff;
      }
      return isVideoOff;
    },

    startFilterRendering,
    stopFilterRendering,

    endCall() {
      stopFilterRendering();
      if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
      }
      if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
      }
      isCallActive = false;
      isMuted = false;
      isVideoOff = false;
      currentFilter = 'none';
    }
  };
})();
