import { hash, is_nil } from './index';

let _cache = {};

export function clearCache() {
  _cache = {};
}

export function setCache(input, value) {
  if (is_nil(input)) {
    return '';
  }
  let key = getKey(input);
  return _cache[key] = value;
}

export function getCache(input) {
  let key = getKey(input);
  return _cache[key];
}

function getKey(input) {
  return (typeof input === 'string')
    ? hash(input)
    : hash(JSON.stringify(input));
}
