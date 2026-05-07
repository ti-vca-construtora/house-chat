const crypto = require('crypto');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const BIGQUERY_SCOPE = 'https://www.googleapis.com/auth/bigquery.readonly';
const TOKEN_TTL_SKEW_SECONDS = 60;
const DEFAULT_BIGQUERY_LOCATION = 'US';

let cachedToken = null;
let cachedDatasetLocation = null;

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function getServiceAccountCredentials() {
  const encoded = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64;
  if (!encoded) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS_BASE64 e obrigatorio para sincronizacao BigQuery');
  }

  let credentials;
  try {
    credentials = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch (error) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS_BASE64 invalido: esperado JSON de service account em base64');
  }

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('Credenciais Google invalidas: client_email e private_key sao obrigatorios');
  }

  return credentials;
}

function createJwt(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: credentials.client_email,
    scope: BIGQUERY_SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };

  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer
    .sign(credentials.private_key, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${unsigned}.${signature}`;
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + TOKEN_TTL_SKEW_SECONDS) {
    return cachedToken.accessToken;
  }

  const credentials = getServiceAccountCredentials();
  const assertion = createJwt(credentials);
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Erro ao autenticar no Google: ${payload.error_description || payload.error || response.statusText}`);
  }

  cachedToken = {
    accessToken: payload.access_token,
    expiresAt: now + Number(payload.expires_in || 3600),
  };

  return cachedToken.accessToken;
}

function parseValue(value, field) {
  if (value == null) return null;

  if (field.mode === 'REPEATED' && Array.isArray(value)) {
    return value.map((entry) => parseValue(entry?.v ?? entry, { ...field, mode: 'NULLABLE' }));
  }

  switch (field.type) {
    case 'RECORD':
    case 'STRUCT': {
      const nestedFields = field.fields || [];
      const cells = value.f || [];
      return Object.fromEntries(
        nestedFields.map((nestedField, index) => [
          nestedField.name,
          parseValue(cells[index]?.v, nestedField),
        ])
      );
    }
    case 'INTEGER':
    case 'INT64':
      return Number(value);
    case 'FLOAT':
    case 'FLOAT64':
    case 'NUMERIC':
    case 'BIGNUMERIC':
      return Number(value);
    case 'BOOLEAN':
    case 'BOOL':
      return value === true || value === 'true';
    case 'TIMESTAMP': {
      const asNumber = Number(value);
      return Number.isFinite(asNumber) ? new Date(asNumber * 1000).toISOString() : value;
    }
    default:
      return value;
  }
}

function parseRows(rows = [], schema) {
  const fields = schema?.fields || [];
  return rows.map((row) => {
    const output = {};
    row.f.forEach((cell, index) => {
      const field = fields[index];
      if (!field) return;
      output[field.name] = parseValue(cell.v, field);
    });
    return output;
  });
}

async function requestBigQuery(path, options = {}) {
  const token = await getAccessToken();
  const response = await fetch(`https://bigquery.googleapis.com/bigquery/v2${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Erro BigQuery: ${payload.error?.message || response.statusText}`);
  }

  return payload;
}

async function getDatasetLocation(projectId) {
  if (process.env.BIGQUERY_LOCATION) {
    return process.env.BIGQUERY_LOCATION;
  }

  if (cachedDatasetLocation) {
    return cachedDatasetLocation;
  }

  const dataset = process.env.BIGQUERY_DATASET;
  if (!dataset) {
    return DEFAULT_BIGQUERY_LOCATION;
  }

  const metadata = await requestBigQuery(`/projects/${projectId}/datasets/${dataset}`, {
    method: 'GET',
  });

  cachedDatasetLocation = metadata.location || DEFAULT_BIGQUERY_LOCATION;
  return cachedDatasetLocation;
}

async function queryRows(sql) {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  if (!projectId) {
    throw new Error('GOOGLE_CLOUD_PROJECT_ID e obrigatorio para sincronizacao BigQuery');
  }
  const location = await getDatasetLocation(projectId);

  let firstPage = await requestBigQuery(`/projects/${projectId}/queries`, {
    method: 'POST',
    body: JSON.stringify({
      query: sql,
      useLegacySql: false,
      maxResults: 10000,
      timeoutMs: 30000,
      location,
    }),
  });

  const jobReference = firstPage.jobReference;
  const jobLocation = jobReference.location || location;
  while (firstPage.jobComplete === false) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    firstPage = await requestBigQuery(
      `/projects/${jobReference.projectId}/queries/${jobReference.jobId}?maxResults=10000&timeoutMs=30000&location=${encodeURIComponent(jobLocation)}`,
      { method: 'GET' }
    );
  }

  let schema = firstPage.schema;
  let rows = parseRows(firstPage.rows, schema);
  let pageToken = firstPage.pageToken;

  while (pageToken) {
    const page = await requestBigQuery(
      `/projects/${jobReference.projectId}/queries/${jobReference.jobId}?maxResults=10000&pageToken=${encodeURIComponent(pageToken)}&location=${encodeURIComponent(jobLocation)}`,
      { method: 'GET' }
    );
    schema = schema || page.schema;
    rows = rows.concat(parseRows(page.rows, schema));
    pageToken = page.pageToken;
  }

  return rows;
}

async function getTableMetadata(tableId) {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const dataset = process.env.BIGQUERY_DATASET;
  if (!projectId || !dataset) {
    throw new Error('GOOGLE_CLOUD_PROJECT_ID e BIGQUERY_DATASET sao obrigatorios para sincronizacao BigQuery');
  }

  return requestBigQuery(
    `/projects/${encodeURIComponent(projectId)}/datasets/${encodeURIComponent(dataset)}/tables/${encodeURIComponent(tableId)}`,
    { method: 'GET' }
  );
}

module.exports = { queryRows, getDatasetLocation, getTableMetadata };
