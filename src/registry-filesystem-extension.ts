import {importDirectory} from './import-dir.js'
import {SchemaRegistry} from './registry.js'
import {type Schema} from './schemas.js'

declare module './registry.js' {
  interface SchemaRegistry {
    /**
     * Load and register schemas from a directory.
     *
     * All JSON files in the directory and its subdirectories/descendants are loaded.
     *
     * @param path The directory path containing schemas.
     * @param getSchemaId A function that returns a schema's ID, given the file path and the schema. If omitted, the
     *   default behavior is to obtain the schema ID from an `$id` property at the root level of the schema.
     */
    loadSchemasFromDirectory(path: string, getSchemaId?: (path: string, schema: Schema) => string): Promise<void>
  }
}

SchemaRegistry.prototype.loadSchemasFromDirectory = async function (
  path: string,
  getSchemaId?: (path: string, schema: Schema) => string
) {
  await importDirectory(path, {
    assertType: 'json',
    extensions: ['json'],
    importedModule: async (path, module) => {
      const schemaId = getSchemaId ? getSchemaId(path, module) : module.$id
      this.registerSchema(schemaId, module)
    },
    recurse: true
  })
}
