#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { loadSheetConfig } from './config.js';
import { DEFAULT_REPORT_DIRECTORY } from './constants.js';
import { commitStagingImport } from './database.js';
import { assertCommitReady, runPipeline } from './pipeline.js';
import { buildManifest, buildSanitizedReport, writeSanitizedArtifacts } from './report.js';
import { inspectInputFile, readConfiguredWorkbook } from './workbook.js';
import { validateWriteAuthorization } from './write-guard.js';

export async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(`${helpText()}\n`);
    return;
  }

  const config = await loadSheetConfig(options.configPath);
  const source = await inspectInputFile(options.filePath, env);
  const authorization = validateWriteAuthorization({
    commit: options.commit,
    confirmSha: options.confirmSha,
    sourceSha: source.sha256
  }, env);
  let workbook;
  try {
    workbook = await readConfiguredWorkbook(source.buffer, config);
  } finally {
    // Reduce el tiempo que la copia comprimida con PII permanece en memoria.
    source.buffer.fill(0);
    delete source.buffer;
  }
  const result = runPipeline({ workbook, source, config });

  let database = null;
  if (authorization.mode === 'commit') {
    assertCommitReady(result);
    database = await commitStagingImport(result, {
      databaseUrl: env.DATABASE_URL,
      uploadedBy: authorization.uploadedBy
    });
  }

  const report = buildSanitizedReport(result, { mode: authorization.mode, database });
  const manifest = buildManifest(result, report, authorization.mode);
  const artifacts = await writeSanitizedArtifacts({
    report,
    manifest,
    outputDirectory: options.reportDirectory
  });

  process.stdout.write(`${JSON.stringify({
    mode: authorization.mode,
    sourceSha256: report.source.sha256,
    totals: report.totals,
    database: report.database,
    artifacts
  }, null, 2)}\n`);
}

export function parseArguments(argv) {
  const options = {
    filePath: null,
    configPath: null,
    reportDirectory: DEFAULT_REPORT_DIRECTORY,
    commit: false,
    confirmSha: null,
    help: false
  };
  let explicitDryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case '--file':
        options.filePath = requireValue(argv, ++index, '--file');
        break;
      case '--config':
        options.configPath = requireValue(argv, ++index, '--config');
        break;
      case '--report-dir':
        options.reportDirectory = requireValue(argv, ++index, '--report-dir');
        break;
      case '--confirm-sha':
        options.confirmSha = requireValue(argv, ++index, '--confirm-sha').toLocaleLowerCase('en-US');
        break;
      case '--commit':
        options.commit = true;
        break;
      case '--dry-run':
        explicitDryRun = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw cliError('UNKNOWN_ARGUMENT');
    }
  }

  if (options.help) return options;
  if (!options.filePath) throw cliError('FILE_ARGUMENT_REQUIRED');
  if (explicitDryRun && options.commit) throw cliError('DRY_RUN_AND_COMMIT_CONFLICT');
  if (!options.commit && options.confirmSha) throw cliError('CONFIRM_SHA_ONLY_VALID_WITH_COMMIT');
  return options;
}

function helpText() {
  return `Uso:
  npm run audit -- --file <archivo.xlsx>

Dry-run es el modo predeterminado y no abre PostgreSQL.

Escritura explícita a staging:
  npm run audit -- --file <archivo.xlsx> --commit --confirm-sha <sha256>

Opciones:
  --file <ruta>          Archivo XLSX de entrada.
  --config <ruta>        Configuración JSON alternativa de hojas.
  --report-dir <ruta>    Directorio de reportes sanitizados (reports por defecto).
  --dry-run              Declara explícitamente el modo seguro predeterminado.
  --commit               Habilita la ruta de escritura; requiere las demás barreras.
  --confirm-sha <sha256> Confirma exactamente el hash mostrado por un dry-run previo.
  -h, --help             Muestra esta ayuda.`;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw cliError(`VALUE_REQUIRED_FOR_${flag.slice(2).toLocaleUpperCase('en-US')}`);
  return value;
}

function cliError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((error) => {
    const code = typeof error?.code === 'string' ? error.code : 'IMPORT_FAILED';
    process.stderr.write(`Error seguro: ${code}\n`);
    process.exitCode = 1;
  });
}
