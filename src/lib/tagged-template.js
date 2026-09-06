function identity(strings, ...values) {
    let out = strings[0];
    for (let i = 0; i < values.length; i++) {
        out += values[i] + strings[i + 1];
    }
    return out.trim();
}

export {
    identity as css,
    identity as svg,
    identity as glsl
};
