export function cellId(x, y, z) {
  return 'c-' + x + '-' + y + '-' + z;
}

export function cellMetrics(x, y, grid) {
  let dx = x - .5 - grid.x / 2;
  let dy = y - .5 - grid.y / 2;
  let ax = Math.abs(dx);
  let ay = Math.abs(dy);
  return {
    dx, dy,
    dr: Math.sqrt(dx * dx + dy * dy),
    dc: Math.max(ax, ay),
    dm: ax + ay,
    da: Math.atan2(dy, dx),
    db: Math.min(x - 1, grid.x - x, y - 1, grid.y - y),
  };
}
