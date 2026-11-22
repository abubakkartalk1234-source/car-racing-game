import * as THREE from 'three';

export function createRoadTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Base asphalt dark slate
  ctx.fillStyle = '#252830';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle asphalt aggregate grain
  for (let i = 0; i < 14000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = 30 + Math.floor(Math.random() * 28);
    ctx.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Subtle dark tire-wear grooves down the 4 lane centers
  const laneCenters = [104, 205, 307, 408];
  for (const cx of laneCenters) {
    const grad = ctx.createLinearGradient(cx - 28, 0, cx + 28, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, 'rgba(10,12,16,0.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - 28, 0, 56, 512);
  }

  // Concrete shoulder strips on left & right edges
  ctx.fillStyle = '#3b3f4a';
  ctx.fillRect(0, 0, 46, 512);
  ctx.fillRect(466, 0, 46, 512);

  // Solid amber/yellow edge lines
  ctx.fillStyle = '#eab308';
  ctx.fillRect(48, 0, 7, 512);
  ctx.fillRect(457, 0, 7, 512);

  // Dashed white lane dividers (3 inner dividers for 4 lanes)
  const dividers = [154, 256, 358];
  ctx.fillStyle = '#e5e7eb';
  for (const dx of dividers) {
    // 2 dashes per 512px tile
    ctx.fillRect(dx - 3, 28, 6, 175);
    ctx.fillRect(dx - 3, 284, 6, 175);
  }

  // Center double subtle reflective studs
  ctx.fillStyle = '#facc15';
  ctx.fillRect(253, 28, 6, 12);
  ctx.fillRect(253, 284, 6, 12);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 6);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

export function createBuildingTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1b202c';
  ctx.fillRect(0, 0, 256, 512);

  const cols = 8;
  const rows = 20;
  const padX = 8;
  const padY = 8;
  const cellW = (256 - padX * 2) / cols;
  const cellH = (512 - padY * 2) / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = Math.random();
      if (lit > 0.62) {
        ctx.fillStyle = lit > 0.86 ? '#fde68a' : '#93c5fd';
      } else {
        ctx.fillStyle = '#0f131b';
      }
      ctx.fillRect(
        padX + c * cellW + 3,
        padY + r * cellH + 3,
        cellW - 6,
        cellH - 7,
      );
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

export function createBarrierTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f97316';
  ctx.fillRect(0, 0, 256, 128);

  ctx.fillStyle = '#f8fafc';
  for (let i = -128; i < 384; i += 48) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 24, 0);
    ctx.lineTo(i - 40, 128);
    ctx.lineTo(i - 64, 128);
    ctx.closePath();
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

export function createFinishBannerTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Checkered racing top & bottom border
  const sq = 32;
  for (let x = 0; x < 1024; x += sq) {
    for (let y = 0; y < 256; y += sq) {
      if (y < 48 || y >= 208) {
        const even = ((x / sq) + (y / sq)) % 2 === 0;
        ctx.fillStyle = even ? '#facc15' : '#090b10';
        ctx.fillRect(x, y, sq, sq);
      }
    }
  }

  ctx.fillStyle = '#090b10';
  ctx.fillRect(0, 48, 1024, 160);

  ctx.fillStyle = '#facc15';
  ctx.font = 'bold 74px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('10 KM FINISH', 512, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(128, 128, 16, 128, 128, 124);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.82)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.45)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
