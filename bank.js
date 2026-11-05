export const COUNTS = {
  'Historia': 200, 'Geografía': 200, 'Ciencia y naturaleza': 200,
  'Arte y literatura': 150, 'Deportes': 150,
  'Entretenimiento y cultura general': 150, 'Cine': 200,
  'Filosofía': 150, 'CrossFit': 200, 'Gramática de inglés': 200,
  'Capitales de países del mundo': 180, 'Mitología griega': 200,
  'Historia de los mundiales de fútbol y Juegos Olímpicos de verano': 200
};

export const BANK_SIZE = Object.values(COUNTS).reduce((sum, count) => sum + count, 0);

export function validateBank(bank) {
  if (!Array.isArray(bank) || bank.length !== BANK_SIZE) throw new Error('Se requieren ' + BANK_SIZE + ' preguntas');
  const ids = new Set(), texts = new Set(), counts = {}, levels = {};
  for (const q of bank) {
    const normalized = q.text?.normalize('NFKC').trim().toLocaleLowerCase('es');
    if (!q.id || ids.has(q.id) || !normalized || texts.has(normalized)) throw new Error('ID o enunciado duplicado');
    if (!Object.hasOwn(COUNTS, q.category)) throw new Error(`Categoría no válida: ${q.category}`);
    if (!['easy','medium','hard'].includes(q.difficulty)) throw new Error('Nivel no válido');
    if (!q.topic || !q.explanation?.trim()) throw new Error('Falta tema o explicación');
    if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some(x => typeof x !== 'string' || !x.trim()) || new Set(q.options.map(x => x.trim().toLowerCase())).size !== 4) throw new Error(`Opciones no válidas: ${q.text}`);
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) throw new Error('Respuesta no válida');
    if (q.category === 'Gramática de inglés' && !['B1','B2'].includes(q.cefr)) throw new Error('Falta nivel B1–B2');
    ids.add(q.id); texts.add(normalized);
    counts[q.category] = (counts[q.category] || 0) + 1;
    levels[q.difficulty] = (levels[q.difficulty] || 0) + 1;
  }
  for (const [category, count] of Object.entries(COUNTS)) if (counts[category] !== count) throw new Error(`Recuento incorrecto: ${category}`);
  for (const level of ['easy','medium','hard']) if ((levels[level] || 0) < 20) throw new Error('Nivel sin preguntas suficientes');
  return { total: bank.length, counts, levels };
}
