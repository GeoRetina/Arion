// Lightweight, CSP-safe polyfill for __publicField used by some bundled chunks and workers
const globalAny: any = typeof globalThis !== 'undefined' ? globalThis : (window as any)

if (!globalAny.__publicField) {
  globalAny.__publicField = (obj: any, key: string, value: any) => {
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
if (typeof self !== 'undefined' && !(self as any).__publicField) {
  ;(self as any).__publicField = globalAny.__publicField
}

// Patch URL.createObjectURL so worker blobs get the polyfill prepended
(() => {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return

  const originalCreateObjectURL = URL.createObjectURL.bind(URL)
  const prefix =
    'var __publicField=__publicField||function(obj,key,value){Object.defineProperty(obj,key,{value:value,enumerable:true,configurable:true,writable:true});return value;};'

  URL.createObjectURL = function (obj: any) {
    try {
      if (obj instanceof Blob) {
        const type = obj.type || ''
        const isJS = type.includes('javascript') || type.includes('ecmascript')
        if (isJS) {
          const patched = new Blob([prefix, '\n', obj], { type })
          return originalCreateObjectURL(patched)
        }
      }
    } catch (_e) {
      // Fall through to original
    }
    return originalCreateObjectURL(obj)
  }
})()
