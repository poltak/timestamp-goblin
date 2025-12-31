type UrlChangeHandler = () => void

let patched = false
let originalPushState: History['pushState'] | null = null
let originalReplaceState: History['replaceState'] | null = null

function patchHistory(dispatch: () => void): void {
    if (patched) {
        return
    }
    patched = true
    originalPushState = history.pushState
    originalReplaceState = history.replaceState

    history.pushState = function (...args) {
        const result = originalPushState!.apply(this, args as any)
        dispatch()
        return result
    } as History['pushState']

    history.replaceState = function (...args) {
        const result = originalReplaceState!.apply(this, args as any)
        dispatch()
        return result
    } as History['replaceState']
}

export function watchUrlChanges(
    handler: UrlChangeHandler,
    debounceMs = 150,
): () => void {
    let timer: number | null = null

    const debounced = () => {
        if (timer !== null) {
            window.clearTimeout(timer)
        }
        timer = window.setTimeout(() => {
            timer = null
            handler()
        }, debounceMs)
    }

    patchHistory(debounced)
    window.addEventListener('popstate', debounced)

    return () => {
        if (timer !== null) {
            window.clearTimeout(timer)
            timer = null
        }
        window.removeEventListener('popstate', debounced)
    }
}
