/**
 * Creates a streaming fetch function for chat API that uses real-time streaming
 * via IPC communication with the main process
 */
export const createStreamingFetch = () => {
  return async (url: string, options: { body?: any }) => {
    if (url.endsWith('/api/chat')) {
      if (!window.ctg?.chat?.startMessageStream || !window.ctg?.chat?.subscribeToStream) {
        return new Response(JSON.stringify({ error: 'Streaming chat API not available' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      try {
        const body = options.body ? JSON.parse(options.body) : undefined

        // Create a stream ID that will be used for this request
        const streamId = await window.ctg.chat.startMessageStream(body)

        // Create a ReadableStream that will receive chunks from the IPC channel
        const stream = new ReadableStream({
          start(controller) {
            // Subscribe to stream events
            const unsubscribe = window.ctg.chat.subscribeToStream(streamId, {
              onChunk: (chunk: Uint8Array) => {
                try {
                  controller.enqueue(chunk)
                } catch (e) {
                  // Silently handle enqueue errors
                }
              },
              onStart: () => {},
              onError: (error: Error) => {
                // Propagate the error to the stream controller
                controller.error(error)
              },
              onEnd: () => {
                controller.close()
                unsubscribe()
              }
            })
          },
          cancel() {
            // TODO: Inform the backend to potentially cancel the stream if possible?
          }
        })

        // Return the Response with the ReadableStream
        return new Response(stream)
      } catch (error) {
        return new Response(
          JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    // For non-chat endpoints, use regular fetch
    return fetch(url, {
      ...options,
      body: options.body ? options.body : undefined,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
