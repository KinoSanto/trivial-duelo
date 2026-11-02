"""Reproducible authoring tool. Facts are curated; options use same-column peers.
Do not use this tool to fetch or paraphrase third-party question banks.
"""
from pathlib import Path
import json, random, hashlib
ROOT = Path(__file__).resolve().parents[1]
rng = random.Random(20261102)
bank = []

def add(category, topic, text, answer, distractors, explanation, difficulty='medium', cefr=None):
    options = list(dict.fromkeys([str(answer), *map(str, distractors)]))[:4]
    assert len(options) == 4, (text, options)
    rng.shuffle(options)
    q = dict(id=hashlib.sha256((category+'|'+text).encode()).hexdigest()[:20],
             category=category, topic=topic, difficulty=difficulty, text=text,
             options=options, correct=options.index(str(answer)), explanation=explanation)
    if cefr: q['cefr'] = cefr
    bank.append(q)

def facts(filename, category, prompts, levels):
    rows = [line.split('|') for line in (ROOT/'content'/filename).read_text(encoding='utf-8').splitlines() if line and not line.startswith('#')]
    science_prompts = json.loads((ROOT/'content'/'science-prompts.json').read_text(encoding='utf-8')) if filename == 'ciencia.txt' else None
    for row_index, row in enumerate(rows):
        assert len(row) == len(prompts)+1, row
        title, *values = row
        for i, (prompt, answer) in enumerate(zip(prompts, values)):
            candidates = rows
            if filename == 'cine.txt' and i == 2:
                # Other members of these films' casts must never appear as distractors.
                exclusions = {
                  'Vértigo': ['James Stewart'],
                  'Pulp Fiction': ['Harvey Keitel'],
                  'Se7en': ['Brad Pitt'],
                  'Thelma y Louise': ['Harvey Keitel'],
                }.get(title, [])
                candidates = [r for r in rows if r[i+1] not in exclusions]
            if filename == 'cultura.txt' and i == 1:
                # Keep alternative media classes disjoint rather than using overlapping labels.
                group = lambda j: 0 if j < 5 else 1 if j < 15 else 2 if j < 30 else 4 if j < 35 else 5 if j < 43 else 6 if j < 46 else 7
                candidates = [r for j,r in enumerate(rows) if group(j) != group(row_index)]
            if filename == 'deportes.txt':
                overlaps = [{0,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19}, {20,21,22,23,24}, {25,26,27,28}, {29,30}, {31,32,33,34}, {35,36,37,38,39,40,41}, {43,44}, {45,46,47,48}]
                blocked = next((g for g in overlaps if row_index in g), {row_index})
                candidates = [r for j,r in enumerate(rows) if j not in blocked]
            peers = sorted({r[i+1] for r in candidates if r[i+1] != answer})
            distractors = rng.sample(peers, 3)
            if science_prompts and i in (1,3):
                text = science_prompts[row_index][0 if i == 1 else 1]
            else:
                text = prompt.format(t=title)
            add(category, title, text, answer, distractors, f'{title}: {answer}.', levels[i])

facts('historia.txt','Historia',[
    '¿En qué año tuvo lugar este acontecimiento: {t}?',
    '¿Con qué lugar se vincula directamente este acontecimiento: {t}?',
    '¿Qué figura o grupo se asocia con este acontecimiento: {t}?',
    '¿Qué descripción corresponde a este acontecimiento: {t}?'], ['hard','medium','medium','easy'])
facts('geografia.txt','Geografía',[
    '¿Cuál es la capital o sede federal de {t}?', '¿Qué moneda utiliza {t}?',
    'En el modelo de siete continentes, ¿a cuál pertenece la mayor parte de {t}?',
    '¿Cuál de estos lugares se encuentra en {t}?'], ['easy','hard','easy','medium'])
facts('ciencia.txt','Ciencia y naturaleza',[
    '¿Qué estudia o describe {t}?', '¿Qué concepto se relaciona directamente con {t}?',
    '¿Qué ejemplo corresponde a {t}?', '¿Qué afirmación sobre {t} es correcta?'], ['medium','hard','easy','medium'])
facts('arte.txt','Arte y literatura',[
    '¿Quién es el autor o la autora de {t}?', '¿A qué forma artística pertenece {t}?',
    '¿Qué personaje, motivo o rasgo se encuentra en {t}?'], ['medium','easy','hard'])
