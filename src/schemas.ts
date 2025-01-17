import _ from 'lodash'

import {SchemaError} from './errors.js'
import {
  pathDepth,
  type PropertyPath,
  propertyPathToArray,
  type PropertyPathStr,
  propertyPathToDottedPath
} from './paths.js'

export type JSONSchema = any
export type Schema = JSONSchema
export type EntitySchema = JSONSchema

/**
 * A relationship storage class, which specifies how related documents are stored.
 *
 * - 'ref': Related documents are stored separately, and their IDs are recorded in the parent document. In place of the
 *   related object, the parent document has {"$ref": "<related document ID>"}.
 * - 'inverse-ref': Related documents are stored separately, and they include a foreign key property that refers to the
 *   parent document's ID.
 * - 'copy': A copy of each related document is stored directly in the parent document.
 */
export type RelationshipStorage = 'copy' | 'inverse-ref' | 'ref'

/**
 * A specification of a relationship between two schemas.
 */
export interface Relationship {
  path: PropertyPathStr
  toMany: boolean
  storage: RelationshipStorage
  // TODO Last remnant of entity types here. It's still useful, though we may be able to get by with just schemaRef.
  entityTypeName: string | undefined
  schemaRef?: string
  /** The relationship property's schema. */
  schema: Schema
  /**
   * The property path (in dot-and-bracket notation) of the foreign key in a relaitonship with storage class
   * 'inverse-ref'.
   */
  foreignKeyPath?: PropertyPathStr
  /**
   * The depth of this relationship property from the nearest containing document, which may be the main schema or a
   * relationship with storage 'ref' or 'inverse-ref'. In storage-sensitive contexts, this tells you how many components
   * of Relationship.path are contained in the current document.
   */
  depthFromParent: number // TODO Rename as depthFromParentReference.
}

export type SchemaRefResolver = (schemaRef: string) => Schema | undefined

/**
 * Find one property in a schema, traversing referenced schemas if necessary.
 *
 * @param schema The schema to search.
 * @param path The property path to find, in dot-and-bracket notation or as an array.
 * @param resolveSchemaRef A function that resolves references to other schemas.
 * @returns The property schema if found, or else undefined.
 */
export function findPropertyInSchema(
  schema: Schema,
  path: PropertyPath,
  resolveSchemaRef: SchemaRefResolver
): Schema | undefined {
  const pathArr = propertyPathToArray(path)

  if (schema.allOf) {
    // Look in each schema option for the first property remaining in the path. Start with the last schema option, since
    // the options shouldn't have properties in common (but if they do, we can assume that the last one takes
    // precedence).
    for (const schemaOption of _.reverse(schema.allOf)) {
      if (schemaOption.type != 'object') {
        // Log error?
      } else {
        const subschema = schemaOption?.properties?.[path[0]]
        if (path.length == 1) {
          return subschema
        } else {
          return findPropertyInSchema(subschema, _.slice(pathArr, 1), resolveSchemaRef)
        }
      }
    }
  } else if (schema.oneOf) {
    // Look in each schema option for the remainder of the path. Return the first match.
    for (const schemaOption of schema.oneOf) {
      if (schemaOption.type != 'object') {
        // Log error?
      } else {
        const result = findPropertyInSchema(schemaOption, pathArr, resolveSchemaRef)
        if (result) {
          return result
        }
      }
    }
  } else if (schema.$ref) {
    const referencedSchema = resolveSchemaRef(schema.$ref)
    if (!referencedSchema) {
      // TODO Log error?
      return undefined
    }
    return findPropertyInSchema(referencedSchema, path, resolveSchemaRef)
  } else {
    const schemaType = (schema as any).type
    switch (schemaType) {
      case 'object': {
        const subschema = _.get(schema, ['properties', path[0]], null)
        if (path.length == 1 || subschema == null) {
          return subschema
        } else {
          return findPropertyInSchema(subschema, _.slice(pathArr, 1), resolveSchemaRef)
        }
      }
      case 'array': {
        const subschema = _.get(schema, ['items'], null)
        if (subschema == null) {
          // TODO Warn about missing items in schema
          return undefined
        } else {
          return findPropertyInSchema(subschema, _.slice(pathArr, 1), resolveSchemaRef)
        }
      }
      default:
        // TODO Warn that we're trying to find a property in a non-object schema.
        return undefined
    }
  }
}

