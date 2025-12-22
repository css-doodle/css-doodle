import { unique } from './index.js';

let embedFonts = new Map();
let linkFonts = new Set();

function getGoogleFontLink(names) {
  if (!Array.isArray(names)) {
    names = [names];
  }
  let params = names.map(n => `family=${encodeURIComponent(n)}`).join('&');
  return `https://fonts.googleapis.com/css?display=swap&${params}`;
}

export function loadGoogleFontLink(fonts) {
  let names = [];
  if (!Array.isArray(fonts)) {
    return;
  }
  for (let name of fonts) {
    if (linkFonts.has(name)) {
      continue;
    }
    linkFonts.add(name);
    names.push(name);
  }
  if (!names.length) {
    return;
  }

  if (typeof document !== 'undefined') {
    let link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = getGoogleFontLink(names);
    document.head.appendChild(link);
  }
}

async function fetchCSS(names) {
  let res = await fetch(getGoogleFontLink(names));
  if (!res.ok) throw new Error(`Failed to fetch fonts: ${res.status}`);
  return res.text();
}

function extractFonts(css) {
  let blockRegex = /@font-face\s*{([^}]+)}/gi;
  let fonts = [];
  let seenUrls = new Set();

  let match;
  while ((match = blockRegex.exec(css)) !== null) {
    let content = match[1];

    let getProp = (prop) => {
      let re = new RegExp(`${prop}:\\s*['"]?([^'";\\)]+)['"]?`, 'i');
      let res = content.match(re);
      return res ? res[1].trim() : null;
    };

    let urlMatch = content.match(/url\(([^)]+)\)/i);
    let url = urlMatch ? urlMatch[1].replace(/['"]/g, '') : null;
    let family = getProp('font-family');

    if (family && url && !seenUrls.has(url)) {
      seenUrls.add(url);
      fonts.push({
        family,
        url,
        weight: getProp('font-weight') || '400',
        style: getProp('font-style') || 'normal'
      });
    }
  }

  if (!fonts.length) throw new Error('No fonts found in CSS');
  return fonts;
}

async function toBase64(url) {
  let cached = embedFonts.get(url);
  if (cached) return cached;
  let res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch font (${res.status}): ${url}`);
  let blob = await res.blob();
  let base64 = await new Promise((resolve, reject) => {
    let reader = new FileReader();
    reader.onloadend = () => {
      let data = reader.result.split(',')[1];
      resolve(data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  embedFonts.set(url, base64);
  return base64;
}

export async function loadGoogleFontEmbed(names = Array.from(linkFonts)) {
  if (!Array.isArray(names) || !names.length) return '';
  let filtered = unique(names);
  if (!filtered.length)  return '';
  try {
    let css = await fetchCSS(filtered);
    let fonts = extractFonts(css);
    let embedded = await Promise.all(
      fonts.map(async ({ family, url }) => {
        let base64 = await toBase64(url);
        return `@font-face {\n  font-family: "${family}";\n  src: url("data:font/woff2;base64,${base64}") format("woff2");\n}`;
      })
    );
    return embedded.join('\n');
  } catch (error) {
    console.warn('Error loading fonts:', error);
    return '';
  }
}
