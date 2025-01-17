// @ts-check

//import google from 'eslint-config-google'
//import importPlugin from 'eslint-plugin-import'

import eslint from '@eslint/js'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'
import tseslint from 'typescript-eslint'

/*
export default [
  google,
  importPlugin.flatConfigs.recommended,
  {
    rules: {
      //'@typescript-eslint/no-explicit-any': 'off'
    }
  }
]*/

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off'
    }
  }
)
