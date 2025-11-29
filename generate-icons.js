const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Crear directorio de íconos si no existe
const iconsDir = path.join(__dirname, 'public', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Tamaños requeridos para PWA
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

// Crear un ícono simple programáticamente
async function generateIcons() {
  const svg = `
    <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#2563eb;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#7c3aed;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="100" fill="url(#gradient)"/>
      <text x="256" y="256" font-family="Arial, sans-serif" font-size="200" 
            font-weight="bold" fill="white" text-anchor="middle" 
            dominant-baseline="middle">SC</text>
    </svg>
  `;

  for (const size of sizes) {
    await sharp(Buffer.from(svg))
      .resize(size, size)
      .png()
      .toFile(path.join(iconsDir, `icon-${size}x${size}.png`));
    
    console.log(`Ícono ${size}x${size} generado`);
  }

  console.log('Todos los íconos generados exitosamente');
}

generateIcons().catch(console.error);