import { pickPhoto } from './wikimedia'

test('pickPhoto skips maps, plans and vector files for the first real photograph', () => {
  const pages = [
    { title: 'File:Boston map.svg', imageinfo: [{ thumburl: 'a' }] },
    { title: 'File:Station plan.png', imageinfo: [{ thumburl: 'b' }] },
    { title: 'File:North Station facade.jpg', imageinfo: [{ thumburl: 'c' }] },
  ]
  expect(pickPhoto(pages)).toBe('c')
  expect(pickPhoto([])).toBeNull()
})
