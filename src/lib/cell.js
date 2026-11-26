export function cellId(x, y, z) {
    return 'c-' + x + '-' + y + '-' + z;
}

export function isTreeGrid(grid) {
    return grid.z > 1 && grid.x * grid.y > 1;
}

export function cellVariables({ x, y, z, count, grid }) {
    return {
        x, y, z, X: grid.x, Y: grid.y, Z: grid.z, i: count, I: grid.count,
        dx: x - .5 - grid.x / 2,
        dy: y - .5 - grid.y / 2,
    };
}
