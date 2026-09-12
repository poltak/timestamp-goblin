import { debounce } from './debounce'

export type UrlChangeHandler = () => void

const subscribers = new Set<UrlChangeHandler>()
let restoreHistory: (() => void) | null = null

function patchHistory(): void {
    if (restoreHistory) return
    const originalPushState = history.pushState
    const originalReplaceState = history.replaceState
    const dispatch = () => subscribers.forEach((handler) => handler())

    const pushState: History['pushState'] = (...args) => {
        const result = originalPushState.apply(history, args)
        dispatch()
        return result
    }

    const replaceState: History['replaceState'] = (...args) => {
        const result = originalReplaceState.apply(history, args)
        dispatch()
        return result
    }
    history.pushState = pushState
    history.replaceState = replaceState
    restoreHistory = () => {
        if (history.pushState === pushState)
            history.pushState = originalPushState
        if (history.replaceState === replaceState)
            history.replaceState = originalReplaceState
        restoreHistory = null
    }
}

export function watchUrlChanges(
    handler: UrlChangeHandler,
    options: { debounceMs: number },
): () => void {
    const debounced = debounce(handler, options.debounceMs)

    subscribers.add(debounced)
    patchHistory()
    window.addEventListener('popstate', debounced)

    return () => {
        subscribers.delete(debounced)
        window.removeEventListener('popstate', debounced)
        debounced.cancel()
        if (subscribers.size === 0) restoreHistory?.()
    }
}
