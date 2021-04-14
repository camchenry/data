import { InternalEntity, Entity } from '../glossary'

function isInternalEntity(value: any): value is InternalEntity<any, any> {
  return typeof value === 'object' && '__type' in value
}

/**
 * Remove internal properties from the given entity.
 */
export function removeInternalProperties<
  Dictionary extends Record<string, any>,
  ModelName extends keyof Dictionary
>(
  entity: InternalEntity<Dictionary, ModelName>,
): Entity<Dictionary, ModelName> {
  return Object.entries(entity).reduce<any>((result, [key, value]) => {
    if (!key.startsWith('__')) {
      if (isInternalEntity(value)) {
        result[key] = removeInternalProperties(value)
      } else if (Array.isArray(value)) {
        result[key] = value.reduce((acc: any[], reletionalEntity: any[]) => {
          if (isInternalEntity(reletionalEntity)) {
            acc.push(removeInternalProperties(reletionalEntity))
          } else acc.push(reletionalEntity)
          return acc
        }, [])
      } else result[key] = value
    }

    return result
  }, {})
}
