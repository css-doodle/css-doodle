import { unique } from '../utils/list.js';

let embedFonts = new Map();
let linkFonts = new Set();

function getGoogleFontLink(names) {
    if (!Array.isArray(names)) {
        names = [names];
    }
    /* the v1 css endpoint only honors the first `family` param, so join with a pipe */
    let params = names.map(encodeURIComponent).join('%7C');
    return `https://fonts.googleapis.com/css?display=swap&family=${params}`;
}

export function loadGoogleFontLink(fonts) {
    let names = [];
    if (!Array.isArray(fonts)) {
        return Promise.resolve();
    }
    for (let name of fonts) {
        if (linkFonts.has(name)) {
            continue;
        }
        linkFonts.add(name);
        names.push(name);
    }
    if (!names.length) {
        return Promise.resolve();
    }

    if (typeof document !== 'undefined') {
        return new Promise(resolve => {
            let link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = getGoogleFontLink(names);
            link.onload = resolve;
            link.onerror = resolve;
            document.head.appendChild(link);
        });
    }
    return Promise.resolve();
}

async function fetchCSS(names) {
    let res = await fetch(getGoogleFontLink(names));
    if (!res.ok) throw new Error(`Failed to fetch fonts: ${res.status}`);
    return res.text();
}

function extractFonts(css) {
    let blockRegex = /@font-face\s*{([^}]+)}/gi;
    let fonts = [];
    let seen = new Map();

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
    if (!family || !url) continue;

    let font = {
      family,
      url,
      weight: getProp('font-weight') || '400',
      style: getProp('font-style') || 'normal',
      range: getProp('unicode-range')
    };

    /* variable fonts reuse one file for multiple weights; merge them into a weight range */
    let key = [family, font.style, font.range, url].join('|');
    let prev = seen.get(key);
    if (prev) {
      let weights = prev.weight.split(' ').concat(font.weight.split(' ')).map(Number);
      let min = Math.min(...weights);
      let max = Math.max(...weights);
      prev.weight = (min === max) ? String(min) : `${min} ${max}`;
    } else {
      seen.set(key, font);
      fonts.push(font);
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
  try {
    let css = await fetchCSS(unique(names));
    let fonts = extractFonts(css);
    let embedded = await Promise.all(
      fonts.map(async ({ family, url, weight, style, range }) => {
        let base64 = await toBase64(url);
        let rangeRule = range ? `unicode-range:${range};` : '';
        return `@font-face{font-family:"${family}";font-weight:${weight};font-style:${style};${rangeRule}src:url("data:font/woff2;base64,${base64}") format("woff2");}`;
      })
    );
    return embedded.join('\n');
  } catch (error) {
    console.warn('Error loading fonts:', error);
    return '';
  }
}
