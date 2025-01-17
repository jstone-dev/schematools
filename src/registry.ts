// import {importDirectory} from './import-dir.js'
import type {PropertyPath, PropertyPathStr} from './paths.js'
import {
  findPropertyInSchema,
  findRelationshipsInSchema,
  findTransientPropertiesInSchema,
  Relationship,
  RelationshipStorage,
  type Schema
} from './schemas.js'

/**
 * A schema name. This may be any string but is typically a hierarchical/namespaced string using some separator like '/'
 * or '.'
 */
export type SchemaName = string

/**
 * The dictionary of schemas in a registry.
 */
export interface SchemaRegistryContent {
  [name: SchemaName]: Schema
}

/**
 * A function that translates schema references ($ref values) into schema names that can be looked up in a registry.
 */
export type SchemaRefTranslator = (refPath: string) => SchemaName

/**
 * A collection of schemas.
 *
 * The registry is a collection of name-value pairs, where the values are schemas. Schema names are arbitrary strings,
 * though they are typically paths separated by some character like '/' or '.'.
 *
 * The main purpose of a registry is to hold schemas that may contain references to one another, and to facilitate
 * reference resolution. The registry has a SchemaRefTranslator function that translates $ref values into schema names.
 * (It defaults to the identity function.)
 *
 * The registry offers methods that encapsulate the following schema functions:
 * - findPropertyInSchema
 * - findRelationshipsInSchema
 * - findTransientPropertiesInSchema
 * These methods omit the underlying functions' resolveSchemaRef parameters, because the registry itself has a schema
 * reference resolver, which assumes that referenced schemas reside in the same registry and that their names can be
 * determined by calling the SchemaRefTranslator.
 */
export class SchemaRegistry {
  schemas: SchemaRegistryContent = {}
  schemaRefTranslator: SchemaRefTranslator

  /**
   * Create a new SchemaRegistry.
   *
   * @param schemaRefTranslator A function that translates schema references (the value of $ref properties in a schema)
   *   into schema names. It defaults to the identity function.
   */
  constructor(schemaRefTranslator: SchemaRefTranslator = (refPath: string) => refPath) {
    this.schemaRefTranslator = schemaRefTranslator
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Registering and getting schemas
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  /**
   * Deregister a schema.
   *
   * @param name The schema name.
   */
  deregisterSchema(name: SchemaName): void {
    delete this.schemas[name]
  }

  /**
   * Retrieve a schema from the registry.
   *
   * @param name The schema name.
   * @returns The schema, or undefined if none was registered with the specified name.
   */
  getSchema(name: SchemaName): Schema | undefined {
    return this.schemas[name]
  }

  /**
   * Register a schema.
   *
   * If another schema has already been registered with the specified name, it will be replaced.
   *
   * @param name The schema name.
   * @param schema The schema to add to the registry.
   */
  registerSchema(name: SchemaName, schema: Schema): void {
    this.schemas[name] = schema
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Using schemas
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  /**
   * Find one property in a schema, traversing referenced schemas if necessary.
   *
   * @param schema The schema to search.
   * @param path The property path to find, in dot-and-bracket notation or as an array.
   * @returns The property schema if found, or else undefined.
   */
  findPropertyInSchema(schema: Schema, path: PropertyPath): Schema | undefined {
    return findPropertyInSchema(schema, path, this.resolveSchemaRef) // TODO Or (ref: string) => this.resolveRef(ref)
  }

  /**
   * Find relationships in a schema.
   *
   * A relationship is a schema node that has entityTypeName and storage properties. This describes a relationship between
   * two documents, with entityTypeName identifying the type of the child document. The schema node's storage property
   * indicates whether it is stored
   * - As a reference,
   * - As an inverse reference
   * - Or inline, as a copy of the related document.
   * The list of relationships returned may optionally be limited to specified storage types using the allowedStorage
   * parameter.
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
   * @returns A list of relationships contained in the schema.
   */
  findRelationshipsInSchema(
    schema: Schema,
    allowedStorage?: RelationshipStorage[],
    limitToPath?: PropertyPath,
    maxDepth: number | undefined = undefined
  ): Relationship[] {
    return findRelationshipsInSchema(schema, this.resolveSchemaRef, allowedStorage, limitToPath, maxDepth)
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
  findTransientPropertiesInSchema(
    schema: Schema,
    limitToPath?: PropertyPath,
    maxDepth: number | undefined = undefined
  ): PropertyPathStr[] {
    return findTransientPropertiesInSchema(schema, this.resolveSchemaRef, limitToPath, maxDepth)
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Schema references
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  resolveSchemaRef(ref: string): Schema | undefined {
    const schemaName = this.schemaRefTranslator(ref)
    return this.getSchema(schemaName)
  }
}
