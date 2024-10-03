function chunk<T>(array: T[], size) {
    return Array.from<T, T[]>({ length: Math.ceil(array.length / size) }, (value, index) => array.slice(index * size, index * size + size));
}

export async function doInBatch<T, U>(array: T[], handler: (T, index: number) => Promise<U>, chunkSize: number = 5) {
    const chunks = chunk(array, chunkSize);
    const result: U[] = [];
    // we use allSettled to wait for all even if one failed
    // that way we are sure we are finished on error and we can handle things correctly
    const promises = chunks.map((s, i) => () => Promise.allSettled(s.map((value, j) => handler(value, i * chunkSize + j))));
    for (let index = 0; index < promises.length; index++) {
        const subResult = await promises[index]();
        const firstError = subResult.find((s) => s.status === 'rejected')?.['reason'];
        if (firstError) {
            throw firstError;
        }
        const values: U[] = subResult.map((s) => s['value']);
        result.push(...values);
    }
    return result;
}
