import type { ConnectorTemplate } from './types.js'

export const connectorCatalog: ConnectorTemplate[] = [
  {
    id: 'DATABRICKS', label: 'Databricks', category: 'LAKEHOUSE', adapterType: 'DATABASE', transport: 'HTTPS',
    description: 'Run parameterized SQL against a Databricks SQL warehouse through Statement Execution API 2.0.',
    endpointPlaceholder: 'https://<workspace>.cloud.databricks.com', credentialRefPlaceholder: 'env:DATABRICKS_OAUTH_TOKEN', permissionPlaceholder: 'databricks.sql.read',
    operationVerb: 'QUERY', resourceFields: ['warehouse', 'catalog', 'schema', 'object'], parameterStyle: 'NAMED', docsUrl: 'https://docs.databricks.com/aws/en/dev-tools/sql-execution-tutorial',
  },
  {
    id: 'MICROSOFT_FABRIC', label: 'Microsoft Fabric', category: 'WAREHOUSE', adapterType: 'DATABASE', transport: 'TDS',
    description: 'Bind a Fabric Warehouse or Lakehouse SQL analytics endpoint over TDS with Microsoft Entra identity.',
    endpointPlaceholder: '<item-id>.datawarehouse.fabric.microsoft.com', credentialRefPlaceholder: 'env:FABRIC_SQL_ACCESS_TOKEN', permissionPlaceholder: 'fabric.warehouse.read',
    operationVerb: 'QUERY', resourceFields: ['workspace', 'database', 'schema', 'object'], parameterStyle: 'NAMED', docsUrl: 'https://learn.microsoft.com/en-us/fabric/data-warehouse/connectivity',
  },
  {
    id: 'SNOWFLAKE', label: 'Snowflake', category: 'WAREHOUSE', adapterType: 'DATABASE', transport: 'HTTPS',
    description: 'Execute governed SQL through Snowflake SQL API v2 with warehouse, database, schema, and role scoped externally.',
    endpointPlaceholder: 'https://<account>.snowflakecomputing.com', credentialRefPlaceholder: 'vault:snowflake/sql-api-jwt', permissionPlaceholder: 'snowflake.query.read',
    operationVerb: 'QUERY', resourceFields: ['warehouse', 'database', 'schema', 'object'], parameterStyle: 'POSITIONAL', docsUrl: 'https://docs.snowflake.com/en/developer-guide/sql-api/submitting-requests',
  },
  {
    id: 'BIGQUERY', label: 'Google BigQuery', category: 'WAREHOUSE', adapterType: 'DATABASE', transport: 'HTTPS',
    description: 'Bind Standard SQL jobs to a project, dataset, and governed table or view.',
    endpointPlaceholder: 'https://bigquery.googleapis.com', credentialRefPlaceholder: 'workload-identity:bigquery-runtime', permissionPlaceholder: 'bigquery.jobs.create,bigquery.tables.getData',
    operationVerb: 'QUERY', resourceFields: ['project', 'schema', 'object'], parameterStyle: 'NAMED', docsUrl: 'https://cloud.google.com/bigquery/docs/reference/rest/v2/jobs/query',
  },
  {
    id: 'POSTGRESQL', label: 'PostgreSQL', category: 'DATABASE', adapterType: 'DATABASE', transport: 'POSTGRES_WIRE',
    description: 'Bind a read-only parameterized query to a PostgreSQL database, schema, table, or view.',
    endpointPlaceholder: 'postgresql://db.example.internal:5432/governed', credentialRefPlaceholder: 'env:POSTGRES_CONNECTION_URL', permissionPlaceholder: 'postgres.context.read',
    operationVerb: 'QUERY', resourceFields: ['database', 'schema', 'object'], parameterStyle: 'POSITIONAL', docsUrl: 'https://www.postgresql.org/docs/current/libpq-connect.html',
  },
  {
    id: 'KAFKA', label: 'Apache Kafka', category: 'STREAM', adapterType: 'EVENT_STREAM', transport: 'KAFKA',
    description: 'Map an event envelope from a governed topic without embedding broker credentials in the contract.',
    endpointPlaceholder: 'broker.example.internal:9093', credentialRefPlaceholder: 'vault:kafka/context-consumer', permissionPlaceholder: 'kafka.topic.consume',
    operationVerb: 'SUBSCRIBE', resourceFields: ['topic'], parameterStyle: 'NONE', docsUrl: 'https://kafka.apache.org/documentation/#consumerapi',
  },
  {
    id: 'OBJECT_STORAGE', label: 'S3 / ADLS / OneLake', category: 'OBJECT_STORE', adapterType: 'FILE', transport: 'OBJECT_STORAGE',
    description: 'Bind Parquet, Delta, JSON, or CSV objects through a governed container and path.',
    endpointPlaceholder: 's3://bucket or abfss://container@account', credentialRefPlaceholder: 'workload-identity:object-reader', permissionPlaceholder: 'object.read',
    operationVerb: 'READ', resourceFields: ['container', 'object'], parameterStyle: 'NONE', docsUrl: 'https://learn.microsoft.com/en-us/fabric/onelake/onelake-access-api',
  },
  {
    id: 'OPENAPI', label: 'OpenAPI / REST', category: 'API', adapterType: 'OPENAPI', transport: 'HTTPS',
    description: 'Discover typed operations from an OpenAPI document and map response fields to governed properties.',
    endpointPlaceholder: 'https://api.example.internal', credentialRefPlaceholder: 'vault:api/context-reader', permissionPlaceholder: 'context.read',
    operationVerb: 'GET', resourceFields: [], parameterStyle: 'NAMED', docsUrl: 'https://spec.openapis.org/oas/latest.html',
  },
]

export function connectorTemplate(id: ConnectorTemplate['id']): ConnectorTemplate {
  const template = connectorCatalog.find((item) => item.id === id)
  if (!template) throw new Error(`UNKNOWN_CONNECTOR:${id}`)
  return template
}
