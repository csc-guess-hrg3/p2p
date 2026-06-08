// Remonta o manual.html: novo shell responsivo (_head/_foot) + capítulos
// existentes. Envolve cada <table> em <div class="tbl"> para rolagem
// horizontal no mobile e moldura. Idempotente: extrai os capítulos do
// arquivo atual a partir do marcador do capítulo 1.
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const cur = fs.readFileSync(path.join(dir, 'manual.html'), 'utf8');
const head = fs.readFileSync(path.join(dir, '_head.html'), 'utf8');
const foot = fs.readFileSync(path.join(dir, '_foot.html'), 'utf8');

const MARK = '<!-- ==================== 1. APRESENTA';
const i = cur.indexOf(MARK);
if (i < 0) { console.error('Marcador do capítulo 1 não encontrado.'); process.exit(1); }

let chapters = cur.slice(i);
// remove qualquer fechamento de body/html e fechamentos de layout antigos
chapters = chapters.replace(/\s*<\/main>\s*<\/div>\s*<script[\s\S]*?<\/script>\s*$/i, '');
chapters = chapters.replace(/\s*<\/body>\s*<\/html>\s*$/i, '');

// Envolve tabelas (que ainda não estejam dentro de .tbl) para responsividade
chapters = chapters.replace(/<table>/g, '<div class="tbl"><table>')
                   .replace(/<\/table>/g, '</table></div>');

const out = head + '\n' + chapters.trim() + '\n\n' + foot;
fs.writeFileSync(path.join(dir, 'manual.html'), out, 'utf8');
console.log('manual.html remontado:', out.length, 'bytes');
