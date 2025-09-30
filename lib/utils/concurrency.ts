export function createLimiter(concurrency: number) {
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error('Concurrency must be a positive integer')
  }

  let active = 0
  const queue: Array<() => void> = []

  const dequeue = () => {
    if (active >= concurrency) return
    const next = queue.shift()
    if (next) {
      next()
    }
  }

  return async function limit<T>(task: () => Promise<T>): Promise<T> {
    if (active >= concurrency) {
      await new Promise<void>((resolve) => {
        queue.push(resolve)
      })
    }

    active++
    try {
      return await task()
    } finally {
      active--
      dequeue()
    }
  }
}
