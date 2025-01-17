function toSorted(comparefn, xs) {
    const result = Array.from(xs)
    result.sort(comparefn)
    return result
}