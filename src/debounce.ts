export function debounce<T extends (...args: never[]) => unknown>(
    func: T,
    delay: number,
): (...args: Parameters<T>) => void {
    let timeoutId: number | undefined = undefined
    return function (...args: Parameters<T>) {
        clearTimeout(timeoutId)
        timeoutId = setTimeout(() => func(...args), delay)
    }
}
