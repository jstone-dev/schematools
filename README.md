# schematools

Tools for working with extended JSON schemas

## Purpose

## Prerequisites

schematools is compatible with Node 20 and higher.

## Installation

Install the latest version from npmjs.com:
```
npm install schematools
```

If you need to use the latest version from GitHub instead, install it this way:
```
npm install docorm@git+ssh://github.com/bbi-lab/schematools
```

## Usage

### Extended JSON schemas

Schemas adhere to [JSON Schema](https://json-schema.org), with some limitations and some extensions.

#### JSON schema support

#### Extensions

### Storage contexts

### References

### Schema registries

### Types of path

## Schemas

Data model schemas adhere to a custom dialect of [JSON Schema](https://json-schema.org). This custom dialect is not yet
formally defined, but we will describe its limitations and extensions with respect to a standard dialect.

 with respect to the the core/validation dialect of JSON Schema
2020-12. We will also describe its extensions to the standard, which are custom keywords.

### Limitations

The following subsections describe keyword support relative to the core/validation dialect of JSON Schema 2020-12.

Supported:
- Simple types and their properties
- Objects and arrays
- `allOf` and `anyOf`

Unsupported:
- `oneOf`
- `not`
- `if`, `then`, and `else`
- `properties`, `patternProperties`, and `additionalProperties`
- `dependentSchemas`
- `propertyNames`
- `prefixItems`
- `contains`

### Extensions

## Data models

## Queries

## Data storage

## Connection management

## Running queries

## Use of JSON paths

[JSONPath](https://goessner.net/articles/JsonPath/), [JSON pointers](https://datatracker.ietf.org/doc/html/rfc6901), and simple (dot-separated or array) paths

Use of [JSONPath-Plus](https://github.com/JSONPath-Plus/JSONPath)

## Current & future directions

- More ORM-like interface for interacting with relationships between documents
- Ability to map JSON properties to relational database columns