/**
 * Find relationships in a schema.
 *
 * A relationship is a schema node that has a storage property; it describes a relationship between two documents. It
 * typically has a $ref property that refers to a different schema, but this is not necessary; the related document
 * type's schema may be embedded in the parent schema. The storage property indicates whether related documents are
 * stored
 * - As references,
 * - As inverse references
 * - Or inline, as copies of the related documents.
 * The list of relationships returned may optionally be limited to specified storage types using the allowedStorage
 * parameter.
 *
 * Relationships make sense in the context of some mechanism for finding or referring to documents. We call this a
 * storage mechanism; it may be a SQL or NoSQL database, a REST API, or something else.
 *
 * If limitToPath is set, this function will only traverse path through the schema hierarchy. Otherwise, it will find
 * all relationships.
 *
 * Since relationships my be cyclical, this function stops traversing the schema hierarchy whenever either
 * - The end of limitToPath is reached,
 * - limitToPath is not set and a specified maxDepth is reached,
 * - Or limitToPath is not set and the function encounters a schema node it has already visited.
 *
 * @param schema The schema in which to look for relationships.
 * @param resolveSchemaRef A function that resolves references to other schemas.
 * @param allowedStorage A list of storage classes. If specified, relationships with other storage classes are ignored.
 * @param limitToPath A property path (in dot-and-bracket notation or as an array) to traverse. If specified, only
 *   relationships in this path will be returned.
 * @param maxDepth A maximum depth to traverse. Ignored if limitToPath is set.
 * @param currentPath A parameter used when the function calls itself recursively. Should not be set by other callers.
 * @param nodesTraversedInPath A parameter used when the function calls itself recursively. Should not be set by other
 *   callers.
 * @param depthFromParent  A parameter used when the function calls itself recursively. Should not be set by other
 *   callers.
 * @returns A list of relationships contained in the schema.
 */
