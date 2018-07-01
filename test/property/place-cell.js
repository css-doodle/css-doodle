import property from '../../src/property';

const getValue = (value) => {
  let reg = /(left|top).*;/g
  let result = property['@place-cell'](value)

  return result
    .match(reg)
    .map((str) => {
      return str.match(/\d+\% \* 2/)[0].replace(/(\d\%).*/, '$1')
    })
    .join(' ')
}

describe('property', () => {

  describe('@place-cell', () => {

    it(`should covert '0' to '0% 50%'`, () => {
      let match = getValue('0');
      expect(match).toEqual('0% 50%');
    })

    it(`should covert 'left top' to '0% 0%'`, () => {
      let match = getValue('left top');
      expect(match).toEqual('0% 0%');
    })

    it(`should covert 'right bottom' to '100% 100%'`, () => {
      let match = getValue('right bottom');
      expect(match).toEqual('100% 100%');
    });

  });

});
