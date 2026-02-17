import { type UIMessage } from 'ai'

// Define the expected structure of the request body for the chat API
interface ChatRequestBody {
  messages: UIMessage[] // The @ai-sdk/react useChat hook automatically includes messages
  // Other properties from your useChatLogic's body
  selectedRoiGeometryInChat?: UnsafeAny // Replace 'any' with the actual type
  selectedUserGeospatialSource?: UnsafeAny // Replace 'any' with the actual type
  isAnalystActive?: boolean
  mapLayersNames?: string[]
  // chat ID is usually handled by useChat options directly or as part of the URL
}

/**
 * electronChatFetch
 *
 * This function acts as a custom fetcher for the `useChat` hook from `@ai-sdk/react`.
 * It routes chat messages through Electron's IPC mechanism to the main process.
 *
 * @param {string} _url - The URL endpoint. In this setup, it's more of a placeholder
 *                        as the actual recipient is the main process via IPC.
 *                        It might be used by `useChat` internally for some logic, so it's kept.
 * @param {object} options - The options object from the fetch call.
 * @param {ChatRequestBody | undefined} options.body - The request body, expected to contain messages and other custom data.
 * @returns {Promise<Response>} A promise that resolves to a Response object.
 */
export const electronChatFetch = async (
  _url: string, // Typically "/api/chat" or similar, ignored by our IPC bridge
  { body }: { body?: ChatRequestBody | string }
): Promise<Response> => {
  // Ensure the IPC bridge is available on the window object
  if (!window.ctg || !window.ctg.chat || !window.ctg.chat.sendMessageStream) {
    // Return a Response object indicating an error
    const errorResponse = JSON.stringify({ error: 'Chat service not available.' })
    return new Response(errorResponse, {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    // Call the main process handler via the preload script's exposed API
    // The `body` here already includes the `messages` array and any other data
    // you added to the `body` option of `useChat`.
    const parsedBody = typeof body === 'string' ? (JSON.parse(body) as ChatRequestBody) : body
    const chunks = await window.ctg.chat.sendMessageStream(parsedBody)

    const stream = new ReadableStream({
      start(controller) {
        if (Array.isArray(chunks)) {
          chunks.forEach((chunk) => controller.enqueue(chunk))
        }
        controller.close()
      }
    })

    // Return a new Response object with the stream from the main process
    return new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' }
    })
  } catch (error) {
    // Return a Response object indicating an error
    const errorResponse = JSON.stringify({ error: (error as Error).message })
    return new Response(errorResponse, {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
