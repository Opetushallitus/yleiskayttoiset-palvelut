function groupBy(items, callbackFn) {
    const obj = Object.create(null)
    let i = 0
    for (const value of items) {
        const key = callbackFn(value, i++)
        if (key in obj) {
            obj[key].push(value)
        } else {
            obj[key] = [value]
        }
    }
    return obj
}