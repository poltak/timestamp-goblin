export function debounce<T extends (...args: never[]) => unknown>(
    func: T,
    delay: number,
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
    let timeoutId: number | undefined = undefined
    const debounced = (...args: Parameters<T>) => {
        clearTimeout(timeoutId)
        timeoutId = setTimeout(() => {
            timeoutId = undefined
            func(...args)
        }, delay)
    }
    debounced.cancel = () => {
        clearTimeout(timeoutId)
        timeoutId = undefined
    }
    return debounced
}
