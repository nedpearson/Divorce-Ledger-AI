import { Router, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import YAML from 'js-yaml';
import path from 'path';
import fs from 'fs';

const router = Router();

const API_VERSION = '1.0.0';

function getDocsDirectory(): string {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  return process.cwd() + '/server/routes';
}

let swaggerDocument: any = null;

function loadSwaggerDocument() {
  if (swaggerDocument) return swaggerDocument;

  const docsDir = getDocsDirectory();
  const yamlPath = path.join(docsDir, '../openapi/openapi.yaml');

  if (fs.existsSync(yamlPath)) {
    swaggerDocument = YAML.load(fs.readFileSync(yamlPath, 'utf8'));
    return swaggerDocument;
  }

  const altPath = path.join(process.cwd(), 'server/openapi/openapi.yaml');
  if (fs.existsSync(altPath)) {
    swaggerDocument = YAML.load(fs.readFileSync(altPath, 'utf8'));
    return swaggerDocument;
  }

  return null;
}

router.get('/openapi.yaml', (req: Request, res: Response) => {
  const docsDir = getDocsDirectory();
  let yamlPath = path.join(docsDir, '../openapi/openapi.yaml');

  if (!fs.existsSync(yamlPath)) {
    yamlPath = path.join(process.cwd(), 'server/openapi/openapi.yaml');
  }

  if (fs.existsSync(yamlPath)) {
    res.setHeader('Content-Type', 'text/yaml');
    res.setHeader('X-API-Version', API_VERSION);
    res.sendFile(path.resolve(yamlPath));
  } else {
    res.status(404).json({ error: 'OpenAPI specification not found' });
  }
});

router.get('/openapi.json', (req: Request, res: Response) => {
  const doc = loadSwaggerDocument();

  if (doc) {
    res.setHeader('X-API-Version', API_VERSION);
    res.json(doc);
  } else {
    res.status(404).json({ error: 'OpenAPI specification not found' });
  }
});

router.get('/version', (req: Request, res: Response) => {
  res.json({
    apiVersion: API_VERSION,
    versionStrategy: 'semantic',
    deprecationPolicy: {
      notice: '6 months before removal',
      sunsetHeader: 'Sunset header included for deprecated endpoints',
    },
    changelog: '/api/docs/changelog',
  });
});

router.get('/changelog', (req: Request, res: Response) => {
  res.json({
    versions: [
      {
        version: '1.0.0',
        date: '2026-01-05',
        changes: [
          'Initial API release',
          'Authentication endpoints',
          'Case management CRUD',
          'Violation documentation with AI classification',
          'Financial tracking (assets, debts, income, expenses)',
          'Evidence management with chain of custody',
          'Event streaming system',
          '5-tier subscription model',
        ],
      },
    ],
  });
});

const swaggerOptions = {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Divorce Ledger API Documentation',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
  },
};

router.use('/', (req: Request, res: Response, next) => {
  const doc = loadSwaggerDocument();
  if (doc) {
    swaggerUi.setup(doc, swaggerOptions)(req, res, next);
  } else {
    res.status(500).json({ error: 'Failed to load API documentation' });
  }
});

router.use('/', swaggerUi.serve);

export default router;
