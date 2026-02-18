import type { JsonSchemaDefinition, JsonSchemaPrimitiveType } from '../../../shared/ipc-types'

const VALID_PRIMITIVE_TYPES = new Set<JsonSchemaPrimitiveType>([
  'string',
  'number',
  'integer',
  'boolean',
  'object',
  'array',
  'null'
])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getValueType(value: unknown): JsonSchemaPrimitiveType | 'unknown' {
  if (value === null) {
    return 'null'
  }
  if (Array.isArray(value)) {
    return 'array'
  }
  switch (typeof value) {
    case 'string':
      return 'string'
    case 'number':
      return Number.isInteger(value) ? 'integer' : 'number'
    case 'boolean':
      return 'boolean'
    case 'object':
      return 'object'
    default:
      return 'unknown'
  }
}

function valueMatchesType(value: unknown, expected: JsonSchemaPrimitiveType): boolean {
  if (expected === 'number') {
    return typeof value === 'number' && Number.isFinite(value)
  }
  if (expected === 'integer') {
    return typeof value === 'number' && Number.isInteger(value)
  }
  return getValueType(value) === expected
}

export function validateJsonSchemaDefinition(
  schema: JsonSchemaDefinition,
  path = '$schema'
): string[] {
  const errors: string[] = []

  if (!isPlainObject(schema)) {
    return [`${path}: schema must be an object`]
  }

  if (schema.type !== undefined) {
    const declaredTypes = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (declaredTypes.length === 0) {
      errors.push(`${path}.type: must not be empty`)
    }
    for (const typeName of declaredTypes) {
      if (!VALID_PRIMITIVE_TYPES.has(typeName)) {
        errors.push(`${path}.type: unsupported type "${String(typeName)}"`)
      }
    }
  }

  if (schema.properties !== undefined && !isPlainObject(schema.properties)) {
    errors.push(`${path}.properties: must be an object`)
  }

  if (schema.required !== undefined && !Array.isArray(schema.required)) {
    errors.push(`${path}.required: must be an array`)
  }

  if (Array.isArray(schema.required)) {
    for (const requiredKey of schema.required) {
      if (typeof requiredKey !== 'string' || requiredKey.trim().length === 0) {
        errors.push(`${path}.required: entries must be non-empty strings`)
      }
    }
  }

  if (schema.additionalProperties !== undefined) {
    const additional = schema.additionalProperties
    if (
      typeof additional !== 'boolean' &&
      !isPlainObject(additional) &&
      !Array.isArray(additional)
    ) {
      errors.push(`${path}.additionalProperties: must be boolean or schema object`)
    }
  }

  if (schema.properties && isPlainObject(schema.properties)) {
    for (const [key, childSchema] of Object.entries(schema.properties)) {
      if (!isPlainObject(childSchema)) {
        errors.push(`${path}.properties.${key}: must be a schema object`)
        continue
      }
      errors.push(
        ...validateJsonSchemaDefinition(childSchema as JsonSchemaDefinition, `${path}.${key}`)
      )
    }
  }

  if (schema.items !== undefined) {
    if (Array.isArray(schema.items)) {
      schema.items.forEach((item, index) => {
        if (!isPlainObject(item)) {
          errors.push(`${path}.items[${index}]: must be a schema object`)
          return
        }
        errors.push(
          ...validateJsonSchemaDefinition(item as JsonSchemaDefinition, `${path}.items[${index}]`)
        )
      })
    } else if (isPlainObject(schema.items)) {
      errors.push(...validateJsonSchemaDefinition(schema.items, `${path}.items`))
    } else {
      errors.push(`${path}.items: must be a schema object or array of schema objects`)
    }
  }

  if (schema.oneOf !== undefined) {
    if (!Array.isArray(schema.oneOf) || schema.oneOf.length === 0) {
      errors.push(`${path}.oneOf: must be a non-empty array`)
    } else {
      schema.oneOf.forEach((childSchema, index) => {
        if (!isPlainObject(childSchema)) {
          errors.push(`${path}.oneOf[${index}]: must be a schema object`)
          return
        }
        errors.push(
          ...validateJsonSchemaDefinition(
            childSchema as JsonSchemaDefinition,
            `${path}.oneOf[${index}]`
          )
        )
      })
    }
  }

  if (schema.anyOf !== undefined) {
    if (!Array.isArray(schema.anyOf) || schema.anyOf.length === 0) {
      errors.push(`${path}.anyOf: must be a non-empty array`)
    } else {
      schema.anyOf.forEach((childSchema, index) => {
        if (!isPlainObject(childSchema)) {
          errors.push(`${path}.anyOf[${index}]: must be a schema object`)
          return
        }
        errors.push(
          ...validateJsonSchemaDefinition(
            childSchema as JsonSchemaDefinition,
            `${path}.anyOf[${index}]`
          )
        )
      })
    }
  }

  return errors
}

function validateType(value: unknown, schema: JsonSchemaDefinition, path: string): string[] {
  if (schema.type === undefined) {
    return []
  }

  const expectedTypes = Array.isArray(schema.type) ? schema.type : [schema.type]
  const matches = expectedTypes.some((expected) => valueMatchesType(value, expected))
  if (matches) {
    return []
  }

  const actualType = getValueType(value)
  return [`${path}: expected ${expectedTypes.join('|')}, received ${actualType}`]
}