export function findRelationshipsInSchema(
  schema: Schema,
  resolveSchemaRef: SchemaRefResolver,
  allowedStorage?: RelationshipStorage[],
  limitToPath?: PropertyPath,
  maxDepth: number | undefined = undefined,
  currentPath: PropertyPath = [],
  nodesTraversedInPath: Schema[] = [],
  depthFromParent = 0
): Relationship[] {
  const currentPathArr = propertyPathToArray(currentPath)
  const limitToPathArr = limitToPath ? propertyPathToArray(limitToPath) : undefined

  // Note any relationship properties specified by the current schema node.
  let relationshipProperties: Partial<Relationship> = {
    entityTypeName: schema.entityType,
    foreignKeyPath: schema.foreignKey,
    schemaRef: schema.$ref,
    storage: schema.storage
  }

  // If this schema node has a reference to another schema, get the referenced schema. Except for any relationship
  // properties noted above from the current schema node, we will subsequently work only with the referenced schema.
  // Relationship properties from the original schema node take precedence over relationship properties from hthe
  // referenced schema.
  if (schema.$ref) {
    const referencedSchema = resolveSchemaRef(schema.$ref)
    if (!referencedSchema) {
      // TODO Log error?
      return []
    }
    relationshipProperties = {
      entityTypeName: referencedSchema.entityType,
      foreignKeyPath: referencedSchema.foreignKey,
      schemaRef: referencedSchema.$ref,
      storage: referencedSchema.storage,
      ...relationshipProperties // Referencing schema takes precedence.
    }
    schema = referencedSchema
  }

  // Limit the tree traversal depth.
  if (maxDepth == undefined && nodesTraversedInPath.includes(schema)) {
    // If no maximum depth was specified, do not traverse circular references.
    // TODO This does not seem to work. nodesTraversedInPath.includes(schema) isn't catching the circularity.
    return []
  } else if (maxDepth != undefined && pathDepth(currentPathArr) > maxDepth) {
    // If we have exceeded the maximum depth, stop traversing the schema.
    return []
  }

  let relationships: Relationship[] = []
  const schemaType = schema.type
  const schemaOptions = schema.allOf || schema.oneOf
  if (schemaOptions && _.isArray(schemaOptions)) {
    // The schema node has allOf or oneOf set. Call findRelationships on each schema option.
    // TODO Should we stop assuming that transient is not set on the current schema node?
    for (const schemaOption of schemaOptions) {
      relationships = relationships.concat(
        findRelationshipsInSchema(
          schemaOption,
          resolveSchemaRef,
          allowedStorage,
          limitToPathArr,
          maxDepth,
          currentPathArr,
          [...nodesTraversedInPath, schema],
          depthFromParent
        )
      )
    }
  } else {
    switch (schemaType) {
      case 'object':
        // The current schema node is an object schema. Check whether it is itself a relationship, then traverse its
        // properties.
        {
          const relationshipIsReference =
            relationshipProperties.storage && ['ref', 'inverse-ref'].includes(relationshipProperties.storage)
          if (
            relationshipProperties.storage &&
            (!allowedStorage || allowedStorage.includes(relationshipProperties.storage))
          ) {
            const relationship: Relationship = {
              path: propertyPathToDottedPath(currentPathArr),
              toMany: false,
              storage: relationshipProperties.storage || 'copy',
              entityTypeName: relationshipProperties.entityTypeName,
              schemaRef: relationshipProperties.schemaRef,
              schema,
              depthFromParent
            }
            if (relationshipProperties.storage == 'inverse-ref') {
              if (!relationshipProperties.foreignKeyPath) {
                // TODO Include the current location in the logged error.
                throw new SchemaError(`Missing foreign key path in relationship with storage type inverse-ref`)
              }
              relationship.foreignKeyPath = relationshipProperties.foreignKeyPath
            }
            relationships.push(relationship)
          }

          // Traverse the object schema's properties. If limitToPath is set, only traverse one property (the first one
          // in limitToPath) or none if limitToPath is empty or its first property does not exist in the schema.
          const propertySchemas = _.get(schema, ['properties'], [])
          let propertiesToTraverse = _.keys(propertySchemas)
          if (limitToPathArr) {
            const propertyToTraverse = limitToPathArr[0]
            propertiesToTraverse =
              _.isString(propertyToTraverse) && propertiesToTraverse.includes(propertyToTraverse)
                ? [propertyToTraverse]
                : []
          }
          for (const property of propertiesToTraverse) {
            const subschema = propertySchemas[property]
            relationships = relationships.concat(
              findRelationshipsInSchema(
                subschema,
                resolveSchemaRef,
                allowedStorage,
                limitToPathArr ? limitToPathArr.slice(1) : undefined,
                maxDepth,
                [...currentPathArr, property],
                [...nodesTraversedInPath, schema],
                relationshipIsReference ? 0 : depthFromParent + 1
              )
            )
          }
        }
        break
      case 'array':
        // The current schema node is an array schema. Move on to its array element ("items") schema. If limitToPath is
        // set, stop unless limitToPath has at least one path component. The first path component should be set to '*'
        // or a number, but we don't validate it.
        {
          if (!limitToPathArr || limitToPathArr.length > 0) {
            const itemsSchema = schema.items
            if (itemsSchema) {
              relationships = relationships.concat(
                findRelationshipsInSchema(
                  itemsSchema,
                  resolveSchemaRef,
                  allowedStorage,
                  limitToPathArr ? limitToPathArr.slice(1) : undefined,
                  maxDepth,
                  [...currentPathArr, -1],
                  [...nodesTraversedInPath, schema],
                  depthFromParent + 1
                )
              )
            }
          }
        }
        break
      default:
        break
    }
  }
  return relationships
}

/**
 * List all the transient properties of a schema.
 *
 * Transient properties are identified by the custom JSON schema attribute "transient" being set to true.
 *
 * If limitToPath is set, this function will only traverse path through the schema hierarchy. Otherwise, it will find
 * all relationships.
 *
 * Since relationships my be cyclical, this function stops traversing the schema hierarchy whenever either
 * - The end of limitToPath is reached,
 * - limitToPath is not set and a specified maxDepth is reached,
 * - Or limitToPath is not set and the function encounters a schema node it has already visited.
 *
 * @param schema The schema in which to look for transient properties.
 * @param resolveSchemaRef A function that resolves references to other schemas.
 * @param limitToPath A property path (in dot-and-bracket notation or as an array) to traverse. If specified, only
 *   relationships in this path will be returned.
 * @param maxDepth A maximum depth to traverse. Ignored if limitToPath is set.
 * @param currentPath A parameter used when the function calls itself recursively. Should not be set by other callers.
 * @param nodesTraversedInPath A parameter used when the function calls itself recursively. Should not be set by other
 *   callers.
 * @returns An array of transient property paths in dot-and-bracket notation
 */
