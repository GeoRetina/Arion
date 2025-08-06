/**
 * Layer Import Service (Legacy)
 *
 * @deprecated Use the new modular layer import system instead:
 * import { LayerImportService } from './layer-import'
 * 
 * This file is kept for backward compatibility and will be removed in the future.
 * The new system provides better separation of concerns and maintainability.
 */

// Re-export from the new modular system
export { LayerImportService } from './layer-import'
export type { ImportResult } from './layer-import'
export { SUPPORTED_FORMATS } from './layer-import'
export type { SupportedMimeType, SupportedFormat, ValidationResult } from './layer-import'