function validateEnumAndConst(
  value: unknown,
  schema: JsonSchemaDefinition,
  path: string
): string[] {
  const errors: string[] = []

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path}: value must equal const ${JSON.stringify(schema.const)}`)
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const enumMatch = schema.enum.some((candidate) => candidate === value)
    if (!enumMatch) {
      errors.push(`${path}: value must match one of enum options`)
    }
  }

  return errors
}

function validateString(value: unknown, schema: JsonSchemaDefinition, path: string): string[] {
  const errors: string[] = []
  if (typeof value !== 'string') {
    return errors
  }

  if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
    errors.push(`${path}: length must be >= ${schema.minLength}`)
  }

  if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
    errors.push(`${path}: length must be <= ${schema.maxLength}`)
  }

  if (typeof schema.pattern === 'string') {
    try {
      const regex = new RegExp(schema.pattern)
      if (!regex.test(value)) {
        errors.push(`${path}: value does not match required pattern`)
      }
    } catch {
      errors.push(`${path}: invalid regex pattern "${schema.pattern}"`)
    }
  }

  return errors
}

function validateNumber(value: unknown, schema: JsonSchemaDefinition, path: string): string[] {
  const errors: string[] = []
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return errors
  }

  if (typeof schema.minimum === 'number' && value < schema.minimum) {
    errors.push(`${path}: value must be >= ${schema.minimum}`)
  }

  if (typeof schema.maximum === 'number' && value > schema.maximum) {
    errors.push(`${path}: value must be <= ${schema.maximum}`)
  }

  return errors
}

function validateArray(value: unknown, schema: JsonSchemaDefinition, path: string): string[] {
  const errors: string[] = []
  if (!Array.isArray(value)) {
    return errors
  }

  if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
    errors.push(`${path}: item count must be >= ${schema.minItems}`)
  }

  if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
    errors.push(`${path}: item count must be <= ${schema.maxItems}`)
  }

  if (schema.items) {
    if (Array.isArray(schema.items)) {
      schema.items.forEach((itemSchema, index) => {
        const itemValue = value[index]
        if (itemValue === undefined) {
          return
        }
        errors.push(...validateAgainstJsonSchema(itemValue, itemSchema, `${path}[${index}]`))
      })
    } else {
      value.forEach((itemValue, index) => {
        errors.push(
          ...validateAgainstJsonSchema(
            itemValue,
            schema.items as JsonSchemaDefinition,
            `${path}[${index}]`
          )
        )
      })
    }
  }

  return errors
}

function validateObject(value: unknown, schema: JsonSchemaDefinition, path: string): string[] {
  const errors: string[] = []
  if (!isPlainObject(value)) {
    return errors
  }

  const source = value as Record<string, unknown>
  const declaredProperties = schema.properties || {}

  if (Array.isArray(schema.required)) {
    for (const requiredKey of schema.required) {
      if (!(requiredKey in source)) {
        errors.push(`${path}: missing required property "${requiredKey}"`)
      }
    }
  }

  if (isPlainObject(declaredProperties)) {
    for (const [key, propSchema] of Object.entries(declaredProperties)) {
      if (!(key in source)) {
        continue
      }
      errors.push(
        ...validateAgainstJsonSchema(
          source[key],
          propSchema as JsonSchemaDefinition,
          `${path}.${key}`
        )
      )
    }
  }

  const additional = schema.additionalProperties
  for (const [key, keyValue] of Object.entries(source)) {
    if (key in declaredProperties) {
      continue
    }

    if (additional === false) {
      errors.push(`${path}: property "${key}" is not allowed`)
      continue
    }

    if (isPlainObject(additional)) {
      errors.push(
        ...validateAgainstJsonSchema(keyValue, additional as JsonSchemaDefinition, `${path}.${key}`)
      )
    }
  }

  return errors
}

export function validateAgainstJsonSchema(
  value: unknown,
  schema: JsonSchemaDefinition,
  path = '$'
): string[] {
  const errors: string[] = []

  if (schema.oneOf && Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    const variants = schema.oneOf.map((variantSchema) =>
      validateAgainstJsonSchema(value, variantSchema, path)
    )
    const hasAnyValid = variants.some((variantErrors) => variantErrors.length === 0)
    if (!hasAnyValid) {
      errors.push(`${path}: value did not match any oneOf variant`)
      return errors
    }
  }

  if (schema.anyOf && Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    const variants = schema.anyOf.map((variantSchema) =>
      validateAgainstJsonSchema(value, variantSchema, path)
    )
    const hasAnyValid = variants.some((variantErrors) => variantErrors.length === 0)
    if (!hasAnyValid) {
      errors.push(`${path}: value did not match any anyOf variant`)
      return errors
    }
  }

  errors.push(...validateType(value, schema, path))
  if (errors.length > 0) {
    return errors
  }

  errors.push(...validateEnumAndConst(value, schema, path))
  errors.push(...validateString(value, schema, path))
  errors.push(...validateNumber(value, schema, path))
  errors.push(...validateArray(value, schema, path))
  errors.push(...validateObject(value, schema, path))

  return errors
}
