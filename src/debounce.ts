export function debounce<T extends (...args: never[]) => unknown>(
    func: T,
    delay: number,
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
    let timeoutId: number | undefined = undefined
    const debounced = (...args: Parameters<T>) => {
        window.clearTimeout(timeoutId)
        timeoutId = window.setTimeout(() => {
            timeoutId = undefined
            func(...args)
        }, delay)
    }
    debounced.cancel = () => {
        window.clearTimeout(timeoutId)
        timeoutId = undefined
    }
    return debounced
}
