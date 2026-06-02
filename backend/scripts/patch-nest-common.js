const fs = require('node:fs');
const path = require('node:path');

const target = path.resolve(
  __dirname,
  '..',
  'node_modules',
  '@nestjs',
  'common',
  'pipes',
  'parse-enum.pipe.js',
);

if (!fs.existsSync(target)) {
  console.warn('[patch-nest-common] parse-enum.pipe.js nao encontrado; pulando.');
  process.exit(0);
}

let source = fs.readFileSync(target, 'utf8');

if (source.includes('require("../enums/http-status.enum")')) {
  console.log('[patch-nest-common] @nestjs/common ja esta corrigido.');
  process.exit(0);
}

if (!source.includes('require("../index")')) {
  console.warn(
    '[patch-nest-common] Padrao esperado nao encontrado; revise @nestjs/common antes de subir.',
  );
  process.exit(0);
}

source = source
  .replace(
    'const index_1 = require("../index");',
    'const http_status_enum_1 = require("../enums/http-status.enum");',
  )
  .replace(
    'errorHttpStatusCode = index_1.HttpStatus.BAD_REQUEST',
    'errorHttpStatusCode = http_status_enum_1.HttpStatus.BAD_REQUEST',
  );

fs.writeFileSync(target, source);
console.log('[patch-nest-common] Corrigido ciclo de import do ParseEnumPipe.');
