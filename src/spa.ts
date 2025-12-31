import { debounce } from './debounce'

export type UrlChangeHandler = () => void

let isPatched = false

function patchHistory(dispatch: () => void): void {
    if (isPatched) {
        return
    }
    isPatched = true
    const originalPushState = history.pushState
    const originalReplaceState = history.replaceState

    history.pushState = (...args) => {
        const result = originalPushState.apply(history, args)
        dispatch()
        return result
    }

    history.replaceState = (...args) => {
        const result = originalReplaceState.apply(history, args)
        dispatch()
        return result
    }
}

export function watchUrlChanges(
    handler: UrlChangeHandler,
    options: { debounceMs: number },
): () => void {
    const debounced = debounce(handler, options.debounceMs)

    patchHistory(debounced)
    window.addEventListener('popstate', debounced)

    return () => window.removeEventListener('popstate', debounced)
}
