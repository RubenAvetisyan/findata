import Ajv from 'ajv';
import ajvFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
const addFormats = (ajvFormats as any).default ?? ajvFormats;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type SchemaVersion = 'v1' | 'v2';

export const AVAILABLE_SCHEMA_VERSIONS: readonly SchemaVersion[] = ['v1', 'v2'] as const;
export const DEFAULT_SCHEMA_VERSION: SchemaVersion = 'v1';

const schemaCache = new Map<SchemaVersion, object>();

interface AjvErrorObject {
  instancePath: string;
  message?: string;
  keyword: string;
}

interface AjvValidateFunction {
  (data: unknown): boolean;
  errors?: AjvErrorObject[] | null;
}

interface AjvInstance {
  compile: (schema: object) => AjvValidateFunction;
}

/**
 * Get the file path for a schema version
 */
export function getSchemaPath(version: SchemaVersion): string {
  const schemaDir = resolve(__dirname, '../../schemas');
  return resolve(schemaDir, `final_result.${version}.schema.json`);
}

/**
 * Load and return the JSON schema for a given version
 */
export function getSchema(version: SchemaVersion): object {
  if (!AVAILABLE_SCHEMA_VERSIONS.includes(version)) {
    throw new Error(
      `Invalid schema version: "${version}". Available versions: ${AVAILABLE_SCHEMA_VERSIONS.join(', ')}`
    );
  }

  const cached = schemaCache.get(version);
  if (cached !== undefined) {
    return cached;
  }

  const schemaPath = getSchemaPath(version);
  const schemaContent = readFileSync(schemaPath, 'utf-8');
  const schema = JSON.parse(schemaContent) as object;
  schemaCache.set(version, schema);
  return schema;
}

/**
 * Check if a version string is a valid schema version
 */
export function isValidSchemaVersion(version: string): version is SchemaVersion {
  return AVAILABLE_SCHEMA_VERSIONS.includes(version as SchemaVersion);
}

/**
 * Validate that a version string is valid, throwing an error if not
 */
export function assertValidSchemaVersion(version: string): asserts version is SchemaVersion {
  if (!isValidSchemaVersion(version)) {
    throw new Error(
      `Invalid schema version: "${version}". Available versions: ${AVAILABLE_SCHEMA_VERSIONS.join(', ')}`
    );
  }
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  path: string;
  message: string;
  keyword: string;
}

const validatorCache = new Map<SchemaVersion, AjvValidateFunction>();

function getValidator(version: SchemaVersion): AjvValidateFunction {
  const cached = validatorCache.get(version);
  if (cached !== undefined) {
    return cached;
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const ajv = new (Ajv as unknown as new (opts: object) => AjvInstance)({
    allErrors: true,
    strict: false,
    validateFormats: true,
  });
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  addFormats(ajv);

  const schema = getSchema(version);
  const validate = ajv.compile(schema);
  validatorCache.set(version, validate);
  return validate;
}

/**
 * Validate output payload against the specified schema version
 */
export function validateOutput(version: SchemaVersion, payload: unknown): ValidationResult {
  assertValidSchemaVersion(version);

  const validate = getValidator(version);
  const valid = validate(payload);

  if (valid) {
    return { valid: true, errors: [] };
  }

  const rawErrors = validate.errors ?? [];
  const errors: ValidationError[] = rawErrors.map((err) => ({
    path: err.instancePath || '/',
    message: err.message ?? 'Unknown validation error',
    keyword: err.keyword,
  }));

  return { valid: false, errors };
}

/**
 * Validate output and throw an error if invalid
 */
export function validateOutputOrThrow(version: SchemaVersion, payload: unknown): void {
  const result = validateOutput(version, payload);
  if (!result.valid) {
    const errorMessages = result.errors
      .map((e) => `  ${e.path}: ${e.message} (${e.keyword})`)
      .join('\n');
    throw new Error(
      `Schema validation failed for version "${version}":\n${errorMessages}`
    );
  }
}

/**
 * Resolve schema version from multiple sources with precedence:
 * 1. CLI flag (explicit parameter)
 * 2. Environment variable: FINAL_RESULT_SCHEMA_VERSION
 * 3. Config file setting (passed as parameter)
 * 4. Default: v1
 */
export function resolveSchemaVersion(options: {
  cliVersion?: string | undefined;
  configVersion?: string | undefined;
}): SchemaVersion {
  // 1. CLI flag takes highest precedence
  if (options.cliVersion !== undefined && options.cliVersion !== '') {
    assertValidSchemaVersion(options.cliVersion);
    return options.cliVersion;
  }

  // 2. Environment variable
  const envVersion = process.env['FINAL_RESULT_SCHEMA_VERSION'];
  if (envVersion !== undefined && envVersion !== '') {
    assertValidSchemaVersion(envVersion);
    return envVersion;
  }

  // 3. Config file setting
  if (options.configVersion !== undefined && options.configVersion !== '') {
    assertValidSchemaVersion(options.configVersion);
    return options.configVersion;
  }

  // 4. Default
  return DEFAULT_SCHEMA_VERSION;
}