facts('deportes.txt','Deportes',[
    'En {t}, ¿qué elemento o equipamiento es característico?',
    '¿Qué acción o regla corresponde a {t}?',
    '¿Qué término se utiliza en {t}?'], ['easy','medium','hard'])
facts('cultura.txt','Entretenimiento y cultura general',[
    '¿Qué personaje, objeto o nombre está vinculado con {t}?',
    '¿A qué tipo de creación o actividad corresponde {t}?',
    '¿Qué rasgo distingue a {t}?'], ['easy','medium','hard'])
facts('cine.txt','Cine',[
    '¿Quién dirigió {t}?', '¿En qué año se estrenó originalmente {t}?',
    '¿Qué intérprete forma parte del reparto original (incluidas voces) de {t}?', '¿Qué personaje o elemento argumental pertenece a {t}?'], ['medium','hard','medium','easy'])
facts('filosofia.txt','Filosofía',[
    '¿Qué pensador se asocia con {t}?', '¿Qué idea se relaciona con {t}?',
    '¿Qué ámbito o problema aborda {t}?'], ['medium','hard','easy'])

# 200 distinct arithmetic/algebra/geometry/probability problems, with exact solutions.
for n in range(1, 21):
    add('Matemáticas','Ecuaciones', f'Resuelve 3x + {n} = {4*n+6}. ¿Cuánto vale x?', n+2,[n+1,n+3,n+4],f'Restando {n} y dividiendo entre 3 se obtiene x = {n+2}.','easy')
    add('Matemáticas','Porcentajes', f'Un artículo cuesta {20*n} €. Tiene un descuento del 15 %. ¿Cuánto pagas?',17*n,[16*n,18*n,19*n],f'El precio final es {20*n} × 0,85 = {17*n} €.','easy')
    add('Matemáticas','Áreas', f'Un triángulo tiene base {2*n+2} cm y altura 7 cm. ¿Cuál es su área en cm²?',7*(n+1),[14*(n+1),7*(n+2),7*n],f'Área = base × altura / 2 = {7*(n+1)} cm².','easy')
    add('Matemáticas','Medias', f'¿Cuál es la media aritmética de {n}, {n+4} y {n+11}?',n+5,[n+4,n+6,n+7],f'La suma es {3*n+15}; dividida entre 3 da {n+5}.','easy')
    add('Matemáticas','Probabilidad', f'Una bolsa contiene {n} bolas rojas y {2*n+1} azules. ¿Qué probabilidad hay de sacar una roja?',f'{n}/{3*n+1}',[f'{n}/{2*n+1}',f'{2*n+1}/{3*n+1}',f'1/{3*n+1}' if n!=1 else '1/2'],f'Hay {n} casos favorables entre {3*n+1} bolas.','medium')
    add('Matemáticas','Pendiente', f'¿Cuál es la pendiente de la recta que pasa por (0, {n}) y (2, {3*n+2})?',n+1,[n,n+2,2*n+2],f'Pendiente = ({3*n+2} − {n}) / 2 = {n+1}.','medium')
    add('Matemáticas','Potencias', f'Si 2 elevado a x es {2**(n+2)}, ¿cuánto vale x?',n+2,[n+1,n+3,n+4],f'2 elevado a {n+2} es {2**(n+2)}.','medium')
    add('Matemáticas','Derivadas', f'Si f(x) = {n+1}x² − 3x, ¿cuánto vale f′(2)?',4*(n+1)-3,[4*(n+1),2*(n+1)-3,4*(n+1)+3],f'f′(x) = {2*(n+1)}x − 3; al evaluar en 2 resulta {4*(n+1)-3}.','hard')
    add('Matemáticas','Combinatoria', f'¿De cuántas maneras se pueden elegir 2 personas de un grupo de {n+3}, sin importar el orden?',(n+3)*(n+2)//2,[(n+3)*(n+2),n+3,(n+3)*(n+4)//2],f'Combinaciones: {n+3} × {n+2} / 2 = {(n+3)*(n+2)//2}.','hard')
    add('Matemáticas','Progresiones', f'Una progresión geométrica empieza en {n+1} y tiene razón 3. ¿Cuál es el cuarto término?',27*(n+1),[9*(n+1),81*(n+1),3*(n+1)],f'El cuarto término es {n+1} × 3³ = {27*(n+1)}.','hard')

# CrossFit scenarios concern scoring/notation, not medical advice or changing competition standards.
for n in range(1,11):
    cases=[
      ('AMRAP',f'En un AMRAP, cada ronda tiene {n+4} air squats y 6 sit-ups. Completas 4 rondas y 3 air squats. ¿Cuántas repeticiones sumas?',4*(n+10)+3,[4*(n+10),4*(n+10)+6,5*(n+10)],f'Cuatro rondas de {n+10} repeticiones más 3: {4*(n+10)+3}.','medium'),
      ('EMOM',f'Un EMOM de {n+5} minutos prescribe 4 burpees al inicio de cada minuto. Si completas todo, ¿cuántos burpees haces?',4*(n+5),[n+5,4*(n+4),4*(n+6)],f'{n+5} intervalos × 4 burpees = {4*(n+5)}.','easy'),
      ('Carga',f'Una barra de 20 kg lleva un disco de {n+5} kg a cada lado, sin contar cierres. ¿Cuál es la carga total en kg?',20+2*(n+5),[20+n+5,2*(n+5),40+2*(n+5)],f'20 + 2 × {n+5} = {30+2*n} kg.','easy'),
      ('Rondas',f'Un WOD indica {n+2} rondas de 8 kettlebell swings. ¿Cuántos swings hay en total?',8*(n+2),[8*(n+1),8*(n+3),n+10],f'{n+2} × 8 = {8*(n+2)} swings.','easy'),
      ('Distancia',f'Un WOD contiene {n+2} rondas con 200 m de carrera por ronda. ¿Qué distancia total se corre, en metros?',200*(n+2),[100*(n+2),200*(n+1),400*(n+2)],f'{n+2} × 200 m = {200*(n+2)} m.','easy'),
      ('Intervalos',f'Completas {n+3} intervalos de 40 segundos de trabajo y 20 de descanso, incluido el último descanso. ¿Cuánto dura el bloque en segundos?',60*(n+3),[40*(n+3),60*(n+3)-20,80*(n+3)],f'Cada intervalo dura 60 s; {n+3} × 60 = {60*(n+3)} s.','medium'),
      ('For time',f'En un WOD for time tardas {n+4} minutos y 35 segundos. ¿Cuántos segundos son?',60*(n+4)+35,[60*(n+4)+53,60*(n+4),60*(n+5)+35],f'{n+4} × 60 + 35 = {60*(n+4)+35} s.','medium'),
      ('Volumen',f'En un registro de entrenamiento completas 5 series de 3 repeticiones de peso muerto a {n+30} kg. ¿Qué volumen carga × repeticiones registras en kg?',15*(n+30),[5*(n+30),3*(n+30),8*(n+30)],f'5 × 3 × {n+30} = {15*(n+30)} kg de volumen externo.','hard'),
      ('Escalado',f'Un WOD de práctica propone {10*(n+2)} repeticiones. El entrenador reduce el volumen al 60 %. ¿Cuántas repeticiones quedan?',6*(n+2),[4*(n+2),8*(n+2),10*(n+2)],f'{10*(n+2)} × 0,60 = {6*(n+2)}.','hard'),
      ('Relevos',f'En un WOD por parejas, alternáis tandas de 5 repeticiones sin trabajar a la vez. Cada persona completa {n+2} tandas. ¿Cuántas repeticiones suma la pareja?',10*(n+2),[5*(n+2),10*(n+1),10*(n+3)],f'2 personas × {n+2} tandas × 5 = {10*(n+2)}.','medium')]
    for topic,text,ans,ds,exp,level in cases: add('CrossFit',topic,text,ans,ds,exp,level)

for line in (ROOT/'content'/'crossfit.txt').read_text(encoding='utf-8').splitlines():
    if not line or line.startswith('#'): continue
    topic,text,answer,a,b,c,explanation,level=line.split('|')
    add('CrossFit',topic,text,answer,[a,b,c],explanation,level)

# English items are authored complete sentences, not translations or vocabulary drills.
for line in (ROOT/'content'/'ingles.txt').read_text(encoding='utf-8').splitlines():
    if not line or line.startswith('#'): continue
    level,topic,text,answer,a,b,c,explanation=line.split('|')
    add('Gramática de inglés',topic,text,answer,[a,b,c],explanation,'medium' if level=='B1' else 'hard',level)

(ROOT/'questions.json').write_text(json.dumps(bank,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'{len(bank)} preguntas generadas')
