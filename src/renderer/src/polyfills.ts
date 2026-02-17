// Lightweight, CSP-safe polyfill for __publicField used by some bundled chunks and workers
type PublicFieldFn = (obj: object, key: string, value: unknown) => unknown
type PublicFieldGlobal = Record<string, unknown> & { __publicField?: PublicFieldFn }

const globalTarget: PublicFieldGlobal =
  typeof globalThis !== 'undefined'
    ? (globalThis as unknown as PublicFieldGlobal)
    : (window as unknown as PublicFieldGlobal)

if (!globalTarget.__publicField) {
  globalTarget.__publicField = (obj: object, key: string, value: unknown) => {
    Object.defineProperty(obj, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    })
    return value
  }
}

// Make it available in worker global scope too
if (typeof self !== 'undefined') {
  const selfTarget = self as unknown as PublicFieldGlobal
  if (!selfTarget.__publicField) {
    selfTarget.__publicField = globalTarget.__publicField
  }
}

// Patch URL.createObjectURL so worker blobs get the polyfill prepended
;(() => {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return

  const originalCreateObjectURL = URL.createObjectURL.bind(URL)
  const prefix =
    'var __publicField=__publicField||function(obj,key,value){Object.defineProperty(obj,key,{value:value,enumerable:true,configurable:true,writable:true});return value;};'

  URL.createObjectURL = function (obj: Blob | MediaSource): string {
    try {
      if (obj instanceof Blob) {
        const type = obj.type || ''
        const isJS = type.includes('javascript') || type.includes('ecmascript')
        if (isJS) {
          const patched = new Blob([prefix, '\n', obj], { type })
          return originalCreateObjectURL(patched)
        }
      }
    } catch {
      // Fall through to original
    }
    return originalCreateObjectURL(obj)
  }
})()