export function findTransientPropertiesInSchema(
  schema: Schema,
  resolveSchemaRef: SchemaRefResolver,
  limitToPath?: PropertyPath,
  maxDepth: number | undefined = undefined,
  currentPath: PropertyPath = [],
  nodesTraversedInPath: Schema[] = []
): PropertyPathStr[] {
  const currentPathArr = propertyPathToArray(currentPath)
  const limitToPathArr = limitToPath ? propertyPathToArray(limitToPath) : undefined

  let transientPropertyPaths: string[] = []

  // Note whether the current schema node specifies transience. This will take precedence over any referenced schema's
  // transience.
  let transient: boolean | undefined = schema.transient

  // If this schema node has a reference to another schema, get the referenced schema. Except for any transience noted
  // above from the current schema node, we will subsequently work only with the referenced schema.
  if (schema.$ref) {
    const referencedSchema = resolveSchemaRef(schema.$ref)
    if (!referencedSchema) {
      // TODO Log error?
      return []
    }
    if (transient === undefined) {
      // Referencing schema takes precedence.
      transient = referencedSchema.transient
    }
    schema = referencedSchema
  }

  // Limit the tree traversal depth.
  if (maxDepth == undefined && nodesTraversedInPath.includes(schema)) {
    // If no maximum depth was specified, do not traverse circular references.
    // TODO This does not seem to work. nodesTraversedInPath.includes(schema) isn't catching the circularity.
    return []
  } else if (maxDepth != undefined && pathDepth(currentPathArr) > maxDepth) {
    // If we have exceeded the maximum depth, stop traversing the schema.
    return []
  }

  // Add the current path to the result if this schema node is marked transient.
  if (pathDepth(currentPathArr) == 0) {
    // The root of a schema cannot be transient.
  } else if (schema.transient) {
    transientPropertyPaths.push(propertyPathToDottedPath(currentPathArr))
  }

  const schemaType = schema.type
  const schemaOptions = schema.allOf || schema.oneOf
  if (schemaOptions && _.isArray(schemaOptions)) {
    // The schema node has allOf or oneOf set. Call findRelationships on each schema option.
    // TODO Are we wrongly assuming that transient is not set on root nodes of schema options?
    for (const schemaOption of schemaOptions) {
      transientPropertyPaths = transientPropertyPaths.concat(
        findTransientPropertiesInSchema(schemaOption, resolveSchemaRef, limitToPathArr, maxDepth, currentPathArr, [
          ...nodesTraversedInPath,
          schema
        ])
      )
    }
  } else {
    switch (schemaType) {
      case 'object':
        {
          // Traverse the object schema's properties. If limitToPath is set, only traverse one property (the first one
          // in limitToPath) or none if limitToPath is empty or its first property does not exist in the schema.
          const propertySchemas = _.get(schema, ['properties'], [])
          let propertiesToTraverse = _.keys(propertySchemas)
          if (limitToPathArr) {
            const propertyToTraverse = limitToPathArr[0]
            propertiesToTraverse =
              _.isString(propertyToTraverse) && propertiesToTraverse.includes(propertyToTraverse)
                ? [propertyToTraverse]
                : []
          }
          for (const property of propertiesToTraverse) {
            const subschema = propertySchemas[property]
            transientPropertyPaths = transientPropertyPaths.concat(
              findTransientPropertiesInSchema(
                subschema,
                resolveSchemaRef,
                limitToPathArr ? limitToPathArr.slice(1) : undefined,
                maxDepth,
                [...currentPathArr, property],
                [...nodesTraversedInPath, schema]
              )
            )
          }
        }
        break
      case 'array':
        // The current schema node is an array schema. Move on to its array element ("items") schema. If limitToPath is
        // set, stop unless limitToPath has at least one path component. The first path component should be set to '*'
        // or a number, but we don't validate it.
        {
          if (!limitToPathArr || limitToPathArr.length > 0) {
            const itemsSchema = schema.items
            if (itemsSchema) {
              transientPropertyPaths = transientPropertyPaths.concat(
                findTransientPropertiesInSchema(
                  itemsSchema,
                  resolveSchemaRef,
                  limitToPathArr ? limitToPathArr.slice(1) : undefined,
                  maxDepth,
                  [...currentPathArr, -1],
                  [...nodesTraversedInPath, schema]
                )
              )
            }
          }
        }
        break
      default:
        break
    }
  }
  return transientPropertyPaths
}
