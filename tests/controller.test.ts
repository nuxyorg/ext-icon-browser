import { describe, it, expect, vi, beforeEach } from 'vitest'

const hoisted = vi.hoisted(async () => {
  const h = await import('@nuxyorg/extension-sdk/testing')
  h.setupDomGlobals({
    ipc: { invoke: vi.fn() },
    shell: {
      refreshShellActions: vi.fn(),
    },
  })
  return h
})

vi.mock('@nuxyorg/core', async () => {
  const actual = await vi.importActual<typeof import('@nuxyorg/core')>('@nuxyorg/core')
  return (await hoisted).createNuxyCoreMock(actual as Record<string, unknown>)
})

import { flattenTranslations } from '@nuxyorg/core'
import { IconBrowserController } from '../controller.ts'
import en from '../locales/en.json'

const EN = flattenTranslations(en as never)
const flush = () => new Promise((r) => setTimeout(r, 0))

/** IPC mock that serves translations and hands every other call to `impl`. */
function routed(impl: (...args: unknown[]) => Promise<unknown>, translations = EN) {
  return vi.fn(async (ext: string, channel: string, payload?: unknown) =>
    channel === 'getExtensionTranslations'
      ? { success: true, data: { locale: 'en', dir: 'ltr', translations } }
      : impl(ext, channel, payload)
  )
}

/** Calls other than the translation fetch. */
const toolCalls = (invoke: ReturnType<typeof vi.fn>) =>
  invoke.mock.calls.filter((c) => c[1] !== 'getExtensionTranslations')

describe('IconBrowserController.setQuery', () => {
  it('filters icons case-insensitively and resets the active index', () => {
    const controller = new IconBrowserController(() => {})
    controller.store.setState({ icons: ['home', 'search', 'home-alt'], activeIndex: 2 })

    controller.setQuery('Home')

    expect(controller.state.filtered).toEqual(['home', 'home-alt'])
    expect(controller.state.activeIndex).toBe(-1)
  })
})

describe('IconBrowserController.setActiveIndex', () => {
  it('updates the active index in store', () => {
    const controller = new IconBrowserController(() => {})
    controller.setActiveIndex(3)
    expect(controller.state.activeIndex).toBe(3)
  })
})

describe('IconBrowserController.copyActiveName', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as any).UI = { toast: vi.fn() }
  })

  it('invokes copyIconName for the active icon and shows a toast', async () => {
    const invoke = routed(async () => ({ success: true }))
    ;(window as any).core.ipc.invoke = invoke

    const controller = new IconBrowserController(() => {})
    await flush()
    controller.store.setState({ filtered: ['home', 'search'], activeIndex: 1 })

    await controller.copyActiveName()

    expect(invoke).toHaveBeenCalledWith('com.nuxy.icon-browser', 'copyIconName', {
      name: 'search',
    })
    expect((window as any).UI.toast).toHaveBeenCalledWith(
      'Copied "search"',
      expect.objectContaining({ type: 'success' })
    )
  })

  it('does nothing when no icon is active', async () => {
    const invoke = routed(async () => undefined)
    ;(window as any).core.ipc.invoke = invoke

    const controller = new IconBrowserController(() => {})
    controller.store.setState({ filtered: ['home'], activeIndex: -1 })

    await controller.copyActiveName()

    expect(toolCalls(invoke)).toEqual([])
  })
})

describe('IconBrowserController.copyActiveSvg', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as any).UI = { toast: vi.fn() }
  })

  it('invokes copyIconSvg with the cached SVG markup and shows a toast', async () => {
    const invoke = routed(async () => ({ success: true }))
    ;(window as any).core.ipc.invoke = invoke

    const controller = new IconBrowserController(() => {})
    await flush()
    controller.store.setState({ filtered: ['home', 'search'], activeIndex: 1 })
    controller.svgCache.set('search', '<svg id="search"></svg>')

    await controller.copyActiveSvg()

    expect(invoke).toHaveBeenCalledWith('com.nuxy.icon-browser', 'copyIconSvg', {
      svg: '<svg id="search"></svg>',
    })
    expect((window as any).UI.toast).toHaveBeenCalledWith(
      'Copied SVG for "search"',
      expect.objectContaining({ type: 'success' })
    )
  })

  it('does nothing when the active icon has no cached SVG', async () => {
    const invoke = routed(async () => undefined)
    ;(window as any).core.ipc.invoke = invoke

    const controller = new IconBrowserController(() => {})
    controller.store.setState({ filtered: ['home'], activeIndex: 0 })

    await controller.copyActiveSvg()

    expect(toolCalls(invoke)).toEqual([])
  })
})

describe('IconBrowserController.getKeyActions', () => {
  it('exposes Enter (copy name) and Shift+Enter (copy svg) actions active only when an icon is focused', () => {
    const controller = new IconBrowserController(() => {})
    controller.store.setState({ filtered: ['home'], activeIndex: -1 })

    const actions = controller.getKeyActions()
    const enter = actions.find((a) => a.key === 'Enter' && !a.modifiers?.length)
    const shiftEnter = actions.find((a) => a.key === 'Enter' && a.modifiers?.includes('shift'))

    expect(enter).toBeDefined()
    expect(shiftEnter).toBeDefined()
    expect(enter!.activeOn?.()).toBe(false)

    controller.store.setState({ activeIndex: 0 })
    expect(enter!.activeOn?.()).toBe(true)
  })
})

describe('IconBrowserController i18n', () => {
  it('takes its key action labels from the locale files', async () => {
    const marked = Object.fromEntries(Object.entries(EN).map(([k, v]) => [k, `⟦${v}⟧`]))
    ;(window as any).core.ipc.invoke = routed(async () => undefined, marked)
    const controller = new IconBrowserController(() => {})
    await flush()
    const labels = controller.getKeyActions().map((a) => a.label)
    expect(labels).toEqual(['⟦Copy name⟧', '⟦Copy SVG⟧'])
  })
})
