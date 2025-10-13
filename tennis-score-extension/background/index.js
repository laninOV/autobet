// MV3 service worker: set a red-yellow icon programmatically

function makeIconImageData(size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  // Clear with transparent
  ctx.clearRect(0, 0, size, size);

  // Circle clip
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, Math.floor(size * 0.46), 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  // Red -> Yellow diagonal gradient
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#e11d48'); // red-600
  grad.addColorStop(1, '#f59e0b'); // amber-500
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Small inner highlight
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  ctx.arc(size * 0.35, size * 0.35, size * 0.20, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.globalAlpha = 1;

  // Subtle ring
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, Math.floor(size * 0.46), 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = Math.max(1, Math.floor(size * 0.06));
  ctx.stroke();

  const img = ctx.getImageData(0, 0, size, size);
  return img;
}

async function setIcons() {
  try {
    const imageData = {
      16: makeIconImageData(16),
      32: makeIconImageData(32),
      48: makeIconImageData(48),
      128: makeIconImageData(128)
    };
    await chrome.action.setIcon({ imageData });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Failed to set dynamic icon:', e);
  }
}

chrome.runtime.onInstalled.addListener(() => { setIcons(); });
chrome.runtime.onStartup.addListener(() => { setIcons(); });

