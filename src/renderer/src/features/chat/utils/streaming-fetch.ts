/**
 * Creates a streaming fetch function for chat API that uses real-time streaming
 * via IPC communication with the main process
 */
export const createStreamingFetch = () => {
  let currentStreamId: string | null = null

  const streamingFetch = async (url: string, options: { body?: any; signal?: AbortSignal }) => {
    if (url.endsWith('/api/chat')) {
      try {
        // eslint-disable-next-line no-console
        console.log('[Renderer] streamingFetch -> /api/chat')
      } catch {}
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
        try {
          // eslint-disable-next-line no-console
          console.log('[Renderer] startMessageStream -> streamId:', streamId)
        } catch {}
        currentStreamId = streamId

        // Create a ReadableStream that will receive chunks from the IPC channel
        const stream = new ReadableStream({
          start(controller) {
            // Subscribe to stream events
            const unsubscribe = window.ctg.chat.subscribeToStream(streamId, {
              onChunk: (chunk: Uint8Array) => {
                try {
                  // eslint-disable-next-line no-console
                  console.log('[Renderer] onChunk received bytes:', chunk?.byteLength)
                  controller.enqueue(chunk)
                } catch (e) {
                  // Silently handle enqueue errors
                }
              },
              onStart: () => {},
              onError: (error: Error) => {
                try {
                  // eslint-disable-next-line no-console
                  console.error('[Renderer] stream error:', error?.message)
                } catch {}
                // Propagate the error to the stream controller
                controller.error(error)
                currentStreamId = null
              },
              onEnd: () => {
                try {
                  // eslint-disable-next-line no-console
                  console.log('[Renderer] stream end')
                } catch {}
                controller.close()
                unsubscribe()
                currentStreamId = null
              }
            })

            // Handle abort signal if provided
            if (options.signal) {
              options.signal.addEventListener('abort', async () => {
                if (currentStreamId && window.ctg?.chat?.cancelStream) {
                  try {
                    await window.ctg.chat.cancelStream(currentStreamId)
                    controller.close()
                    unsubscribe()
                    currentStreamId = null
                  } catch (error) {
                    // Silently handle cancellation errors
                  }
                }
              })
            }
          },
          cancel() {
            // Cancel the stream when the ReadableStream is canceled
            if (currentStreamId && window.ctg?.chat?.cancelStream) {
              window.ctg.chat
                .cancelStream(currentStreamId)
                .then(() => {
                  currentStreamId = null
                })
                .catch(() => {
                  // Silently handle cancellation errors
                })
            }
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

  return streamingFetch
}
