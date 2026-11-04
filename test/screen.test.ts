import { describe, expect, it } from 'vitest'
import { ScreenModel } from '../src/screen/model.js'

describe('ScreenModel', () => {
  it('renders plain text and trims trailing blank rows', async () => {
    const screen = new ScreenModel({ cols: 20, rows: 5 })
    await screen.write('hello\r\nworld')
    expect(screen.lines()).toEqual(['hello', 'world'])
    screen.dispose()
  })

  it('collapses carriage-return redraws to the final line', async () => {
    const screen = new ScreenModel({ cols: 30, rows: 4 })
    await screen.write('progress 10%\rprogress 55%\rprogress 100%\n')
    expect(screen.lines()).toEqual(['progress 100%'])
    screen.dispose()
  })

  it('joins soft-wrapped rows into one logical line', async () => {
    const screen = new ScreenModel({ cols: 10, rows: 4 })
    await screen.write('abcdefghijklmnop')
    expect(screen.lines()).toEqual(['abcdefghijklmnop'])
    screen.dispose()
  })

  it('homes the cursor when entering the alternate screen', async () => {
    const screen = new ScreenModel({ cols: 20, rows: 6 })
    await screen.write('one\r\ntwo')
    await screen.write('\x1b[?1049h')
    await screen.write('X')
    expect(screen.alt).toBe(true)
    expect(screen.lines()[0]).toBe('X')
    screen.dispose()
  })

  it('keeps scrollback for output tails', async () => {
    const screen = new ScreenModel({ cols: 20, rows: 3, scrollback: 50 })
    await screen.write('l1\r\nl2\r\nl3\r\nl4\r\nl5\r\nl6')
    expect(screen.tail(3)).toEqual(['l4', 'l5', 'l6'])
    screen.dispose()
  })

  it('drops suggestion text painted after the cursor', async () => {
    const screen = new ScreenModel({ cols: 40, rows: 4 })
    await screen.write('$ ls')
    await screen.write('\x1b[90m -la\x1b[0m')
    await screen.write('\x1b[5G')
    expect(screen.lines()[0]).toBe('$ ls')
    screen.dispose()
  })

  it('keeps suggestion-like text when it is the cursor line content', async () => {
    const screen = new ScreenModel({ cols: 40, rows: 4 })
    await screen.write('\x1b[90mdim output\x1b[0m')
    expect(screen.lines()[0]).toBe('dim output')
    screen.dispose()
  })

  it('serialises the screen for a browser attach', async () => {
    const screen = new ScreenModel({ cols: 20, rows: 4 })
    await screen.write('colored')
    const serialized = screen.serialize()
    expect(serialized).toContain('colored')
    screen.dispose()
  })
})
