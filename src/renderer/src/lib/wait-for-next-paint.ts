export async function waitForNextPaint(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}
