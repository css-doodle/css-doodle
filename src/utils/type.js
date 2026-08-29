export function is_nil(s) {
  return s === undefined || s === null;
}

export function is_invalid_number(v) {
  return is_nil(v) || Number.isNaN(v);
}

export function is_empty(value) {
  return is_nil(value) || value === '';
}

export function is_letter(c) {
  return /^[a-zA-Z]$/.test(c);
}

export function get_value(input) {
  let v = input;
  while (v && !is_nil(v.value)) v = v.value;
  if (typeof v == 'object' && 'value' in v) {
    return v.value ?? '';
  }
  return v ?? '';
}
