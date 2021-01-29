const uniform_time = {
  'name': 'cssd-uniform-time',
  'animation-name': 'cssd-uniform-time-animation',
  'animation-duration': '31536000000', /* one year in ms */
  'animation-iteration-count': 'infinite',
  'animation-delay': '0s',
  'animation-direction': 'normal',
  'animation-fill-mode': 'none',
  'animation-play-state': 'running',
  'animation-timing-function': 'linear',
};

uniform_time['animation'] = `
  ${ uniform_time['animation-duration'] }ms
  ${ uniform_time['animation-timing-function'] }
  ${ uniform_time['animation-delay'] }
  ${ uniform_time['animation-iteration-count'] }
  ${ uniform_time['animation-name'] }
`;

export {
  uniform_time
}
